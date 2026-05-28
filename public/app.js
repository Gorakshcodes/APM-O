(function () {
    'use strict';

    // ── State ──────────────────────────────────────────────────────────
    let conversationHistory = [];
    let currentModule = null;
    let responseCounter = 0;
    let attachedFiles = [];
    let currentAbortController = null;
    let isGenerating = false;
    let suppressAbortNotice = false;
    let requestSerial = 0;
    let activeRequestSerial = 0;

    const MODULE_NAMES = {
        eca: 'Equipment Criticality Analysis',
        rcm: 'RCM/FMEA Analysis',
        rca: 'Root Cause Analysis',
        analytics: 'Reliability Analytics',
        review: 'Report Quality Review'
    };

    const MODULE_CONTEXT = {
        eca: 'Using the Equipment Criticality Analysis module. Return a tabulated, report-ready output with Markdown tables suitable for Excel and PDF export: ',
        rcm: 'Using the RCM/FMEA Analysis module. Prepare a formal standard Excel-style and PDF-ready report. Show the on-screen output in clean Markdown tables with sections for report header, executive summary, FMEA/RCM register, maintenance plan, action tracker, and review/approval: ',
        rca: 'Using the Root Cause Analysis module. Prepare a standard colored business-style RCA report with report header, current date, incident summary, evidence table, timeline, 5-Why analysis table, and applicable Figma-style diagrams such as Ishikawa/fishbone cause-category diagrams, fault-tree blocks, or action-flow visuals. Diagrams must use colorful section headers, solid connectors, rounded labeled boxes, and business-report styling. Do not use dotted diagrams, ASCII art, text-only tree drawings, or code-block diagrams. Include root cause statement, corrective and preventive action plan, verification plan, owners, due dates, and review/approval section. Use Markdown tables for screen display and export: ',
        analytics: 'Using the Reliability Analytics module. Return calculations and results in tabulated report format suitable for Excel and PDF export: ',
        review: 'Using the Report Quality Review module. Return findings in a tabulated audit report format with severity, evidence, recommendation, owner, and status columns: '
    };

    // ── DOM references ─────────────────────────────────────────────────
    const chatMessages = document.getElementById('chatMessages');
    const userInput = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');
    const sendBtnIconPath = document.getElementById('sendBtnIconPath');
    const appLayout = document.getElementById('appLayout');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebarTogglePath = document.getElementById('sidebarTogglePath');
    const attachBtn = document.getElementById('attachBtn');
    const fileInput = document.getElementById('fileInput');
    const attachmentsList = document.getElementById('attachmentsList');
    const newChatBtn = document.getElementById('newChatBtn');
    const themeToggle = document.getElementById('themeToggle');
    const themeToggleLabel = document.getElementById('themeToggleLabel');
    const welcomeGate = document.getElementById('welcomeGate');
    const welcomeAgreeCheck = document.getElementById('welcomeAgreeCheck');
    const welcomeAgreeBtn = document.getElementById('welcomeAgreeBtn');

    if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    // ── Event listeners ────────────────────────────────────────────────
    initWelcomeGate();
    sendBtn.addEventListener('click', function () {
        if (isGenerating) {
            stopResponse();
            return;
        }
        sendMessage();
    });
    newChatBtn.addEventListener('click', function () {
        startNewChat();
    });
    initTheme();
    themeToggle.addEventListener('click', function () {
        setTheme(document.body.classList.contains('dark-mode') ? 'light' : 'dark');
    });
    attachBtn.addEventListener('click', function () {
        fileInput.click();
    });

    fileInput.addEventListener('change', function () {
        attachedFiles = attachedFiles.concat(Array.from(fileInput.files || []));
        fileInput.value = '';
        renderAttachmentList();
    });

    userInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Module buttons
    document.getElementById('moduleList').addEventListener('click', function (e) {
        const btn = e.target.closest('[data-module]');
        if (!btn) return;
        selectModule(btn.dataset.module);
    });

    if (sidebarToggle && appLayout) {
        sidebarToggle.addEventListener('click', function () {
            var collapsed = appLayout.classList.toggle('sidebar-collapsed');
            sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
            sidebarToggle.setAttribute('title', collapsed ? 'Show sidebar' : 'Hide sidebar');
            sidebarToggle.setAttribute('aria-label', collapsed ? 'Show sidebar' : 'Hide sidebar');
            if (sidebarTogglePath) {
                sidebarTogglePath.setAttribute('d', collapsed ? 'M9 5l7 7-7 7' : 'M15 19l-7-7 7-7');
            }
        });
    }

    function initWelcomeGate() {
        if (!welcomeGate || !welcomeAgreeCheck || !welcomeAgreeBtn) return;

        welcomeAgreeCheck.checked = false;
        welcomeAgreeBtn.disabled = true;
        welcomeGate.classList.remove('is-hidden');
        document.body.classList.add('welcome-locked');

        welcomeAgreeCheck.addEventListener('change', function () {
            welcomeAgreeBtn.disabled = !welcomeAgreeCheck.checked;
        });

        welcomeAgreeBtn.addEventListener('click', function () {
            if (!welcomeAgreeCheck.checked) return;
            welcomeGate.classList.add('is-hidden');
            document.body.classList.remove('welcome-locked');
            userInput.focus();
        });
    }

    // ── Module selection ───────────────────────────────────────────────
    function selectModule(module) {
        var changedModule = currentModule !== module;
        if (changedModule) {
            startNewChat({ silent: true, keepModule: false });
        }
        currentModule = module;

        // Update active state in sidebar
        document.querySelectorAll('.module-btn').forEach(function (b) {
            b.classList.toggle('active', b.dataset.module === module);
        });

        addSystemMessage('Started a new chat in ' + MODULE_NAMES[module] + ' mode.');
    }

    function startNewChat(options) {
        options = options || {};
        stopResponse({ silent: true });
        conversationHistory = [];
        responseCounter = 0;
        attachedFiles = [];
        userInput.value = '';
        renderAttachmentList();
        removeTypingIndicator();

        if (!options.keepModule) {
            currentModule = null;
            document.querySelectorAll('.module-btn').forEach(function (b) {
                b.classList.remove('active');
            });
        }

        chatMessages.innerHTML = '';
        addWelcomeMessage();

        if (!options.silent) {
            addSystemMessage('Started a new chat.');
        }
    }

    function addWelcomeMessage() {
        var div = document.createElement('div');
        div.className = 'chat-message flex items-start space-x-3';
        div.innerHTML =
            '<div class="bot-avatar">' +
                '<img src="/reliabot-logo.png" alt="Reliabot">' +
            '</div>' +
            '<div class="flex-1 message-content text-sm max-w-5xl">' +
                '<p>Welcome to <strong>APM-O</strong>, powered by Reliabot.</p>' +
                '<p class="mt-3">I can help you with:</p>' +
                '<ul class="mt-2 space-y-1 ml-4">' +
                    '<li>&bull; Equipment Criticality Analysis (ECA) with 5x5 risk matrix</li>' +
                    '<li>&bull; Reliability Centered Maintenance (RCM/RCM2) per SAE JA1011</li>' +
                    '<li>&bull; FMEA/FMECA Analysis with RPN calculations</li>' +
                    '<li>&bull; Root Cause Analysis (5-Whys, Ishikawa, TapRooT, Apollo, FTA)</li>' +
                    '<li>&bull; Reliability Analytics (Weibull, MTBF/MTTR, Survival Analysis)</li>' +
                '</ul>' +
                '<p class="mt-3 muted-text">Select a capability, attach source files, or ask for a standard FMEA, RCM, RCA, ECA, or reliability report.</p>' +
            '</div>';
        chatMessages.appendChild(div);
        scrollToBottom();
    }

    function initTheme() {
        var saved = localStorage.getItem('apmo-theme');
        var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        setTheme(saved || (prefersDark ? 'dark' : 'light'));
    }

    function setTheme(theme) {
        var dark = theme === 'dark';
        document.body.classList.toggle('dark-mode', dark);
        localStorage.setItem('apmo-theme', dark ? 'dark' : 'light');
        if (themeToggle) {
            themeToggle.setAttribute('aria-pressed', String(dark));
            themeToggle.setAttribute('title', dark ? 'Switch to light mode' : 'Switch to dark mode');
            themeToggle.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
        }
        if (themeToggleLabel) {
            themeToggleLabel.textContent = dark ? 'Light' : 'Dark';
        }
    }

    // ── Send message ───────────────────────────────────────────────────
    async function sendMessage() {
        if (isGenerating) return;

        const message = userInput.value.trim();
        if (!message && attachedFiles.length === 0) return;

        suppressAbortNotice = false;
        const requestController = new AbortController();
        const requestId = ++requestSerial;
        currentAbortController = requestController;
        activeRequestSerial = requestId;
        setGeneratingState(true);
        addUserMessage(message || 'Please review the attached file(s).', attachedFiles);

        let enhanced = message;
        var attachmentPrompt = '';
        if (attachedFiles.length > 0) {
            try {
                attachmentPrompt = await buildAttachmentPrompt(message);
                enhanced = attachmentPrompt;
            } catch (err) {
                setGeneratingState(false);
                addBotMessage('I could not read the attached file(s): ' + err.message);
                return;
            }
        }
        if (currentModule) {
            enhanced = MODULE_CONTEXT[currentModule] + (attachmentPrompt || message);
        }

        conversationHistory.push({ role: 'user', content: enhanced });
        userInput.value = '';
        attachedFiles = [];
        renderAttachmentList();

        showTypingIndicator();

        try {
            const data = await callAPI(requestController.signal);
            removeTypingIndicator();

            if (activeRequestSerial !== requestId) return;

            if (data.content && data.content.length > 0) {
                const text = data.content
                    .filter(function (b) { return b.type === 'text'; })
                    .map(function (b) { return b.text; })
                    .join('\n');

                conversationHistory.push({ role: 'assistant', content: text });
                responseCounter++;
                addBotMessage(text, responseCounter);
            } else {
                addBotMessage('I apologize, but I received an empty response. Please try again.');
            }
        } catch (err) {
            removeTypingIndicator();
            if (activeRequestSerial !== requestId) return;
            if (err.name === 'AbortError') {
                if (suppressAbortNotice) {
                    suppressAbortNotice = false;
                } else {
                    addSystemMessage('Reliabot response stopped.');
                }
            } else {
                addBotMessage('I apologize, but I encountered an error. Please try again. Error: ' + err.message);
            }
        }

        if (activeRequestSerial === requestId) {
            activeRequestSerial = 0;
            setGeneratingState(false);
        }
    }

    function stopResponse(options) {
        options = options || {};
        var wasGenerating = isGenerating;
        if (currentAbortController) {
            suppressAbortNotice = Boolean(options.silent);
            currentAbortController.abort();
        }
        activeRequestSerial = 0;
        removeTypingIndicator();
        setGeneratingState(false);
        if (wasGenerating && !options.silent) {
            addSystemMessage('Reliabot response stopped.');
        }
    }

    // ── API call (goes through our server proxy) ───────────────────────
    async function callAPI(signal) {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: conversationHistory }),
            signal: signal
        });

        if (!response.ok) {
            const body = await response.json().catch(function () { return {}; });
            throw new Error(body.error || response.status + ' ' + response.statusText);
        }

        return response.json();
    }

    // ── UI helpers ─────────────────────────────────────────────────────
    function setGeneratingState(generating) {
        isGenerating = generating;
        if (!generating) {
            currentAbortController = null;
        }
        sendBtn.disabled = false;
        sendBtn.classList.toggle('is-stopping', generating);
        sendBtn.setAttribute('title', generating ? 'Stop response' : 'Send');
        sendBtn.setAttribute('aria-label', generating ? 'Stop Reliabot response' : 'Send message');
        if (sendBtnIconPath) {
            sendBtnIconPath.setAttribute('d', generating
                ? 'M8 8h8v8H8z'
                : 'M10.5 12H4m0 0l16-7-7 16-2.5-9z');
        }
    }

    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // ── Message rendering ──────────────────────────────────────────────
    function addUserMessage(text, files) {
        files = files || [];
        var div = document.createElement('div');
        div.className = 'chat-message flex items-start space-x-3';
        var fileBadges = files.map(function (file) {
            return '<span class="attachment-chip">' + escapeHtml(file.name) + '</span>';
        }).join('');
        div.innerHTML =
            '<div class="user-avatar">' +
                '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
                    '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" ' +
                        'd="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>' +
                '</svg>' +
            '</div>' +
            '<div class="flex-1 message-content text-sm max-w-5xl">' +
                '<p>' + escapeHtml(text) + '</p>' +
                (fileBadges ? '<div class="attachment-chip-row">' + fileBadges + '</div>' : '') +
            '</div>';
        chatMessages.appendChild(div);
        scrollToBottom();
    }

    function renderAttachmentList() {
        if (!attachmentsList) return;
        if (attachedFiles.length === 0) {
            attachmentsList.innerHTML = '';
            return;
        }

        attachmentsList.innerHTML = attachedFiles.map(function (file, index) {
            return '<span class="attachment-chip">' +
                escapeHtml(file.name) +
                '<button type="button" data-remove-file="' + index + '" title="Remove attachment" aria-label="Remove ' + escapeHtml(file.name) + '">x</button>' +
            '</span>';
        }).join('');
    }

    document.addEventListener('click', function (e) {
        var removeBtn = e.target.closest('[data-remove-file]');
        if (!removeBtn) return;
        attachedFiles.splice(Number(removeBtn.dataset.removeFile), 1);
        renderAttachmentList();
    });

    async function buildAttachmentPrompt(message) {
        var parts = [];
        for (var i = 0; i < attachedFiles.length; i++) {
            parts.push(await extractFileContext(attachedFiles[i]));
        }

        return [
            message || 'Review the attached file(s) and prepare the requested reliability analysis.',
            '',
            'Attached file context:',
            parts.join('\n\n'),
            '',
            'Instructions for attached files:',
            '- Read the attached file context before answering.',
            '- Use the uploaded sample report format as a reference for FMEA, FMECA, RCM, and related reports.',
            '- If the question is complex, safety-critical, production-critical, approval-ready, or missing key asset/process details, ask one concise clarification question and wait for the user before producing the final report.',
            '- When preparing downloadable reports, follow the sample style: document header, revision/date, prepared/reviewed/approved fields, equipment/service/standard metadata, rating scale, RPN classification, main worksheet, RPN summary, RCM decision worksheet where relevant, task legend, maintenance strategy summary, notes, assumptions, and internal-use footer.'
        ].join('\n');
    }

    async function extractFileContext(file) {
        var ext = getFileExtension(file.name);
        try {
            if (ext === 'xlsx' || ext === 'xls') {
                return await extractWorkbookContext(file);
            }
            if (ext === 'pdf') {
                return await extractPdfContext(file);
            }
            return await extractTextContext(file);
        } catch (err) {
            return 'File: ' + file.name + '\nUnable to extract text in browser: ' + err.message;
        }
    }

    function getFileExtension(name) {
        var parts = name.toLowerCase().split('.');
        return parts.length > 1 ? parts.pop() : '';
    }

    async function extractWorkbookContext(file) {
        if (!window.XLSX) {
            throw new Error('Excel parser is not loaded');
        }

        var buffer = await file.arrayBuffer();
        var workbook = XLSX.read(buffer, { type: 'array' });
        var sheetSummaries = workbook.SheetNames.slice(0, 8).map(function (sheetName) {
            var sheet = workbook.Sheets[sheetName];
            var rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' })
                .slice(0, 35)
                .map(function (row) {
                    return row.slice(0, 16).map(function (cell) {
                        return String(cell).replace(/\s+/g, ' ').trim();
                    }).join(' | ');
                })
                .filter(Boolean);
            return 'Sheet: ' + sheetName + '\n' + rows.join('\n');
        });

        return trimContext('File: ' + file.name + '\nType: Excel workbook\n' + sheetSummaries.join('\n\n'));
    }

    async function extractPdfContext(file) {
        if (!window.pdfjsLib) {
            throw new Error('PDF parser is not loaded');
        }

        var buffer = await file.arrayBuffer();
        var pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
        var pages = [];
        var maxPages = Math.min(pdf.numPages, 8);
        for (var pageNumber = 1; pageNumber <= maxPages; pageNumber++) {
            var page = await pdf.getPage(pageNumber);
            var content = await page.getTextContent();
            var text = content.items.map(function (item) { return item.str; }).join(' ');
            pages.push('Page ' + pageNumber + ': ' + text.replace(/\s+/g, ' ').trim());
        }

        return trimContext('File: ' + file.name + '\nType: PDF document\nPages read: ' + maxPages + ' of ' + pdf.numPages + '\n' + pages.join('\n'));
    }

    async function extractTextContext(file) {
        var text = await file.text();
        return trimContext('File: ' + file.name + '\nType: ' + (file.type || 'text/data') + '\n' + text);
    }

    function trimContext(text) {
        var limit = 45000;
        if (text.length <= limit) return text;
        return text.slice(0, limit) + '\n[Attachment context truncated for length.]';
    }

    function addBotMessage(text, responseId) {
        var formatted = formatMessage(text);
        var hasTable = containsMarkdownTable(text);

        var div = document.createElement('div');
        div.className = 'chat-message flex items-start space-x-3';

        var excelBtn = '';
        if (hasTable) {
            excelBtn =
                '<div class="report-actions">' +
                    '<button class="download-btn icon-download-btn" data-action="excel" data-response="' + responseId + '" title="Download Excel report" aria-label="Download Excel report">' +
                        '<svg aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
                            '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" ' +
                                'd="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>' +
                        '</svg>' +
                        '<span>XLSX</span>' +
                    '</button>' +
                '</div>';
        }

        div.innerHTML =
            '<div class="bot-avatar">' +
                '<img src="/reliabot-logo.png" alt="Reliabot">' +
            '</div>' +
            '<div class="flex-1 max-w-none min-w-0">' +
                '<div id="response-' + responseId + '" class="message-content text-sm">' +
                    formatted +
                '</div>' +
                excelBtn +
                '<div class="pdf-download-section">' +
                    '<button class="pdf-download-btn icon-download-btn" data-action="pdf" data-response="' + responseId + '" title="Download PDF report" aria-label="Download PDF report">' +
                        '<svg aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
                            '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" ' +
                                'd="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>' +
                        '</svg>' +
                        '<span>PDF</span>' +
                    '</button>' +
                '</div>' +
            '</div>';

        chatMessages.appendChild(div);
        scrollToBottom();
    }

    function addSystemMessage(text) {
        var div = document.createElement('div');
        div.className = 'chat-message flex items-start space-x-3';
        div.innerHTML =
            '<div class="w-full">' +
                '<div class="system-message rounded-md px-4 py-2 text-center">' +
                    '<p class="text-xs">' + escapeHtml(text) + '</p>' +
                '</div>' +
            '</div>';
        chatMessages.appendChild(div);
        scrollToBottom();
    }

    // ── Typing indicator ───────────────────────────────────────────────
    function showTypingIndicator() {
        var div = document.createElement('div');
        div.id = 'typingIndicator';
        div.className = 'flex items-start space-x-3';
        div.innerHTML =
            '<div class="bot-avatar">' +
                '<img src="/reliabot-logo.png" alt="Reliabot">' +
            '</div>' +
            '<div class="flex-1 pt-1">' +
                '<div class="typing-indicator flex space-x-1">' +
                    '<span></span>' +
                    '<span></span>' +
                    '<span></span>' +
                '</div>' +
            '</div>';
        chatMessages.appendChild(div);
        scrollToBottom();
    }

    function removeTypingIndicator() {
        var el = document.getElementById('typingIndicator');
        if (el) el.remove();
    }

    // ── Markdown formatting ────────────────────────────────────────────
    function formatMessage(text) {
        // Tables first (before other replacements touch the pipe chars)
        text = convertMarkdownTables(text);

        // Code blocks
        text = text.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');

        // Inline code
        text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

        // Bold
        text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        // Headers
        text = text.replace(/^### (.*$)/gm, '<h3 class="text-base font-semibold mt-4 mb-2">$1</h3>');
        text = text.replace(/^## (.*$)/gm, '<h2 class="text-lg font-semibold mt-4 mb-2">$1</h2>');
        text = text.replace(/^# (.*$)/gm, '<h1 class="text-xl font-bold mt-4 mb-2">$1</h1>');

        // Bullet points
        text = text.replace(/^[\u2022\-]\s(.+)$/gm, '<div class="ml-4">&bull; $1</div>');

        // Numbered lists
        text = text.replace(/^\d+\.\s(.+)$/gm, '<div class="ml-4">$&</div>');

        // Line breaks
        text = text.replace(/\n/g, '<br>');

        return text;
    }

    function containsMarkdownTable(text) {
        var lines = text.split(/\r?\n/);
        for (var i = 0; i < lines.length - 1; i++) {
            if (isTableRow(lines[i]) && isSeparatorRow(lines[i + 1])) {
                return true;
            }
        }
        return false;
    }

    function convertMarkdownTables(text) {
        var lines = text.split(/\r?\n/);
        var output = [];
        var i = 0;

        while (i < lines.length) {
            if (i < lines.length - 1 && isTableRow(lines[i]) && isSeparatorRow(lines[i + 1])) {
                var headers = parseTableRow(lines[i]);
                var rows = [];
                i += 2;

                while (i < lines.length && isTableRow(lines[i])) {
                    rows.push(parseTableRow(lines[i]));
                    i++;
                }

                output.push(buildHtmlTable(headers, rows));
                continue;
            }

            output.push(escapeHtml(lines[i]));
            i++;
        }

        return output.join('\n');
    }

    function isTableRow(line) {
        return /^\s*\|.+\|\s*$/.test(line || '');
    }

    function isSeparatorRow(line) {
        if (!isTableRow(line)) return false;
        var cells = parseTableRow(line);
        return cells.length > 0 && cells.every(function (cell) {
            return /^:?-{3,}:?$/.test(cell.replace(/\s/g, ''));
        });
    }

    function parseTableRow(line) {
        return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (cell) {
            return cell.trim();
        });
    }

    function buildHtmlTable(headers, rows) {
        var html = '<div class="matrix-container"><table class="matrix-table">';
        html += '<thead><tr>';
        headers.forEach(function (h) { html += '<th>' + formatInlineMarkdown(escapeHtml(h)) + '</th>'; });
        html += '</tr></thead><tbody>';
        rows.forEach(function (row) {
            html += '<tr>';
            for (var i = 0; i < headers.length; i++) {
                html += '<td>' + formatInlineMarkdown(escapeHtml(row[i] || '')) + '</td>';
            }
            html += '</tr>';
        });
        html += '</tbody></table></div>';
        return html;
    }

    function formatInlineMarkdown(text) {
        return text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/`([^`]+)`/g, '<code>$1</code>');
    }

    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ── Download handlers (delegated) ──────────────────────────────────
    document.addEventListener('click', function (e) {
        var excelBtn = e.target.closest('[data-action="excel"]');
        if (excelBtn) {
            downloadAllTablesAsExcel(excelBtn.dataset.response);
            return;
        }

        var pdfBtn = e.target.closest('[data-action="pdf"]');
        if (pdfBtn) {
            generatePDFReport(pdfBtn.dataset.response, pdfBtn);
            return;
        }
    });

    // ── Excel download ─────────────────────────────────────────────────
    function downloadAllTablesAsExcel(responseId) {
        var el = document.getElementById('response-' + responseId);
        if (!el) return;

        var tables = el.getElementsByTagName('table');
        if (tables.length === 0) {
            alert('No tables found in this response');
            return;
        }

        var wb = XLSX.utils.book_new();
        var generatedAt = getReportDateParts();
        var title = getReportTitle(el);

        var coverData = [
            ['APM-O Business Report'],
            ['Report Title', title],
            ['Generated Date', generatedAt.displayDate],
            ['Generated Time', generatedAt.displayTime],
            ['Prepared By', 'Reliabot'],
            ['Portal', 'APM-O'],
            ['Export Format', 'Business-style Excel workbook'],
            [],
            ['Workbook Notes'],
            ['Each analysis table is exported as a separate worksheet for filtering, review, approval, and business sharing.']
        ];
        var coverSheet = XLSX.utils.aoa_to_sheet(coverData);
        coverSheet['!cols'] = [{ wch: 24 }, { wch: 70 }];
        XLSX.utils.book_append_sheet(wb, coverSheet, 'Report Info');

        Array.from(tables).forEach(function (table, index) {
            var wsData = [];

            var headers = Array.from(table.querySelectorAll('thead th')).map(function (th) {
                return th.textContent.trim();
            });
            if (headers.length > 0) wsData.push(headers);

            table.querySelectorAll('tbody tr').forEach(function (row) {
                var rowData = Array.from(row.querySelectorAll('td')).map(function (td) {
                    return td.textContent.trim();
                });
                wsData.push(rowData);
            });

            var ws = XLSX.utils.aoa_to_sheet(wsData);

            // Auto-size columns
            var colWidths = [];
            wsData.forEach(function (row) {
                row.forEach(function (cell, i) {
                    var len = cell ? cell.toString().length : 10;
                    colWidths[i] = Math.max(colWidths[i] || 10, len + 2);
                });
            });
            ws['!cols'] = colWidths.map(function (w) { return { wch: Math.min(w, 50) }; });

            var sheetName = getUniqueSheetName(wb, getSheetName(table, index));
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
        });

        XLSX.writeFile(wb, sanitizeFileName(title || 'APM-O_Report') + '_' + generatedAt.fileDate + '.xlsx');
    }

    function getReportTitle(el) {
        var heading = el.querySelector('h1, h2, h3');
        if (heading && heading.textContent.trim()) {
            return heading.textContent.trim();
        }
        return 'Reliability Engineering Analysis Report';
    }

    function getSheetName(table, index) {
        var node = table.parentElement;
        while (node && node !== document.body) {
            var prev = node.previousElementSibling;
            while (prev) {
                if (/^H[1-3]$/.test(prev.tagName) && prev.textContent.trim()) {
                    return sanitizeSheetName(prev.textContent.trim());
                }
                prev = prev.previousElementSibling;
            }
            node = node.parentElement;
        }
        return 'Table ' + (index + 1);
    }

    function sanitizeSheetName(name) {
        var cleaned = name.replace(/[\[\]*?:\/\\]/g, ' ').replace(/\s+/g, ' ').trim();
        return (cleaned || 'Table').slice(0, 31);
    }

    function getUniqueSheetName(wb, baseName) {
        var name = sanitizeSheetName(baseName);
        var candidate = name;
        var index = 2;

        while (wb.SheetNames.indexOf(candidate) !== -1) {
            var suffix = ' ' + index;
            candidate = name.slice(0, 31 - suffix.length) + suffix;
            index++;
        }

        return candidate;
    }

    function sanitizeFileName(name) {
        return name.replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 80);
    }

    function getReportDateParts() {
        var now = new Date();
        var dateParts = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Riyadh',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).formatToParts(now);
        var values = {};
        dateParts.forEach(function (part) {
            values[part.type] = part.value;
        });

        return {
            displayDate: new Intl.DateTimeFormat('en-GB', {
                timeZone: 'Asia/Riyadh',
                year: 'numeric',
                month: 'long',
                day: '2-digit'
            }).format(now),
            displayTime: new Intl.DateTimeFormat('en-GB', {
                timeZone: 'Asia/Riyadh',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            }).format(now),
            fileDate: values.year + '-' + values.month + '-' + values.day
        };
    }

    // ── PDF generation ─────────────────────────────────────────────────
    async function generatePDFReport(responseId, btn) {
        var el = document.getElementById('response-' + responseId);
        if (!el) return;

        var originalHTML = btn.innerHTML;
        btn.innerHTML = '<span>Generating PDF...</span>';
        btn.disabled = true;

        try {
            var cloned = el.cloneNode(true);
            var title = getReportTitle(el);
            var generatedAt = getReportDateParts();

            var container = document.createElement('div');
            container.style.position = 'absolute';
            container.style.left = '-9999px';
            container.style.width = '900px';
            container.style.padding = '44px';
            container.style.background = 'white';
            container.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            container.style.color = '#111827';
            container.style.fontSize = '13px';
            container.style.lineHeight = '1.55';

            var hdr = document.createElement('div');
            hdr.style.borderBottom = '4px solid #0f766e';
            hdr.style.padding = '0 0 18px';
            hdr.style.marginBottom = '26px';
            hdr.innerHTML =
                '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:24px;">' +
                    '<div>' +
                        '<div style="font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#0f766e;">APM-O</div>' +
                        '<h1 style="font-size:27px;font-weight:800;color:#111827;margin:7px 0 0;line-height:1.18;">' + escapeHtml(title) + '</h1>' +
                        '<div style="font-size:12px;color:#374151;margin-top:7px;font-weight:600;">Powered by Reliabot</div>' +
                    '</div>' +
                    '<table style="width:270px;border-collapse:collapse;font-size:11px;margin:0;color:#111827;">' +
                        '<tr><th style="text-align:left;background:#e0f2fe;border:1px solid #7dd3fc;padding:7px;color:#0f172a;">Document</th><td style="border:1px solid #bae6fd;padding:7px;color:#111827;">Business Report</td></tr>' +
                        '<tr><th style="text-align:left;background:#e0f2fe;border:1px solid #7dd3fc;padding:7px;color:#0f172a;">Date</th><td style="border:1px solid #bae6fd;padding:7px;color:#111827;">' + generatedAt.displayDate + '</td></tr>' +
                        '<tr><th style="text-align:left;background:#e0f2fe;border:1px solid #7dd3fc;padding:7px;color:#0f172a;">Time</th><td style="border:1px solid #bae6fd;padding:7px;color:#111827;">' + generatedAt.displayTime + '</td></tr>' +
                    '</table>' +
                '</div>';
            container.appendChild(hdr);

            container.appendChild(cloned);
            applyPdfReportStyles(cloned);

            // Style tables
            Array.from(container.getElementsByTagName('table')).forEach(function (table) {
                table.style.width = '100%';
                table.style.borderCollapse = 'collapse';
                table.style.margin = '14px 0 18px';
                table.style.fontSize = '10.5px';
                table.style.color = '#111827';
                table.style.background = '#ffffff';
                table.style.boxShadow = '0 0 0 1px #cbd5e1';
                Array.from(table.getElementsByTagName('th')).forEach(function (th) {
                    th.style.background = '#dbeafe';
                    th.style.border = '1px solid #93c5fd';
                    th.style.padding = '8px';
                    th.style.textAlign = 'left';
                    th.style.fontWeight = '800';
                    th.style.color = '#0f172a';
                    th.style.verticalAlign = 'top';
                });
                Array.from(table.getElementsByTagName('td')).forEach(function (td) {
                    td.style.border = '1px solid #cbd5e1';
                    td.style.padding = '7px 8px';
                    td.style.verticalAlign = 'top';
                    td.style.color = '#111827';
                    td.style.background = '#ffffff';
                });
            });

            // Footer
            var ftr = document.createElement('div');
            ftr.style.borderTop = '1px solid #e5e7eb';
            ftr.style.paddingTop = '16px';
            ftr.style.marginTop = '32px';
            ftr.style.fontSize = '10px';
            ftr.style.color = '#475569';
            ftr.style.textAlign = 'center';
            ftr.innerHTML =
                'This report was generated from APM-O, powered by Reliabot.<br>' +
                'Analysis follows industry standards: SAE JA1011 (RCM), IEC 60812 (FMEA), ISO 14224 (Failure Data)';
            container.appendChild(ftr);

            document.body.appendChild(container);

            var canvas = await html2canvas(container, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            });

            document.body.removeChild(container);

            var imgData = canvas.toDataURL('image/png');
            var jsPDF = window.jspdf.jsPDF;
            var pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

            var imgWidth = 210;
            var pageHeight = 297;
            var imgHeight = (canvas.height * imgWidth) / canvas.width;
            var heightLeft = imgHeight;
            var position = 0;

            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;

            while (heightLeft >= 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
            }

            pdf.save(sanitizeFileName(title || 'APM-O_Report') + '_' + generatedAt.fileDate + '.pdf');
        } catch (err) {
            console.error('PDF generation error:', err);
            alert('Error generating PDF. Please try again.');
        } finally {
            btn.innerHTML = originalHTML;
            btn.disabled = false;
        }
    }

    function applyPdfReportStyles(container) {
        container.querySelectorAll('*').forEach(function (node) {
            node.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            node.style.color = '#111827';
            node.style.textShadow = 'none';
            node.style.backgroundColor = node.tagName === 'CODE' || node.tagName === 'PRE' ? '#f8fafc' : node.style.backgroundColor;
        });

        var content = container.querySelector('.message-content');
        if (content) {
            content.style.color = '#111827';
            content.style.fontSize = '13px';
            content.style.lineHeight = '1.55';
            content.style.background = '#ffffff';
        }

        container.querySelectorAll('h1').forEach(function (heading) {
            heading.style.color = '#0f172a';
            heading.style.fontSize = '22px';
            heading.style.fontWeight = '800';
            heading.style.lineHeight = '1.2';
            heading.style.margin = '20px 0 10px';
            heading.style.paddingBottom = '7px';
            heading.style.borderBottom = '2px solid #0f766e';
        });

        container.querySelectorAll('h2').forEach(function (heading) {
            heading.style.color = '#075985';
            heading.style.fontSize = '17px';
            heading.style.fontWeight = '800';
            heading.style.lineHeight = '1.25';
            heading.style.margin = '18px 0 9px';
            heading.style.padding = '8px 10px';
            heading.style.background = '#e0f2fe';
            heading.style.borderLeft = '4px solid #0284c7';
        });

        container.querySelectorAll('h3').forEach(function (heading) {
            heading.style.color = '#115e59';
            heading.style.fontSize = '14px';
            heading.style.fontWeight = '800';
            heading.style.margin = '15px 0 8px';
        });

        container.querySelectorAll('p, li, div, span, strong, code, td, th').forEach(function (node) {
            node.style.color = '#111827';
        });

        container.querySelectorAll('strong').forEach(function (node) {
            node.style.fontWeight = '800';
        });

        container.querySelectorAll('pre, code').forEach(function (node) {
            node.style.background = '#f8fafc';
            node.style.border = '1px solid #cbd5e1';
            node.style.borderRadius = '4px';
            node.style.color = '#0f172a';
        });

        container.querySelectorAll('.matrix-container').forEach(function (node) {
            node.style.border = '0';
            node.style.background = '#ffffff';
            node.style.overflow = 'visible';
        });
    }
})();
