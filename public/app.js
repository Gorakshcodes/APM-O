(function () {
    'use strict';

    // ── State ──────────────────────────────────────────────────────────
    let conversationHistory = [];
    let currentModule = null;
    let responseCounter = 0;

    const MODULE_NAMES = {
        eca: 'Equipment Criticality Analysis',
        rcm: 'RCM/FMEA Analysis',
        rca: 'Root Cause Analysis',
        analytics: 'Reliability Analytics',
        review: 'Report Quality Review'
    };

    const MODULE_CONTEXT = {
        eca: 'Using the Equipment Criticality Analysis module: ',
        rcm: 'Using the RCM/FMEA Analysis module: ',
        rca: 'Using the Root Cause Analysis module: ',
        analytics: 'Using the Reliability Analytics module: ',
        review: 'Using the Report Quality Review module: '
    };

    // ── DOM references ─────────────────────────────────────────────────
    const chatMessages = document.getElementById('chatMessages');
    const userInput = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');

    // ── Event listeners ────────────────────────────────────────────────
    sendBtn.addEventListener('click', sendMessage);

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

    // Quick-start buttons
    document.getElementById('quickStartList').addEventListener('click', function (e) {
        const btn = e.target.closest('[data-prompt]');
        if (!btn) return;
        userInput.value = btn.dataset.prompt;
        sendMessage();
    });

    // ── Module selection ───────────────────────────────────────────────
    function selectModule(module) {
        currentModule = module;

        // Update active state in sidebar
        document.querySelectorAll('.module-btn').forEach(function (b) {
            b.classList.toggle('active', b.dataset.module === module);
        });

        addSystemMessage(
            'Switched to ' + MODULE_NAMES[module] + ' mode. How can I help with ' +
            MODULE_NAMES[module].toLowerCase() + '?'
        );
    }

    // ── Send message ───────────────────────────────────────────────────
    async function sendMessage() {
        const message = userInput.value.trim();
        if (!message) return;

        setSendEnabled(false);
        addUserMessage(message);

        let enhanced = message;
        if (currentModule) {
            enhanced = MODULE_CONTEXT[currentModule] + message;
        }

        conversationHistory.push({ role: 'user', content: enhanced });
        userInput.value = '';

        showTypingIndicator();

        try {
            const data = await callAPI();
            removeTypingIndicator();

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
            addBotMessage('I apologize, but I encountered an error. Please try again. Error: ' + err.message);
        }

        setSendEnabled(true);
    }

    // ── API call (goes through our server proxy) ───────────────────────
    async function callAPI() {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: conversationHistory })
        });

        if (!response.ok) {
            const body = await response.json().catch(function () { return {}; });
            throw new Error(body.error || response.status + ' ' + response.statusText);
        }

        return response.json();
    }

    // ── UI helpers ─────────────────────────────────────────────────────
    function setSendEnabled(enabled) {
        sendBtn.disabled = !enabled;
        sendBtn.classList.toggle('opacity-50', !enabled);
    }

    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // ── Message rendering ──────────────────────────────────────────────
    function addUserMessage(text) {
        var div = document.createElement('div');
        div.className = 'chat-message flex items-start space-x-3';
        div.innerHTML =
            '<div class="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">' +
                '<svg class="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
                    '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" ' +
                        'd="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>' +
                '</svg>' +
            '</div>' +
            '<div class="flex-1 message-content text-gray-900 text-sm max-w-3xl">' +
                '<p>' + escapeHtml(text) + '</p>' +
            '</div>';
        chatMessages.appendChild(div);
        scrollToBottom();
    }

    function addBotMessage(text, responseId) {
        var formatted = formatMessage(text);
        var hasTable = text.indexOf('|') !== -1 && text.indexOf('---') !== -1;

        var div = document.createElement('div');
        div.className = 'chat-message flex items-start space-x-3';

        var excelBtn = '';
        if (hasTable) {
            excelBtn =
                '<div class="mt-3 flex flex-wrap gap-2">' +
                    '<button class="download-btn" data-action="excel" data-response="' + responseId + '">' +
                        '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
                            '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" ' +
                                'd="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>' +
                        '</svg>' +
                        'Download Excel' +
                    '</button>' +
                '</div>';
        }

        div.innerHTML =
            '<div class="w-8 h-8 bg-gray-900 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">' +
                '<svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
                    '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" ' +
                        'd="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path>' +
                '</svg>' +
            '</div>' +
            '<div class="flex-1 max-w-3xl">' +
                '<div id="response-' + responseId + '" class="message-content text-gray-900 text-sm">' +
                    formatted +
                '</div>' +
                excelBtn +
                '<div class="pdf-download-section">' +
                    '<button class="pdf-download-btn" data-action="pdf" data-response="' + responseId + '">' +
                        '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
                            '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" ' +
                                'd="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>' +
                        '</svg>' +
                        'Download as PDF Report' +
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
                '<div class="bg-gray-50 rounded-md px-4 py-2 text-center border border-gray-200">' +
                    '<p class="text-xs text-gray-600">' + escapeHtml(text) + '</p>' +
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
            '<div class="w-8 h-8 bg-gray-900 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">' +
                '<svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
                    '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" ' +
                        'd="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path>' +
                '</svg>' +
            '</div>' +
            '<div class="flex-1 pt-1">' +
                '<div class="typing-indicator flex space-x-1">' +
                    '<span class="w-2 h-2 bg-gray-400 rounded-full"></span>' +
                    '<span class="w-2 h-2 bg-gray-400 rounded-full"></span>' +
                    '<span class="w-2 h-2 bg-gray-400 rounded-full"></span>' +
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

    function convertMarkdownTables(text) {
        var regex = /(\|.+\|[\r\n]+)((?:\|[-: ]+\|[\r\n]+))((?:\|.+\|[\r\n]*)+)/g;

        return text.replace(regex, function (match, header, separator, body) {
            var headers = header.split('|').filter(function (h) { return h.trim(); }).map(function (h) { return h.trim(); });
            var rows = body.trim().split('\n').map(function (row) {
                return row.split('|').filter(function (c) { return c.trim(); }).map(function (c) { return c.trim(); });
            });

            var html = '<div class="matrix-container"><table class="matrix-table">';
            html += '<thead><tr>';
            headers.forEach(function (h) { html += '<th>' + h + '</th>'; });
            html += '</tr></thead><tbody>';
            rows.forEach(function (row) {
                html += '<tr>';
                row.forEach(function (cell) { html += '<td>' + cell + '</td>'; });
                html += '</tr>';
            });
            html += '</tbody></table></div>';
            return html;
        });
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

            XLSX.utils.book_append_sheet(wb, ws, 'Sheet' + (index + 1));
        });

        var timestamp = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(wb, 'ReliaBot_Analysis_' + timestamp + '.xlsx');
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

            var container = document.createElement('div');
            container.style.position = 'absolute';
            container.style.left = '-9999px';
            container.style.width = '800px';
            container.style.padding = '40px';
            container.style.background = 'white';
            container.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

            // Header
            var hdr = document.createElement('div');
            hdr.style.borderBottom = '2px solid #111827';
            hdr.style.paddingBottom = '16px';
            hdr.style.marginBottom = '24px';
            hdr.innerHTML =
                '<h1 style="font-size:24px;font-weight:700;color:#111827;margin:0;">Reliability Engineering Analysis Report</h1>' +
                '<div style="font-size:12px;color:#6b7280;margin-top:8px;">Generated by Relia-Bot | ' +
                new Date().toLocaleDateString() + ' | ' + new Date().toLocaleTimeString() + '</div>';
            container.appendChild(hdr);

            container.appendChild(cloned);

            // Style tables
            Array.from(container.getElementsByTagName('table')).forEach(function (table) {
                table.style.width = '100%';
                table.style.borderCollapse = 'collapse';
                table.style.margin = '12px 0';
                table.style.fontSize = '11px';
                Array.from(table.getElementsByTagName('th')).forEach(function (th) {
                    th.style.background = '#f3f4f6';
                    th.style.border = '1px solid #d1d5db';
                    th.style.padding = '8px';
                    th.style.textAlign = 'left';
                    th.style.fontWeight = '600';
                });
                Array.from(table.getElementsByTagName('td')).forEach(function (td) {
                    td.style.border = '1px solid #d1d5db';
                    td.style.padding = '6px 8px';
                });
            });

            // Footer
            var ftr = document.createElement('div');
            ftr.style.borderTop = '1px solid #e5e7eb';
            ftr.style.paddingTop = '16px';
            ftr.style.marginTop = '32px';
            ftr.style.fontSize = '10px';
            ftr.style.color = '#9ca3af';
            ftr.style.textAlign = 'center';
            ftr.innerHTML =
                'This report was generated by Relia-Bot, an AI-powered reliability engineering assistant.<br>' +
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

            var timestamp = new Date().toISOString().slice(0, 10);
            pdf.save('ReliaBot_Report_' + timestamp + '.pdf');
        } catch (err) {
            console.error('PDF generation error:', err);
            alert('Error generating PDF. Please try again.');
        } finally {
            btn.innerHTML = originalHTML;
            btn.disabled = false;
        }
    }
})();
