(function () {
    'use strict';

    var tokenForm = document.getElementById('adminTokenForm');
    var tokenInput = document.getElementById('adminToken');
    var visitorsBody = document.getElementById('visitorsBody');
    var activityBody = document.getElementById('activityBody');
    var storageStatus = document.getElementById('adminStorageStatus');

    tokenInput.value = localStorage.getItem('reliabot-admin-token') || '';
    tokenForm.addEventListener('submit', function (event) {
        event.preventDefault();
        localStorage.setItem('reliabot-admin-token', tokenInput.value);
        loadAdminData();
    });

    if (tokenInput.value) loadAdminData();

    async function loadAdminData() {
        visitorsBody.innerHTML = '<tr><td colspan="13">Loading...</td></tr>';
        activityBody.innerHTML = '<tr><td colspan="10">Loading...</td></tr>';
        var response = await fetch('/api/admin/visitors', {
            headers: { 'x-admin-token': tokenInput.value }
        });
        var data = await response.json().catch(function () { return {}; });
        if (!response.ok) {
            visitorsBody.innerHTML = '<tr><td colspan="13">' + escapeHtml(data.error || 'Could not load admin data.') + '</td></tr>';
            activityBody.innerHTML = '';
            renderStorageStatus(null);
            return;
        }
        renderStorageStatus(data.persistence);
        renderVisitors(data.visitors || []);
        renderActivities(data.activities || []);
    }

    function renderStorageStatus(persistence) {
        if (!storageStatus) return;
        if (!persistence) {
            storageStatus.textContent = 'Storage status unavailable.';
            storageStatus.className = 'admin-storage-status is-warning';
            return;
        }
        if (persistence.configured) {
            storageStatus.textContent = 'Persistent storage active. Visitor details and activity are saved across deployments and restarts.';
            storageStatus.className = 'admin-storage-status is-active';
            return;
        }
        storageStatus.textContent = 'Local temporary storage only. On Vercel, configure KV_REST_API_URL and KV_REST_API_TOKEN to keep admin data permanently.';
        storageStatus.className = 'admin-storage-status is-warning';
    }

    function renderVisitors(visitors) {
        if (!visitors.length) {
            visitorsBody.innerHTML = '<tr><td colspan="13">No visitors yet.</td></tr>';
            return;
        }
        visitorsBody.innerHTML = visitors.map(function (visitor) {
            var disabled = visitor.status === 'disabled';
            return '<tr>' +
                '<td>' + escapeHtml(visitor.name) + '</td>' +
                '<td>' + escapeHtml(visitor.email) + '</td>' +
                '<td>' + escapeHtml(visitor.company) + '</td>' +
                '<td><span class="admin-status ' + (disabled ? 'is-disabled' : 'is-active') + '">' + escapeHtml(visitor.status || 'active') + '</span></td>' +
                '<td>' + formatNumber(visitor.queryCount) + '</td>' +
                '<td>' + formatNumber(visitor.inputTokens) + '</td>' +
                '<td>' + formatNumber(visitor.outputTokens) + '</td>' +
                '<td>' + formatNumber(visitor.totalTokens) + '</td>' +
                '<td>' + escapeHtml(formatLocation(visitor.location)) + '</td>' +
                '<td>' + escapeHtml((visitor.network && visitor.network.ip) || '') + '</td>' +
                '<td>' + escapeHtml(formatDate(visitor.createdAt)) + '</td>' +
                '<td>' + escapeHtml(formatDate(visitor.lastSeenAt)) + '</td>' +
                '<td><button class="admin-row-action ' + (disabled ? 'enable' : 'disable') + '" data-action="' + (disabled ? 'enable' : 'disable') + '" data-id="' + escapeHtml(visitor.id) + '">' + (disabled ? 'Enable' : 'Disable') + '</button></td>' +
            '</tr>';
        }).join('');
        visitorsBody.querySelectorAll('[data-action]').forEach(function (button) {
            button.addEventListener('click', function () {
                updateVisitorStatus(button.dataset.id, button.dataset.action);
            });
        });
    }

    async function updateVisitorStatus(visitorId, action) {
        var label = action === 'disable' ? 'disable' : 'enable';
        if (!window.confirm('Are you sure you want to ' + label + ' this user?')) return;
        var response = await fetch('/api/admin/visitors/' + encodeURIComponent(visitorId) + '/' + action, {
            method: 'POST',
            headers: { 'x-admin-token': tokenInput.value }
        });
        var data = await response.json().catch(function () { return {}; });
        if (!response.ok) {
            window.alert(data.error || 'Could not update user.');
            return;
        }
        loadAdminData();
    }

    function renderActivities(activities) {
        if (!activities.length) {
            activityBody.innerHTML = '<tr><td colspan="10">No activity yet.</td></tr>';
            return;
        }
        activityBody.innerHTML = activities.map(function (activity) {
            var usage = activity.usage || {};
            return '<tr>' +
                '<td>' + escapeHtml(formatDate(activity.createdAt)) + '</td>' +
                '<td>' + escapeHtml(activity.name || activity.email) + '</td>' +
                '<td>' + escapeHtml(activity.company || '') + '</td>' +
                '<td>' + escapeHtml(activity.module || activity.type || '') + '</td>' +
                '<td class="admin-query-cell">' + escapeHtml(activity.detail || '') + '</td>' +
                '<td>' + formatNumber(usage.inputTokens) + '</td>' +
                '<td>' + formatNumber(usage.outputTokens) + '</td>' +
                '<td>' + formatNumber(usage.totalTokens) + '</td>' +
                '<td>' + escapeHtml(activity.responseStatus || '') + '</td>' +
                '<td>' + escapeHtml(formatLocation(activity.location)) + '</td>' +
            '</tr>';
        }).join('');
    }

    function formatLocation(location) {
        if (!location) return '';
        var parts = [];
        if (location.timezone) parts.push(location.timezone);
        if (location.locale) parts.push(location.locale);
        if (typeof location.latitude === 'number' && typeof location.longitude === 'number') {
            parts.push(location.latitude.toFixed(4) + ', ' + location.longitude.toFixed(4));
        }
        return parts.join(' | ');
    }

    function formatDate(value) {
        if (!value) return '';
        return new Date(value).toLocaleString();
    }

    function formatNumber(value) {
        return Number(value || 0).toLocaleString();
    }

    function escapeHtml(value) {
        var div = document.createElement('div');
        div.textContent = String(value || '');
        return div.innerHTML;
    }
})();
