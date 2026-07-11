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
    let longResponseTimers = [];

    const MODULE_NAMES = {
        general: 'General',
        eca: 'Equipment Criticality Analysis',
        rcm: 'RCM/FMEA Analysis',
        rca: 'Root Cause Analysis',
        analytics: 'Reliability Analytics',
        review: 'Report Quality Review'
    };

    const TABLE_FORMAT_RULE = 'Format output cleanly and professionally for both the chatbox and downloadable report. The chatbox response must be readable, management-presentable, easy to scan, and free of broken formatting; the exported PDF/Excel report must be polished, complete, consistently structured, and suitable for reliability, maintenance, operations, and management review. Work in complete methodology steps only; never send a partial step, half table, half matrix, or unfinished register. Before broad specialist analysis, show the capability methodology and ask the user to choose compact scope, selected steps, or full workflow when scope is unclear. If the next step is too large, stop after the last complete step and ask the user to reply Continue for the next step. Use clear section titles, compact metadata, concise business wording, aligned tables, consistent column names, complete action/register rows, assumptions where data is missing, and review/approval fields for report outputs. Before sending, verify that headings are coherent, tables render as tables, matrices contain all points inside the matrix/table, and no rows or bullets are stranded outside their intended section. For Markdown tables, put a blank line before and after each table, include a separator row such as "|---|---|", keep each header on one line, do not output tab-separated plain text tables, do not split parenthetical headers across lines, use short headers such as "Frequency (12 months)", ensure every row has the same number of columns, and never split trailing cells onto a new line. If a table is too wide, split it into smaller tables or move long explanation into notes below the table. ';

    const MODULE_CONTEXT = {
        general: TABLE_FORMAT_RULE + 'Using the General module. Answer quick everyday reliability questions fast and directly using concise wording. Do not produce report format unless the user specifically asks for report format, PDF, Excel, or a full report. If the user asks for report format, prepare a structured report-ready output: ',
        eca: TABLE_FORMAT_RULE + 'Using the Equipment Criticality Analysis module. Use these steps: 1. Asset Definition, 2. Consequence Scoring, 3. Failure Mode Risk Assessment, 4. Frequency Assignment, 5. 5x5 Criticality Matrix, 6. Maintenance Strategy Selection. Return complete tabulated, report-ready output with Markdown tables suitable for Excel and PDF export. Do not include diagrams unless the user explicitly requests them. Complete each step before ending or moving on: ',
        rcm: TABLE_FORMAT_RULE + 'Using the RCM/FMEA Analysis module. Use these steps: 1. System and Function Definition, 2. Functional Failure Identification, 3. Failure Mode and Effects Analysis, 4. Severity/Occurrence/Detection or Criticality Scoring, 5. Risk Ranking, 6. Maintenance Task Selection, 7. Action Register and Review. Prepare a complete formal Excel-style and PDF-ready report using the sample FMEA workbook package structure when the scope fits. Use clean Markdown tables so Excel export creates clear workbook sheets. Do not include diagrams unless the user explicitly requests them. Avoid naming protected technical publications, proprietary methods, or branded frameworks unless the user explicitly provides the name and asks for source-specific context. Complete each step before ending or moving on: ',
        rca: TABLE_FORMAT_RULE + 'Using the Root Cause Analysis module. Use these steps: 1. Problem Definition, 2. Evidence and Timeline Capture, 3. Cause Analysis, 4. Root Cause Statement, 5. Corrective and Preventive Actions, 6. Verification and Effectiveness Review. Prepare a complete polished business-style RCA report with report header, current date, incident summary, evidence table, timeline, 5-Why analysis table, and mandatory RCA-only Figma/FigJam-ready visual diagrams for the downloadable report export. Include each diagram in this exact wrapper so the app can place it in the report export: [RCA_DIAGRAM: Diagram Title], then Mermaid graph LR syntax with quoted node labels, then [/RCA_DIAGRAM]. Do not expand large diagrams in the chat body. Complete each step before ending or moving on. Use Markdown tables for screen display and export: ',
        analytics: TABLE_FORMAT_RULE + 'Using the Reliability Analytics module. Use these steps: 1. Data Definition and Assumptions, 2. Data Quality Screening, 3. Metric or Model Selection, 4. Calculation, 5. Result Interpretation, 6. Reliability Improvement Actions. Return complete calculations and results in tabulated report format suitable for Excel and PDF export. Do not include diagrams unless the user explicitly requests them: ',
        review: TABLE_FORMAT_RULE + 'Using the Report Quality Review module. Use these steps: 1. Document Scope and Criteria, 2. Structure and Formatting Review, 3. Technical Completeness Review, 4. Data/Table/Calculation Check, 5. Findings Register, 6. Priority Correction Plan. Return complete findings in a tabulated audit report format with severity, evidence, recommendation, owner, and status columns. Do not include diagrams unless the user explicitly requests them: '
    };

    const MODULE_INTROS = {
        general: {
            title: 'General',
            lead: 'Use this capability for quick, fast answers to general reliability questions, short explanations, formulas, examples, and simple checks.',
            use: [
                'Ask direct questions such as definitions, quick calculations, formula meaning, or short reliability guidance.',
                'For a formal report, specifically say “prepare in report format”, “full report”, “PDF-ready”, or “Excel-ready”.'
            ],
            outputs: [
                'Fast concise answers',
                'Plain-English formulas',
                'Short examples and sample wording',
                'Quick checks before deeper analysis',
                'Report-ready output only when explicitly requested'
            ],
            prompt: 'Try: Explain MTBF in simple words, or prepare this answer in report format.'
        },
        eca: {
            title: 'Equipment Criticality Analysis',
            lead: 'Use this capability to rank assets by business, safety, environmental, production, and maintenance impact.',
            use: [
                'Share an equipment list, process area, failure history, downtime, production impact, safety/environment impact, or maintenance cost.',
                'Ask for a quick screening, a full ECA report, or a 5x5 risk matrix.'
            ],
            outputs: [
                'Criticality ranking and risk category',
                '5x5 risk matrix scoring',
                'High-priority asset list',
                'Recommended actions and review notes',
                'Excel/PDF-ready report tables'
            ],
            prompt: 'Try: Prepare an ECA for these assets and rank them by criticality.'
        },
        rcm: {
            title: 'RCM / FMEA Analysis',
            lead: 'Use this capability to analyze functions, failures, failure modes, effects, risk priority, and maintenance strategy.',
            use: [
                'Share the asset name, operating context, functions, known failure modes, downtime, inspection history, or maintenance tasks.',
                'Ask for FMEA, FMECA, RCM task selection, or a maintenance strategy report.'
            ],
            outputs: [
                'FMEA Worksheet with S/O/D and RPN',
                'RPN Summary ranked by priority',
                'FMECA criticality worksheet when data is available',
                'RCM Decision Worksheet',
                'Maintenance Strategy Summary',
                'Excel/PDF-ready workbook-style report'
            ],
            prompt: 'Try: Prepare a complete FMEA and RCM maintenance strategy for this pump.'
        },
        rca: {
            title: 'Root Cause Analysis',
            lead: 'Use this capability to investigate incidents, repeated failures, abnormal events, and reliability problems.',
            use: [
                'Share the event description, timeline, symptoms, evidence, failed parts, alarms, operating conditions, and actions already taken.',
                'Ask for a 5-Why analysis, fishbone cause analysis, corrective action plan, or full RCA report.'
            ],
            outputs: [
                'Problem statement and evidence register',
                'Timeline and 5-Why table',
                'Fishbone or cause-and-effect analysis',
                'Corrective and preventive action plan',
                'Verification/effectiveness checks',
                'Report-only diagrams in PDF export'
            ],
            prompt: 'Try: Prepare an RCA for this repeated bearing failure event.'
        },
        analytics: {
            title: 'Reliability Analytics',
            lead: 'Use this capability for reliability calculations, trend analysis, and failure data interpretation.',
            use: [
                'Share failure dates, operating hours, repair durations, censored/suspended data, or production uptime records.',
                'Ask for MTBF, MTTR, availability, Weibull, survival analysis, or reliability trend calculations.'
            ],
            outputs: [
                'Plain-English formulas and calculations',
                'MTBF, MTTR, availability, and failure rate',
                'Weibull and survival analysis summaries',
                'Reliability trend interpretation',
                'Excel/PDF-ready calculation tables'
            ],
            prompt: 'Try: Calculate MTBF, MTTR, and availability from this failure data.'
        },
        review: {
            title: 'Report Quality Review',
            lead: 'Use this capability to review reliability reports, PDFs, Excel files, and technical write-ups for quality and completeness.',
            use: [
                'Attach a PDF, Excel workbook, or paste report text.',
                'Ask for formatting issues, technical gaps, missing sections, readability, or business-report improvement recommendations.'
            ],
            outputs: [
                'Issue register with severity and evidence',
                'Formatting and readability findings',
                'Technical completeness gaps',
                'Recommended corrections',
                'Business-standard report improvement plan'
            ],
            prompt: 'Try: Review this FMEA report and list formatting, technical, and completeness issues.'
        }
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
    const visitorForm = document.getElementById('visitorForm');
    const visitorFormStatus = document.getElementById('visitorFormStatus');
    const visitorName = document.getElementById('visitorName');
    const visitorEmail = document.getElementById('visitorEmail');
    const visitorCompany = document.getElementById('visitorCompany');
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
        startNewChat({ keepModule: true, silent: true });
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
        if (!welcomeGate || !welcomeAgreeCheck || !welcomeAgreeBtn || !visitorForm) return;

        welcomeAgreeCheck.checked = false;
        welcomeAgreeBtn.disabled = true;
        showWelcomeGate('Checking registration...');

        welcomeAgreeCheck.addEventListener('change', function () {
            welcomeAgreeBtn.disabled = !welcomeAgreeCheck.checked;
        });

        visitorForm.addEventListener('submit', async function (event) {
            event.preventDefault();
            if (!welcomeAgreeCheck.checked) return;
            await registerVisitor();
        });

        verifyExistingVisitor();
    }

    function showWelcomeGate(statusText) {
        welcomeGate.classList.remove('is-hidden');
        document.body.classList.add('welcome-locked');
        setVisitorStatus(statusText || '');
    }

    async function verifyExistingVisitor() {
        try {
            var response = await fetch('/api/visitor/me', {
                credentials: 'same-origin',
                cache: 'no-store'
            });
            var data = await response.json().catch(function () { return {}; });
            if (response.ok && data.registered) {
                enterApp();
                return;
            }
        } catch (err) {
            // If the check fails, allow normal registration instead of blocking entry.
        }
        setVisitorStatus('');
        welcomeAgreeBtn.disabled = !welcomeAgreeCheck.checked;
    }

    async function registerVisitor() {
        setVisitorStatus('Saving your details...');
        welcomeAgreeBtn.disabled = true;
        try {
            var location = await getVisitorLocation();
            var response = await fetch('/api/visitor/register', {
                method: 'POST',
                credentials: 'same-origin',
                cache: 'no-store',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: visitorName.value,
                    email: visitorEmail.value,
                    company: visitorCompany.value,
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
                    locale: navigator.language || '',
                    latitude: location && location.latitude,
                    longitude: location && location.longitude,
                    accuracy: location && location.accuracy
                })
            });
            var data = await response.json().catch(function () { return {}; });
            if (!response.ok) {
                setVisitorStatus(data.error || 'Could not save your details.');
                welcomeAgreeBtn.disabled = !welcomeAgreeCheck.checked;
                return;
            }
            enterApp();
        } catch (err) {
            setVisitorStatus(err.message || 'Could not save your details.');
            welcomeAgreeBtn.disabled = !welcomeAgreeCheck.checked;
        }
    }

    function getVisitorLocation() {
        return new Promise(function (resolve) {
            if (!navigator.geolocation) return resolve(null);
            navigator.geolocation.getCurrentPosition(function (position) {
                resolve({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy
                });
            }, function () {
                resolve(null);
            }, {
                enableHighAccuracy: false,
                timeout: 3500,
                maximumAge: 600000
            });
        });
    }

    function setVisitorStatus(text) {
        if (visitorFormStatus) visitorFormStatus.textContent = text;
    }

    function enterApp() {
        welcomeGate.classList.add('is-hidden');
        document.body.classList.remove('welcome-locked');
        userInput.focus();
    }

    // ── Module selection ───────────────────────────────────────────────
    function selectModule(module) {
        currentModule = module;

        // Update active state in sidebar
        document.querySelectorAll('.module-btn').forEach(function (b) {
            b.classList.toggle('active', b.dataset.module === module);
        });

        startNewChat({ silent: true, keepModule: true });
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
        addWelcomeMessage(currentModule);

        if (!options.silent) {
            addSystemMessage('Started a new chat.');
        }
    }

    function addWelcomeMessage(module) {
        var intro = module ? MODULE_INTROS[module] : null;
        var div = document.createElement('div');
        div.className = 'chat-message flex items-start space-x-3';
        if (intro) {
            div.innerHTML =
                '<div class="bot-avatar">' +
                    '<img src="/reliabot-logo.png" alt="Reliabot">' +
                '</div>' +
                '<div class="flex-1 message-content text-sm max-w-5xl">' +
                    '<p><strong>' + escapeHtml(intro.title) + '</strong></p>' +
                    '<p class="mt-3">' + escapeHtml(intro.lead) + '</p>' +
                    '<p class="mt-3"><strong>How to use it:</strong></p>' +
                    buildIntroList(intro.use) +
                    '<p class="mt-3"><strong>Outputs you can get:</strong></p>' +
                    buildIntroList(intro.outputs) +
                    '<p class="mt-3 muted-text">' + escapeHtml(intro.prompt) + '</p>' +
                '</div>';
        } else {
            div.innerHTML =
            '<div class="bot-avatar">' +
                '<img src="/reliabot-logo.png" alt="Reliabot">' +
            '</div>' +
            '<div class="flex-1 message-content text-sm max-w-5xl">' +
                '<p>Welcome to <strong>O-APM</strong>, powered by Reliabot.</p>' +
                '<p class="mt-3">I can help you with:</p>' +
                '<ul class="mt-2 space-y-1 ml-4">' +
                    '<li>&bull; General quick answers, formulas, and examples</li>' +
                    '<li>&bull; Equipment Criticality Analysis (ECA) with 5x5 risk matrix</li>' +
                    '<li>&bull; Reliability Centered Maintenance (RCM) task selection</li>' +
                    '<li>&bull; FMEA/FMECA Analysis with RPN calculations</li>' +
                    '<li>&bull; Root Cause Analysis (5-Whys, fishbone cause analysis, fault tree analysis)</li>' +
                    '<li>&bull; Reliability Analytics (Weibull, MTBF/MTTR, Survival Analysis)</li>' +
                '</ul>' +
                '<p class="mt-3 muted-text">Select a capability, attach source files, or ask for a structured FMEA, RCM, RCA, ECA, or reliability report.</p>' +
            '</div>';
        }
        chatMessages.appendChild(div);
        scrollToBottom();
    }

    function buildIntroList(items) {
        return '<ul class="mt-2 space-y-1 ml-4">' + items.map(function (item) {
            return '<li>&bull; ' + escapeHtml(item) + '</li>';
        }).join('') + '</ul>';
    }

    function initTheme() {
        var saved = localStorage.getItem('oapm-theme');
        var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        setTheme(saved || (prefersDark ? 'dark' : 'light'));
    }

    function setTheme(theme) {
        var dark = theme === 'dark';
        document.body.classList.toggle('dark-mode', dark);
        localStorage.setItem('oapm-theme', dark ? 'dark' : 'light');
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
        startLongResponseNotices();

        try {
            const data = await callAPI(requestController.signal, message);
            clearLongResponseNotices();
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
            clearLongResponseNotices();
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
        clearLongResponseNotices();
        removeTypingIndicator();
        setGeneratingState(false);
        if (wasGenerating && !options.silent) {
            addSystemMessage('Reliabot response stopped.');
        }
    }

    // ── API call (goes through our server proxy) ───────────────────────
    async function callAPI(signal, routeText) {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: conversationHistory,
                module: currentModule || 'general',
                routeText: routeText || ''
            }),
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
            '- When preparing downloadable reports, follow the sample workbook style: document header, revision/date, prepared/reviewed/approved fields, equipment/service/guidance metadata, rating scale, RPN classification, FMEA Worksheet, RPN Summary, FMECA Worksheet where relevant, RCM Decision Worksheet where relevant, task type legend, Maintenance Strategy Summary, notes, assumptions, review/approval, export notes, and internal-use footer.',
            '- Avoid naming protected technical publications, proprietary methods, or branded frameworks unless the user explicitly provides the name and asks for source-specific context.'
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

    function startLongResponseNotices() {
        clearLongResponseNotices();
        longResponseTimers.push(setTimeout(function () {
            if (isGenerating) {
                addSystemMessage('This request is taking longer because Reliabot may be doing deeper analysis. You can wait for the full work, or stop and ask for a quick sample, a narrower scope, or report output in smaller batches.');
            }
        }, 14000));
        longResponseTimers.push(setTimeout(function () {
            if (isGenerating) {
                addSystemMessage('Still working. For complex reports, source checks, or document review, Reliabot can continue longer and may finish in sections. Stop only if you want to reduce the scope.');
            }
        }, 45000));
    }

    function clearLongResponseNotices() {
        longResponseTimers.forEach(function (timer) {
            clearTimeout(timer);
        });
        longResponseTimers = [];
    }

    // ── Markdown formatting ────────────────────────────────────────────
    function formatMessage(text) {
        text = normalizeMathText(text);
        var rcaDiagrams = [];
        text = extractRcaDiagramBlocks(text, rcaDiagrams);

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
        text = restoreRcaDiagramBlocks(text, rcaDiagrams);

        return text;
    }

    function extractRcaDiagramBlocks(text, diagrams) {
        return text.replace(/\[RCA_DIAGRAM:\s*([^\]]+)\]([\s\S]*?)\[\/RCA_DIAGRAM\]/gi, function (_, title, syntax) {
            var token = '@@RCA_DIAGRAM_' + diagrams.length + '@@';
            diagrams.push(buildRcaDiagramHtml(title, syntax));
            return token;
        });
    }

    function restoreRcaDiagramBlocks(text, diagrams) {
        diagrams.forEach(function (html, index) {
            text = text.replace('@@RCA_DIAGRAM_' + index + '@@', html);
        });
        return text;
    }

    function buildRcaDiagramHtml(title, syntax) {
        var parsed = parseMermaidFlow(syntax);
        var note = '<div class="rca-diagram-chat-note">' +
            '<strong>RCA diagram prepared for report export:</strong> ' + escapeHtml(title) +
            '. The visual diagram is included in the downloadable PDF report and is not expanded in the chat window.' +
        '</div>';
        if (!parsed.nodes.length) {
            return note + '<section class="rca-figma-diagram" data-title="' + escapeHtml(title) + '">' +
                '<div class="rca-diagram-header">' + escapeHtml(title) + '</div>' +
                '<div class="rca-diagram-empty">Diagram data unavailable</div>' +
            '</section>';
        }

        var html = note + '<section class="rca-figma-diagram" data-title="' + escapeHtml(title) + '">' +
            '<div class="rca-diagram-header">' + escapeHtml(title) + '</div>' +
            '<div class="rca-diagram-canvas">';

        parsed.nodes.forEach(function (node, index) {
            html += '<div class="rca-diagram-node" data-node="' + escapeHtml(node.id) + '">' +
                '<span class="rca-node-index">' + (index + 1) + '</span>' +
                '<span>' + escapeHtml(node.label) + '</span>' +
            '</div>';
            if (index < parsed.nodes.length - 1) {
                html += '<div class="rca-diagram-arrow" aria-hidden="true"></div>';
            }
        });

        html += '</div>';

        if (parsed.edges.length) {
            html += '<div class="rca-diagram-links">';
            parsed.edges.slice(0, 10).forEach(function (edge) {
                html += '<span>' + escapeHtml(edge.fromLabel) + ' -> ' + escapeHtml(edge.toLabel) + '</span>';
            });
            html += '</div>';
        }

        html += '</section>';
        return html;
    }

    function parseMermaidFlow(syntax) {
        var nodeMap = {};
        var order = [];
        var edges = [];
        String(syntax || '').split(/\r?\n/).forEach(function (line) {
            var trimmed = line.trim();
            if (!trimmed || /^(graph|flowchart)\s+/i.test(trimmed)) return;
            var edge = parseMermaidEdge(trimmed);
            if (!edge) {
                var nodeOnly = trimmed.match(/^([A-Za-z0-9_]+)\s*\[("[^"]+"|'[^']+'|[^\]]+)\]/);
                if (nodeOnly) addDiagramNode(nodeOnly[1], cleanDiagramLabel(nodeOnly[2]), nodeMap, order);
                return;
            }
            addDiagramNode(edge.from.id, edge.from.label, nodeMap, order);
            addDiagramNode(edge.to.id, edge.to.label, nodeMap, order);
            edges.push({ from: edge.from.id, to: edge.to.id, fromLabel: nodeMap[edge.from.id].label, toLabel: nodeMap[edge.to.id].label });
        });

        return {
            nodes: order.map(function (id) { return nodeMap[id]; }),
            edges: edges
        };
    }

    function parseMermaidEdge(line) {
        var parts = line.split(/--(?:>|[^-]*-->)|==>/);
        if (parts.length < 2) return null;
        var from = parseMermaidNode(parts[0]);
        var to = parseMermaidNode(parts.slice(1).join('-->'));
        if (!from || !to) return null;
        return { from: from, to: to };
    }

    function parseMermaidNode(token) {
        var cleaned = String(token || '').trim().replace(/^\|[^|]*\|/, '').trim();
        var match = cleaned.match(/^([A-Za-z0-9_]+)(?:\s*\[("[^"]+"|'[^']+'|[^\]]+)\])?/);
        if (!match) return null;
        return {
            id: match[1],
            label: match[2] ? cleanDiagramLabel(match[2]) : match[1]
        };
    }

    function addDiagramNode(id, label, nodeMap, order) {
        if (!nodeMap[id]) {
            nodeMap[id] = { id: id, label: label || id };
            order.push(id);
        } else if (label && nodeMap[id].label === id) {
            nodeMap[id].label = label;
        }
    }

    function cleanDiagramLabel(label) {
        return String(label || '')
            .replace(/^["']|["']$/g, '')
            .replace(/^\[/, '')
            .replace(/\]$/, '')
            .trim();
    }

    function normalizeMathText(text) {
        return text
            .replace(/\$\$([\s\S]*?)\$\$/g, function (_, expr) {
                return formatPlainFormula(expr);
            })
            .replace(/\\\[([\s\S]*?)\\\]/g, function (_, expr) {
                return formatPlainFormula(expr);
            })
            .replace(/\\\(([\s\S]*?)\\\)/g, function (_, expr) {
                return formatPlainFormula(expr);
            })
            .replace(/\$([^$\n]+)\$/g, function (_, expr) {
                return formatPlainFormula(expr);
            });
    }

    function formatPlainFormula(expr) {
        return expr
            .replace(/\\text\{([^{}]*)\}/g, '$1')
            .replace(/\\mathrm\{([^{}]*)\}/g, '$1')
            .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '$1 / $2')
            .replace(/\\lambda/g, 'lambda')
            .replace(/\\times/g, 'x')
            .replace(/\\div/g, '/')
            .replace(/\\cdot/g, 'x')
            .replace(/\\left|\\right/g, '')
            .replace(/\\[a-zA-Z]+/g, '')
            .replace(/[{}]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function containsMarkdownTable(text) {
        var lines = text.split(/\r?\n/);
        for (var i = 0; i < lines.length - 1; i++) {
            if (isTableStart(lines, i)) {
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
            if (isTableStart(lines, i)) {
                var headers = parseTableRow(lines[i]);
                var rows = [];
                i += 2;

                while (i < lines.length) {
                    if (isTableStart(lines, i)) {
                        break;
                    }

                    if (isTableRow(lines[i])) {
                        var row = parseTableRow(lines[i]);
                        keepOrMergeTableRow(rows, row, headers, lines, i);
                        i++;
                        continue;
                    }

                    if (isIgnorableTableGap(lines, i)) {
                        i++;
                        continue;
                    }

                    if (isPartialTableRow(lines[i])) {
                        var partialRow = parseTableRow(lines[i]);
                        keepOrMergeTableRow(rows, partialRow, headers, lines, i);
                        i++;
                        continue;
                    }

                    break;
                }

                while (rows.length && rows[rows.length - 1].every(function (cell) { return !cell; })) {
                    rows.pop();
                }

                output.push(buildHtmlTable(headers, rows));
                continue;
            }

            if (isPlainTableStart(lines, i)) {
                var plainTable = collectPlainTable(lines, i);
                output.push(buildHtmlTable(plainTable.headers, plainTable.rows));
                i = plainTable.nextIndex;
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

    function isPartialTableRow(line) {
        return /^\s*\|.+/.test(line || '') && !isTableRow(line) && parseTableRow(line).length > 1;
    }

    function isSeparatorRow(line) {
        if (!isTableRow(line)) return false;
        var cells = parseTableRow(line);
        return cells.length > 0 && cells.every(function (cell) {
            return /^:?-{3,}:?$/.test(cell.replace(/\s/g, ''));
        });
    }

    function isTableStart(lines, index) {
        return index < lines.length - 1 && isTableRow(lines[index]) && isSeparatorRow(lines[index + 1]);
    }

    function parseTableRow(line) {
        return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (cell) {
            return cell.trim();
        });
    }

    function parsePlainTableRow(line) {
        return String(line || '').split(/\t+/).map(function (cell) {
            return cell.trim();
        }).filter(function (cell) {
            return cell.length > 0;
        });
    }

    function parseLoosePipeCells(line) {
        return String(line || '').split('|').map(function (cell) {
            return cell.trim();
        }).filter(function (cell) {
            return cell.length > 0;
        });
    }

    function isPlainTableStart(lines, index) {
        var headers = parsePlainTableRow(lines[index]);
        if (headers.length < 2) return false;
        var next = nextMeaningfulLine(lines, index + 1);
        if (!next || isTableStart(lines, next.index)) return false;
        return isPlainTableDataLine(next.line) || isTableRow(next.line) || isPartialTableRow(next.line);
    }

    function isPlainTableDataLine(line) {
        return parsePlainTableRow(line).length > 1;
    }

    function collectPlainTable(lines, startIndex) {
        var headers = parsePlainTableRow(lines[startIndex]);
        var rows = [];
        var i = startIndex + 1;

        while (i < lines.length) {
            if (isSectionBreak(lines[i]) || isTableStart(lines, i)) {
                break;
            }

            if (isBlankLine(lines[i])) {
                var next = nextMeaningfulLine(lines, i + 1);
                if (next && !isSectionBreak(next.line) && isPlainTableContinuationLine(next.line, rows, headers)) {
                    i++;
                    continue;
                }
                break;
            }

            if (isTableRow(lines[i]) || isPartialTableRow(lines[i])) {
                keepOrMergeTableRow(rows, parseTableRow(lines[i]), headers, lines, i);
                i++;
                continue;
            }

            if (isPlainTableDataLine(lines[i])) {
                keepOrMergeTableRow(rows, parsePlainTableRow(lines[i]), headers, lines, i);
                i++;
                continue;
            }

            if (isLoosePipeContinuation(lines[i], rows, headers)) {
                mergeContinuationCells(rows[rows.length - 1], parseLoosePipeCells(lines[i]), headers);
                i++;
                continue;
            }

            if (shouldAppendTextToPreviousCell(rows, headers)) {
                appendToPreviousCell(rows[rows.length - 1], lines[i]);
                i++;
                continue;
            }

            break;
        }

        return { headers: headers, rows: normalizeTableRows(rows, headers), nextIndex: i };
    }

    function isIgnorableTableGap(lines, index) {
        if (!/^\s*$/.test(lines[index] || '')) return false;
        var next = nextMeaningfulLine(lines, index + 1);
        return next && !isTableStart(lines, next.index) && (isTableRow(next.line) || isPartialTableRow(next.line));
    }

    function shouldKeepTableRow(row, headers, lines, index) {
        if (!row.length || row.every(function (cell) { return !cell; })) return false;
        if (isDuplicatePartialRow(row, headers, lines, index)) return false;
        return row.length <= headers.length + 2;
    }

    function keepOrMergeTableRow(rows, row, headers, lines, index) {
        if (!shouldKeepTableRow(row, headers, lines, index)) return;
        var previous = rows[rows.length - 1];
        if (shouldMergeContinuationRow(previous, row, headers)) {
            mergeContinuationCells(previous, row, headers);
            return;
        }
        rows.push(row);
    }

    function shouldMergeContinuationRow(previous, row, headers) {
        if (!previous || previous.length >= headers.length) return false;
        if (!row.length || previous.length + row.length - 1 > headers.length) return false;
        if (looksLikeNumberedTableRow(row)) return false;
        if (previous.length < Math.max(2, Math.floor(headers.length / 2))) return false;
        return row.length <= Math.max(3, headers.length - previous.length);
    }

    function mergeContinuationCells(previous, cells, headers) {
        if (!previous || !cells.length) return;
        if (previous.length + cells.length <= headers.length) {
            Array.prototype.push.apply(previous, cells);
            return;
        }

        appendToPreviousCell(previous, cells[0]);
        Array.prototype.push.apply(previous, cells.slice(1));
    }

    function normalizeTableRows(rows, headers) {
        return rows.map(function (row) {
            var normalized = row.slice(0, headers.length);
            while (normalized.length < headers.length) {
                normalized.push('');
            }
            return normalized;
        });
    }

    function isPlainTableContinuationLine(line, rows, headers) {
        return isTableRow(line) ||
            isPartialTableRow(line) ||
            isPlainTableDataLine(line) ||
            isLoosePipeContinuation(line, rows, headers);
    }

    function isLoosePipeContinuation(line, rows, headers) {
        if (!rows.length || rows[rows.length - 1].length >= headers.length) return false;
        var cells = parseLoosePipeCells(line);
        return cells.length > 0 && cells.length <= headers.length;
    }

    function shouldAppendTextToPreviousCell(rows, headers) {
        return rows.length > 0 && rows[rows.length - 1].length > 0 && rows[rows.length - 1].length < headers.length;
    }

    function appendToPreviousCell(row, text) {
        var index = row.length - 1;
        row[index] = (row[index] ? row[index] + ' ' : '') + String(text || '').trim();
    }

    function isBlankLine(line) {
        return /^\s*$/.test(line || '');
    }

    function isSectionBreak(line) {
        return /^\s*-{3,}\s*$/.test(line || '') || /^#{1,6}\s+\S/.test(line || '');
    }

    function looksLikeNumberedTableRow(row) {
        var first = String(row[0] || '').trim();
        return /^\d+$/.test(first) && row.length > 2;
    }

    function isDuplicatePartialRow(row, headers, lines, index) {
        if (row.length >= headers.length) return false;
        var next = nextMeaningfulLine(lines, index + 1);
        if (!next || (!isTableRow(next.line) && !isPartialTableRow(next.line))) return false;
        var nextRow = parseTableRow(next.line);
        if (nextRow.length < headers.length || !row[0] || row[0] !== nextRow[0]) return false;
        for (var i = 1; i < row.length; i++) {
            if (row[i] !== nextRow[i]) return false;
        }
        return true;
    }

    function nextMeaningfulLine(lines, start) {
        for (var i = start; i < lines.length; i++) {
            if (!/^\s*$/.test(lines[i] || '')) {
                return { line: lines[i], index: i };
            }
        }
        return null;
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
        wb.Props = {
            Title: title,
            Subject: 'Reliability engineering report',
            Author: 'Reliabot',
            Company: 'O-APM',
            CreatedDate: new Date()
        };

        var coverData = [
            ['O-APM BUSINESS REPORT'],
            [],
            ['Report Title', title],
            ['Generated Date', generatedAt.displayDate],
            ['Generated Time', generatedAt.displayTime],
            ['Prepared By', 'Reliabot'],
            ['Portal', 'O-APM'],
            ['Export Format', 'Business Excel workbook'],
            ['Review Status', 'For qualified engineering review'],
            [],
            ['Workbook Notes'],
            ['Each analysis table is exported as a separate worksheet for filtering, review, approval, and business sharing.'],
            ['Use the register sheets for action tracking, owner assignment, and close-out review.'],
            [],
            ['Sheet Index']
        ];
        Array.from(tables).forEach(function (table, index) {
            coverData.push([index + 1, getSheetName(table, index)]);
        });
        var coverSheet = XLSX.utils.aoa_to_sheet(coverData);
        coverSheet['!cols'] = [{ wch: 24 }, { wch: 86 }];
        coverSheet['!freeze'] = { xSplit: 0, ySplit: 2 };
        coverSheet['!autofilter'] = { ref: 'A14:B' + Math.max(14, coverData.length) };
        applyWorksheetStyleHints(coverSheet, coverData.length, 2);
        XLSX.utils.book_append_sheet(wb, coverSheet, 'Report Info');

        Array.from(tables).forEach(function (table, index) {
            var wsData = [];
            var sectionTitle = getSheetName(table, index);
            var generatedAtText = generatedAt.displayDate + ' ' + generatedAt.displayTime;

            var headers = Array.from(table.querySelectorAll('thead th')).map(function (th) {
                return th.textContent.trim();
            });
            wsData.push([sectionTitle]);
            wsData.push(['Report Title', title]);
            wsData.push(['Generated', generatedAtText]);
            wsData.push([]);
            if (headers.length > 0) wsData.push(headers);

            table.querySelectorAll('tbody tr').forEach(function (row) {
                var rowData = Array.from(row.querySelectorAll('td')).map(function (td) {
                    return td.textContent.trim();
                });
                wsData.push(rowData);
            });

            var ws = XLSX.utils.aoa_to_sheet(wsData);

            var range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
            ws['!freeze'] = { xSplit: 0, ySplit: 5 };
            if (headers.length > 0) {
                var filterRange = {
                    s: { r: 4, c: 0 },
                    e: { r: Math.max(4, range.e.r), c: Math.max(0, headers.length - 1) }
                };
                ws['!autofilter'] = { ref: XLSX.utils.encode_range(filterRange) };
            }

            var colWidths = [];
            wsData.forEach(function (row) {
                row.forEach(function (cell, i) {
                    var len = cell ? cell.toString().length : 10;
                    colWidths[i] = Math.max(colWidths[i] || 12, Math.min(len + 3, 58));
                });
            });
            ws['!cols'] = colWidths.map(function (w) { return { wch: Math.max(12, Math.min(w, 58)) }; });
            applyWorksheetStyleHints(ws, wsData.length, headers.length || 1, 4);

            var sheetName = getUniqueSheetName(wb, getSheetName(table, index));
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
        });

        XLSX.writeFile(wb, sanitizeFileName(title || 'O-APM_Report') + '_' + generatedAt.fileDate + '.xlsx');
    }

    function applyWorksheetStyleHints(ws, rowCount, colCount, headerRowIndex) {
        if (!ws || !ws['!ref']) return;
        var range = XLSX.utils.decode_range(ws['!ref']);
        var headerRow = typeof headerRowIndex === 'number' ? headerRowIndex : range.s.r;
        for (var row = range.s.r; row <= range.e.r; row++) {
            for (var col = range.s.c; col <= range.e.c; col++) {
                var address = XLSX.utils.encode_cell({ r: row, c: col });
                var cell = ws[address];
                if (!cell) continue;
                cell.s = cell.s || {};
                cell.s.alignment = { vertical: 'top', wrapText: true };
                if (row === range.s.r) {
                    cell.s.font = { bold: true, color: { rgb: 'FF0F172A' }, sz: 15 };
                    cell.s.fill = { fgColor: { rgb: 'FFE0F2FE' } };
                    cell.s.alignment = { vertical: 'center', wrapText: true };
                } else if (row === headerRow) {
                    cell.s.font = { bold: true, color: { rgb: 'FFFFFFFF' } };
                    cell.s.fill = { fgColor: { rgb: 'FF0F172A' } };
                    cell.s.alignment = { vertical: 'center', wrapText: true };
                } else if (row > headerRow && (row - headerRow) % 2 === 0) {
                    cell.s.fill = { fgColor: { rgb: 'FFF8FAFC' } };
                }
            }
        }
        ws['!rows'] = Array.from({ length: Math.max(rowCount, 1) }, function (_, index) {
            return { hpt: index === 0 ? 28 : index === headerRow ? 24 : 34 };
        });
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
            var title = getReportTitle(el);
            var generatedAt = getReportDateParts();
            var jsPDF = window.jspdf.jsPDF;
            var pdfOrientation = hasWideReportTable(el) ? 'landscape' : 'portrait';
            var pdf = new jsPDF({ orientation: pdfOrientation, unit: 'mm', format: 'a4' });
            renderBusinessPdf(pdf, el, title, generatedAt);
            pdf.save(sanitizeFileName(title || 'O-APM_Report') + '_' + generatedAt.fileDate + '.pdf');
            return;

            var cloned = el.cloneNode(true);

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
                        '<div style="font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#0f766e;">O-APM</div>' +
                        '<h1 style="font-size:27px;font-weight:800;color:#111827;margin:7px 0 0;line-height:1.18;">' + escapeHtml(title) + '</h1>' +
                        '<div style="font-size:12px;color:#111827;margin-top:7px;font-weight:700;">Powered by Reliabot</div>' +
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
            ftr.style.color = '#111827';
            ftr.style.textAlign = 'center';
            ftr.innerHTML =
                'This report was generated from O-APM, powered by Reliabot.<br>' +
                'Analysis follows recognized reliability engineering guidance and should be verified by qualified personnel before real-world use.';
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

            pdf.save(sanitizeFileName(title || 'O-APM_Report') + '_' + generatedAt.fileDate + '.pdf');
        } catch (err) {
            console.error('PDF generation error:', err);
            alert('Error generating PDF. Please try again.');
        } finally {
            btn.innerHTML = originalHTML;
            btn.disabled = false;
        }
    }

    function hasWideReportTable(el) {
        return Array.from(el.getElementsByTagName('table')).some(function (table) {
            var headerCount = table.querySelectorAll('thead th').length;
            if (headerCount > 0) return headerCount > 7;
            var firstRow = table.querySelector('tr');
            return firstRow && firstRow.children.length > 7;
        });
    }

    function renderBusinessPdf(pdf, sourceEl, title, generatedAt) {
        var page = {
            width: pdf.internal.pageSize.getWidth(),
            height: pdf.internal.pageSize.getHeight(),
            marginX: 16,
            top: 18,
            bottom: 18,
            continuationTitle: title || 'Reliability Engineering Report'
        };
        var y = drawPdfHeader(pdf, page, title, generatedAt);
        var skippedTitle = false;
        getPdfBlocks(sourceEl).forEach(function (block) {
            if (!skippedTitle && block.type === 'heading' && cleanPdfText(block.text).toLowerCase() === cleanPdfText(title).toLowerCase()) {
                skippedTitle = true;
                return;
            }
            if (block.type === 'table') {
                y = drawPdfTable(pdf, page, block, y);
            } else if (block.type === 'diagram') {
                y = drawPdfDiagram(pdf, page, block, y);
            } else {
                y = drawPdfTextBlock(pdf, page, block, y);
            }
        });
        addPdfFooters(pdf, page);
    }

    function drawPdfHeader(pdf, page, title, generatedAt) {
        pdf.setFillColor(15, 23, 42);
        pdf.rect(0, 0, page.width, 30, 'F');
        pdf.setFillColor(13, 148, 136);
        pdf.rect(0, 30, page.width, 1.8, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10);
        pdf.text('O-APM BUSINESS REPORT', page.marginX, 10);
        pdf.setFontSize(16);
        pdf.text(pdf.splitTextToSize(title || 'Reliability Engineering Report', 138), page.marginX, 20);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.text('Powered by Reliabot', page.width - page.marginX, 10, { align: 'right' });
        pdf.text(generatedAt.displayDate, page.width - page.marginX, 16, { align: 'right' });
        pdf.text(generatedAt.displayTime, page.width - page.marginX, 22, { align: 'right' });
        return 42;
    }

    function drawPdfContinuationHeader(pdf, page) {
        pdf.setFillColor(15, 23, 42);
        pdf.rect(0, 0, page.width, 12, 'F');
        pdf.setFillColor(13, 148, 136);
        pdf.rect(0, 12, page.width, 1.2, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8.5);
        pdf.text(pdf.splitTextToSize(page.continuationTitle, page.width - page.marginX * 2 - 42), page.marginX, 8);
        pdf.setFont('helvetica', 'normal');
        pdf.text('Powered by Reliabot', page.width - page.marginX, 8, { align: 'right' });
        return 23;
    }

    function getPdfBlocks(sourceEl) {
        var blocks = [];
        Array.from(sourceEl.children).forEach(function (node) {
            collectPdfBlocks(node, blocks);
        });
        return blocks;
    }

    function collectPdfBlocks(node, blocks) {
        if (!node || node.nodeType !== 1) return;
        var tag = node.tagName;
        if (node.classList && node.classList.contains('rca-figma-diagram')) {
            blocks.push(extractPdfDiagram(node));
            return;
        }
        if (/^H[1-3]$/.test(tag)) {
            blocks.push({ type: 'heading', level: Number(tag.slice(1)), text: cleanPdfText(node.textContent) });
            return;
        }
        if (tag === 'TABLE') {
            blocks.push(extractPdfTable(node));
            return;
        }
        if (tag === 'UL' || tag === 'OL') {
            Array.from(node.children).forEach(function (li) {
                blocks.push({ type: 'list', text: cleanPdfText(li.textContent) });
            });
            return;
        }
        if (tag === 'P' || tag === 'DIV') {
            if (node.querySelector('table, h1, h2, h3, ul, ol')) {
                Array.from(node.children).forEach(function (child) {
                    collectPdfBlocks(child, blocks);
                });
                return;
            }
            var text = cleanPdfText(node.textContent);
            if (text) blocks.push({ type: 'paragraph', text: text });
            return;
        }
        Array.from(node.children).forEach(function (child) {
            collectPdfBlocks(child, blocks);
        });
    }

    function extractPdfTable(table) {
        var headers = Array.from(table.querySelectorAll('thead th')).map(function (cell) {
            return cleanPdfText(cell.textContent);
        });
        var rows = Array.from(table.querySelectorAll('tbody tr')).map(function (row) {
            return Array.from(row.querySelectorAll('td')).map(function (cell) {
                return cleanPdfText(cell.textContent);
            });
        });
        if (headers.length === 0) {
            var firstRow = table.querySelector('tr');
            headers = firstRow ? Array.from(firstRow.children).map(function (cell) {
                return cleanPdfText(cell.textContent);
            }) : [];
        }
        rows = rows.map(function (row) {
            var normalized = row.slice(0, headers.length);
            while (normalized.length < headers.length) normalized.push('');
            return normalized;
        }).filter(function (row) {
            return row.some(function (cell) { return String(cell || '').trim(); });
        });
        return { type: 'table', headers: headers, rows: rows };
    }

    function extractPdfDiagram(node) {
        var title = node.getAttribute('data-title') || cleanPdfText((node.querySelector('.rca-diagram-header') || {}).textContent);
        var nodes = Array.from(node.querySelectorAll('.rca-diagram-node')).map(function (item) {
            return cleanPdfText(item.textContent).replace(/^\d+\s*/, '');
        });
        return { type: 'diagram', title: title || 'RCA Diagram', nodes: nodes };
    }

    function cleanPdfText(text) {
        return String(text || '').replace(/\s+/g, ' ').trim();
    }

    function drawPdfTextBlock(pdf, page, block, y) {
        var maxWidth = page.width - page.marginX * 2;
        var text = block.type === 'list' ? '- ' + block.text : block.text;
        if (!text) return y;
        if (block.type === 'heading') {
            var headingSize = block.level === 1 ? 15 : block.level === 2 ? 12.5 : 10.8;
            y = ensurePdfSpace(pdf, page, y, headingSize + 8);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(headingSize);
            pdf.setTextColor(block.level === 1 ? 15 : block.level === 2 ? 12 : 13, block.level === 1 ? 23 : block.level === 2 ? 74 : 105, block.level === 1 ? 42 : block.level === 2 ? 110 : 98);
            var headingLines = pdf.splitTextToSize(text, maxWidth);
            if (block.level === 2) {
                pdf.setFillColor(236, 253, 245);
                pdf.setDrawColor(20, 184, 166);
                pdf.rect(page.marginX - 2, y - 5.5, maxWidth + 4, Math.max(9, headingLines.length * 5.2 + 3), 'FD');
            } else if (block.level === 1) {
                pdf.setDrawColor(13, 148, 136);
                pdf.setLineWidth(0.7);
                pdf.line(page.marginX, y + headingLines.length * 5.4 + 1.5, page.marginX + Math.min(maxWidth, 82), y + headingLines.length * 5.4 + 1.5);
            }
            pdf.text(headingLines, page.marginX, y);
            return y + headingLines.length * (block.level === 1 ? 5.8 : 5.2) + 5;
        }
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9.4);
        pdf.setTextColor(15, 23, 42);
        var lines = pdf.splitTextToSize(text, maxWidth);
        y = ensurePdfSpace(pdf, page, y, lines.length * 4.9 + 3);
        pdf.text(lines, page.marginX, y);
        return y + lines.length * 4.9 + 2.5;
    }

    function drawPdfTable(pdf, page, table, y) {
        if (!table.headers.length) return y;
        var usableWidth = page.width - page.marginX * 2;
        var colCount = Math.max(table.headers.length, 1);
        var colWidths = calculatePdfColumnWidths(table, usableWidth);
        var compactTable = colCount > 8;
        var headerHeight = compactTable ? 12.5 : 11;
        var bodyFontSize = compactTable ? 7.2 : 8.2;
        var bodyLineHeight = compactTable ? 3.8 : 4.35;
        y = ensurePdfSpace(pdf, page, y, headerHeight + 12);
        drawPdfTableHeader(pdf, page, table.headers, y, colWidths, headerHeight);
        y += headerHeight;
        table.rows.forEach(function (row, rowIndex) {
            var originalY = y;
            var cellLines = table.headers.map(function (_, index) {
                return pdf.splitTextToSize(row[index] || '', colWidths[index] - 3.4);
            });
            var rowHeight = Math.max(9, Math.max.apply(null, cellLines.map(function (lines) {
                return lines.length * bodyLineHeight + 4.5;
            })));
            y = ensurePdfSpace(pdf, page, y, rowHeight + 6);
            if (y < originalY) {
                drawPdfTableHeader(pdf, page, table.headers, y, colWidths, headerHeight);
                y += headerHeight;
            }
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(bodyFontSize);
            var x = page.marginX;
            table.headers.forEach(function (_, index) {
                var colWidth = colWidths[index];
                var riskStyle = getRiskCellStyle(row[index]);
                if (riskStyle) {
                    pdf.setFillColor(riskStyle.fill[0], riskStyle.fill[1], riskStyle.fill[2]);
                    pdf.setTextColor(riskStyle.text[0], riskStyle.text[1], riskStyle.text[2]);
                    pdf.setFont('helvetica', 'bold');
                } else {
                    pdf.setTextColor(15, 23, 42);
                    pdf.setFont('helvetica', 'normal');
                    if (rowIndex % 2 === 0) {
                        pdf.setFillColor(255, 255, 255);
                    } else {
                        pdf.setFillColor(248, 250, 252);
                    }
                }
                pdf.setDrawColor(148, 163, 184);
                pdf.rect(x, y, colWidth, rowHeight, 'FD');
                pdf.text(cellLines[index], x + 1.7, y + 4.4);
                x += colWidth;
            });
            y += rowHeight;
        });
        return y + 6;
    }

    function drawPdfDiagram(pdf, page, diagram, y) {
        var maxWidth = page.width - page.marginX * 2;
        var nodes = diagram.nodes.length ? diagram.nodes : ['Diagram data unavailable'];
        var boxWidth = Math.min(42, Math.max(30, (maxWidth - Math.max(0, nodes.length - 1) * 8) / Math.min(nodes.length, 5)));
        var boxHeight = 20;
        var rows = [];
        for (var i = 0; i < nodes.length; i += 5) {
            rows.push(nodes.slice(i, i + 5));
        }
        var needed = 16 + rows.length * (boxHeight + 12);
        y = ensurePdfSpace(pdf, page, y, needed);

        pdf.setFillColor(15, 23, 42);
        pdf.setDrawColor(15, 23, 42);
        pdf.rect(page.marginX, y, maxWidth, 9, 'FD');
        pdf.setTextColor(255, 255, 255);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8);
        pdf.text(cleanPdfText(diagram.title), page.marginX + 3, y + 6);
        y += 14;

        rows.forEach(function (row) {
            var totalRowWidth = row.length * boxWidth + Math.max(0, row.length - 1) * 8;
            var x = page.marginX + Math.max(0, (maxWidth - totalRowWidth) / 2);
            row.forEach(function (label, index) {
                pdf.setFillColor(236, 254, 255);
                pdf.setDrawColor(13, 148, 136);
                pdf.roundedRect(x, y, boxWidth, boxHeight, 2, 2, 'FD');
                pdf.setTextColor(15, 23, 42);
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(6.8);
                pdf.text(pdf.splitTextToSize(label, boxWidth - 4), x + 2, y + 5);
                if (index < row.length - 1) {
                    pdf.setDrawColor(15, 23, 42);
                    pdf.setLineWidth(0.5);
                    pdf.line(x + boxWidth + 1.5, y + boxHeight / 2, x + boxWidth + 6.5, y + boxHeight / 2);
                    pdf.triangle(x + boxWidth + 6.5, y + boxHeight / 2 - 1.8, x + boxWidth + 6.5, y + boxHeight / 2 + 1.8, x + boxWidth + 9, y + boxHeight / 2, 'F');
                }
                x += boxWidth + 8;
            });
            y += boxHeight + 12;
        });

        return y + 2;
    }

    function calculatePdfColumnWidths(table, usableWidth) {
        var weights = table.headers.map(function (header, index) {
            var normalized = String(header || '').toLowerCase();
            var sampleLength = 0;
            table.rows.slice(0, 12).forEach(function (row) {
                sampleLength = Math.max(sampleLength, String(row[index] || '').length);
            });
            if (/^(s|o|d|rpn|rating|rev|no\.?|#|id)$/i.test(header) || /\b(rating|score|severity|occurrence|detection|rpn)\b/.test(normalized)) {
                return 0.75;
            }
            if (/\b(owner|date|target|frequency|status|criticality|category)\b/.test(normalized)) {
                return 1.05;
            }
            if (/\b(action|effect|cause|failure|control|function|recommend|criteria|description|notes)\b/.test(normalized)) {
                return sampleLength > 90 ? 1.75 : 1.35;
            }
            return sampleLength > 70 ? 1.35 : 1;
        });
        var totalWeight = weights.reduce(function (sum, weight) { return sum + weight; }, 0) || 1;
        var widths = weights.map(function (weight) {
            return usableWidth * weight / totalWeight;
        });
        var minWidth = table.headers.length > 8 ? 10 : 14;
        widths = widths.map(function (width) {
            return Math.max(minWidth, width);
        });
        var totalWidth = widths.reduce(function (sum, width) { return sum + width; }, 0);
        if (totalWidth > usableWidth) {
            var scale = usableWidth / totalWidth;
            widths = widths.map(function (width) { return width * scale; });
        }
        return widths;
    }

    function drawPdfTableHeader(pdf, page, headers, y, colWidths, headerHeight) {
        pdf.setFillColor(15, 23, 42);
        pdf.setDrawColor(15, 23, 42);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(headers.length > 8 ? 7.2 : 8.2);
        pdf.setTextColor(255, 255, 255);
        var x = page.marginX;
        headers.forEach(function (header, index) {
            var colWidth = colWidths[index];
            pdf.rect(x, y, colWidth, headerHeight, 'FD');
            pdf.text(pdf.splitTextToSize(header, colWidth - 3.4), x + 1.7, y + 4.5);
            x += colWidth;
        });
    }

    function getRiskCellStyle(value) {
        var normalized = String(value || '').trim().toUpperCase();
        if (!normalized) return null;
        if (normalized === 'CRITICAL') return { fill: [153, 27, 27], text: [255, 255, 255] };
        if (normalized === 'HIGH') return { fill: [220, 38, 38], text: [255, 255, 255] };
        if (normalized === 'MEDIUM') return { fill: [254, 243, 199], text: [120, 53, 15] };
        if (normalized === 'LOW') return { fill: [220, 252, 231], text: [20, 83, 45] };
        if (normalized === 'VERY LOW') return { fill: [219, 234, 254], text: [30, 64, 175] };
        return null;
    }

    function ensurePdfSpace(pdf, page, y, needed) {
        if (y + needed <= page.height - page.bottom) return y;
        pdf.addPage();
        return drawPdfContinuationHeader(pdf, page);
    }

    function addPdfFooters(pdf, page) {
        var total = pdf.getNumberOfPages();
        for (var i = 1; i <= total; i++) {
            pdf.setPage(i);
            pdf.setDrawColor(226, 232, 240);
            pdf.line(page.marginX, page.height - 13, page.width - page.marginX, page.height - 13);
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(7.5);
            pdf.setTextColor(15, 23, 42);
            pdf.text('Generated from O-APM, powered by Reliabot. Verify before real-world use.', page.marginX, page.height - 8);
            pdf.text('Page ' + i + ' of ' + total, page.width - page.marginX, page.height - 8, { align: 'right' });
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

        container.querySelectorAll('table').forEach(function (table) {
            table.style.background = '#ffffff';
            table.style.color = '#111827';
        });
        container.querySelectorAll('tbody tr').forEach(function (row, index) {
            row.style.background = index % 2 === 0 ? '#ffffff' : '#f8fafc';
        });
        container.querySelectorAll('td').forEach(function (cell) {
            cell.style.background = '#ffffff';
            cell.style.color = '#111827';
            cell.style.borderColor = '#94a3b8';
        });
        container.querySelectorAll('th').forEach(function (cell) {
            cell.style.background = '#0f172a';
            cell.style.color = '#ffffff';
            cell.style.borderColor = '#0f172a';
        });
    }
})();
