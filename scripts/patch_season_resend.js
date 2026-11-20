const fs = require('fs');
const path = require('path');

const projectDir = path.resolve(__dirname, '..');
const emailServicePath = path.join(projectDir, 'emailService.js');
const serverPath = path.join(projectDir, 'server.js');
const appJsPath = path.join(projectDir, 'public', 'app.js');
const htmlPath = path.join(projectDir, 'public', 'index.html');

console.log('--- 1. Patching emailService.js ---');
let emailServiceCode = fs.readFileSync(emailServicePath, 'utf8');

// Ensure htmlContent is stored in db.addDispatch
if (!emailServiceCode.includes('htmlContent: customBody || null')) {
  emailServiceCode = emailServiceCode.replace(
    /subject:\s*rendered\.subject,\s*mode,/g,
    'subject: rendered.subject,\n        htmlContent: customBody || null,\n        mode,'
  );
  // Also on update
  emailServiceCode = emailServiceCode.replace(
    /subject:\s*rendered\.subject,\s*mode\s*\n\s*\}\);/g,
    'subject: rendered.subject,\n          htmlContent: customBody || dispatch.htmlContent || null,\n          mode\n        });'
  );
  fs.writeFileSync(emailServicePath, emailServiceCode, 'utf8');
  console.log('Successfully patched emailService.js to persist htmlContent');
} else {
  console.log('emailService.js already persists htmlContent');
}

console.log('--- 2. Patching server.js ---');
let serverCode = fs.readFileSync(serverPath, 'utf8');

// Ensure fresh-sequence instant dispatch saves htmlContent in db.updateDispatch
if (!serverCode.includes("stageLabel: `Stage ${stageNum} (Instant)`,\n                htmlContent: stage.htmlContent")) {
  serverCode = serverCode.replace(
    /stageLabel:\s*`Stage \$\{stageNum\} \(Instant\)`\s*\n\s*\}\);/g,
    "stageLabel: `Stage ${stageNum} (Instant)`,\n                htmlContent: stage.htmlContent\n              });"
  );
}

// Add POST /api/activity-sessions/:id/retry-failed endpoint if not already present
if (!serverCode.includes("app.post('/api/activity-sessions/:id/retry-failed'")) {
  const newEndpoint = `
// API: Re-send to failed recipients in an activity session (or forceAll)
app.post('/api/activity-sessions/:id/retry-failed', async (req, res) => {
  try {
    const { id } = req.params;
    const { forceAll } = req.body || {};
    const session = db.getActivitySessionById(id);
    if (!session) return res.status(404).json({ success: false, error: 'Activity session not found.' });

    let targets = (session.dispatches || []).filter(d => forceAll ? (d.status === 'failed' || d.status === 'sent') : d.status === 'failed');

    if (targets.length === 0) {
      if (!forceAll) {
        return res.json({
          success: true,
          message: 'No failed recipients found in this session.',
          retriedCount: 0,
          sentCount: 0,
          failedCount: 0
        });
      } else {
        targets = session.dispatches || [];
      }
    }

    const allCustomers = db.getCustomers();
    const results = {
      retriedCount: targets.length,
      sentCount: 0,
      failedCount: 0,
      details: []
    };

    for (const d of targets) {
      try {
        let cust = d.customerId ? allCustomers.find(c => String(c.id) === String(d.customerId)) : null;
        if (!cust) {
          cust = {
            id: d.customerId || ('cust_' + Date.now()),
            email: d.customerEmail,
            first_name: d.customerFirstName || (d.customerName ? d.customerName.split(' ')[0] : d.customerEmail.split('@')[0]),
            name: d.customerName || d.customerEmail,
            orders_count: 0,
            total_spent: '0.00'
          };
        }

        db.updateDispatch(d.id, { status: 'sending', error: null });

        await emailService.sendFollowUpEmail({
          to: d.customerEmail,
          customer: cust,
          templateId: d.templateId || 'fresh_sequence',
          customSubject: d.subject,
          customDiscountCode: d.discountCode || 'TDS-CARE',
          customBody: d.htmlContent || null,
          mode: 'session_retry',
          sessionId: id,
          stage: d.stage,
          stageLabel: d.stageLabel,
          existingDispatchId: d.id
        });

        results.sentCount++;
        results.details.push({ id: d.id, email: d.customerEmail, status: 'sent' });
      } catch (sendErr) {
        results.failedCount++;
        results.details.push({ id: d.id, email: d.customerEmail, status: 'failed', error: sendErr.message });
      }
    }

    res.json({
      success: true,
      message: \`Processed \${results.retriedCount} recipient(s): \${results.sentCount} sent, \${results.failedCount} failed.\`,
      ...results
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
`;

  // Insert before app.delete('/api/activity-sessions/:id'
  serverCode = serverCode.replace(
    "app.delete('/api/activity-sessions/:id', (req, res) => {",
    newEndpoint + "\napp.delete('/api/activity-sessions/:id', (req, res) => {"
  );
  console.log('Added /api/activity-sessions/:id/retry-failed to server.js');
}

fs.writeFileSync(serverPath, serverCode, 'utf8');

console.log('--- 3. Patching public/app.js ---');
let appCode = fs.readFileSync(appJsPath, 'utf8');

// A. Update deliveryBadge
appCode = appCode.replace(
  `    if (d.status === 'sent') {\n      deliveryBadge = \`<span class="rank-badge rank-badge-dev">DELIVERED</span>\`;`,
  `    if (d.status === 'sent') {\n      deliveryBadge = \`<span class="rank-badge rank-badge-dev" title="Dispatched successfully via mail provider">SENT</span>\`;`
);

// B. Update actionsHtml on main dispatches table to include Send Again on sent AND failed
const oldActionsSnippet = `    let actionsHtml = '';
    if (d.status === 'scheduled') {
      actionsHtml = \`
        <div style="display: flex; gap: 4px; justify-content: flex-end; flex-wrap: wrap;">
          <button type="button" class="Polaris-Button Polaris-Button--slim" style="font-size: 10.5px; padding: 2px 6px;" onclick="sendScheduledDispatchNow('\${d.id}')" title="Send immediately">⚡ Send Now</button>
          <button type="button" class="Polaris-Button Polaris-Button--slim" style="font-size: 10.5px; padding: 2px 6px;" onclick="openRescheduleModal('\${d.id}')" title="Reschedule date & time">🕒 Reschedule</button>
          <button type="button" class="Polaris-Button Polaris-Button--slim btn-danger-text" style="font-size: 10.5px; padding: 2px 6px;" onclick="cancelScheduledDispatch('\${d.id}')" title="Cancel">✕</button>
        </div>
      \`;
    } else if (d.status === 'failed') {
      actionsHtml = \`
        <div style="display: flex; gap: 4px; justify-content: flex-end; flex-wrap: wrap;">
          <button type="button" class="Polaris-Button Polaris-Button--slim" style="font-size: 10.5px; padding: 2px 6px; color: #b91c1c; border-color: #fca5a5;" onclick="retryFailedDispatch('\${d.id}')" title="Retry Delivery">⚡ Retry</button>
        </div>
      \`;
    } else {
      actionsHtml = \`<span style="font-size:12px; color:var(--p-color-text-subdued);">&mdash;</span>\`;
    }`;

const newActionsSnippet = `    let actionsHtml = '';
    if (d.status === 'scheduled') {
      actionsHtml = \`
        <div style="display: flex; gap: 4px; justify-content: flex-end; flex-wrap: wrap;">
          <button type="button" class="Polaris-Button Polaris-Button--slim" style="font-size: 10.5px; padding: 2px 6px;" onclick="sendScheduledDispatchNow('\${d.id}')" title="Send immediately">⚡ Send Now</button>
          <button type="button" class="Polaris-Button Polaris-Button--slim" style="font-size: 10.5px; padding: 2px 6px;" onclick="openRescheduleModal('\${d.id}')" title="Reschedule date & time">🕒 Reschedule</button>
          <button type="button" class="Polaris-Button Polaris-Button--slim btn-danger-text" style="font-size: 10.5px; padding: 2px 6px;" onclick="cancelScheduledDispatch('\${d.id}')" title="Cancel">✕</button>
        </div>
      \`;
    } else if (d.status === 'failed') {
      actionsHtml = \`
        <div style="display: flex; gap: 4px; justify-content: flex-end; flex-wrap: wrap;">
          <button type="button" class="Polaris-Button Polaris-Button--slim" style="font-size: 10.5px; padding: 2px 8px; color: #b91c1c; border-color: #fca5a5; background: #fff5f5; font-weight: 600; display: inline-flex; align-items: center; gap: 3px;" onclick="retryFailedDispatch('\${d.id}')" title="Retry Delivery to \${escapeHtml(d.customerEmail)}">
            ⚡ Send Again
          </button>
        </div>
      \`;
    } else if (d.status === 'sent') {
      actionsHtml = \`
        <div style="display: flex; gap: 4px; justify-content: flex-end; flex-wrap: wrap;">
          <button type="button" class="Polaris-Button Polaris-Button--slim" style="font-size: 10.5px; padding: 2px 7px; display: inline-flex; align-items: center; gap: 4px;" onclick="retryFailedDispatch('\${d.id}')" title="Send again to \${escapeHtml(d.customerEmail)}">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
            Send Again
          </button>
        </div>
      \`;
    } else {
      actionsHtml = \`<span style="font-size:12px; color:var(--p-color-text-subdued);">&mdash;</span>\`;
    }`;

if (appCode.includes(oldActionsSnippet)) {
  appCode = appCode.replace(oldActionsSnippet, newActionsSnippet);
  console.log('Patched actionsHtml in dispatches table');
} else {
  console.warn('Could not find oldActionsSnippet in app.js');
}

// C. Update active sessions ribbon to include "Send Again to Failed" button if failures exist
const oldRibbonSnippet = `  container.innerHTML = sessions.slice(0, 4).map(s => \`
    <button type="button" class="Polaris-FilterPill" style="font-size: 11px; padding: 2px 8px; display: inline-flex; align-items: center; gap: 4px;" onclick="openSessionInspector('\${s.id}')">
      <span style="width: 6px; height: 6px; border-radius: 50%; background: \${s.status === 'completed' ? '#94a3b8' : '#16a34a'};"></span>
      \${escapeHtml(s.name || 'Sequence')} (\${s.sentCount || 0} sent, \${s.scheduledCount || 0} sch)
    </button>
  \`).join('');`;

const newRibbonSnippet = `  container.innerHTML = sessions.slice(0, 4).map(s => \`
    <div style="display: inline-flex; align-items: center; gap: 4px;">
      <button type="button" class="Polaris-FilterPill" style="font-size: 11px; padding: 2px 8px; display: inline-flex; align-items: center; gap: 4px;" onclick="openSessionInspector('\${s.id}')">
        <span style="width: 6px; height: 6px; border-radius: 50%; background: \${s.status === 'completed' ? '#94a3b8' : (s.failedCount > 0 ? '#dc2626' : '#16a34a')};"></span>
        \${escapeHtml(s.name || 'Sequence')} (\${s.sentCount || 0} sent\${s.failedCount > 0 ? \`, <span style="color:#dc2626; font-weight:bold;">\${s.failedCount} failed</span>\` : ''}, \${s.scheduledCount || 0} sch)
      </button>
      \${s.failedCount > 0 ? \`
        <button type="button" class="Polaris-Button Polaris-Button--slim" style="font-size: 10.5px; padding: 2px 6px; color: #b91c1c; border-color: #fca5a5; background: #fff5f5; font-weight: bold;" onclick="retrySessionFailed('\${s.id}', event)" title="Send again to \${s.failedCount} failed recipient(s)">
          ⚡ Send Failed (\${s.failedCount})
        </button>
      \` : ''}
    </div>
  \`).join('');`;

if (appCode.includes(oldRibbonSnippet)) {
  appCode = appCode.replace(oldRibbonSnippet, newRibbonSnippet);
  console.log('Patched active sessions ribbon');
} else {
  console.warn('Could not find oldRibbonSnippet in app.js');
}

// D. Update session inspector modal stageActions to include Send Again on sent stages
const oldStageActions = `              } else if (isFail) {
                stageActions = \`
                  <div style="display: flex; gap: 4px; align-items: center;">
                    <button type="button" class="Polaris-Button Polaris-Button--slim" style="font-size: 11px; padding: 2px 8px; color: #b91c1c; border-color: #fca5a5;" onclick="retryFailedDispatch('\${d.id}')">
                      ⚡ Retry Delivery
                    </button>
                  </div>
                \`;
              }`;

const newStageActions = `              } else if (isFail) {
                stageActions = \`
                  <div style="display: flex; gap: 4px; align-items: center;">
                    <button type="button" class="Polaris-Button Polaris-Button--slim" style="font-size: 11px; padding: 2px 8px; color: #b91c1c; border-color: #fca5a5; background: #fff5f5; font-weight: 600;" onclick="retryFailedDispatch('\${d.id}')" title="Send again to \${escapeHtml(d.customerEmail)}">
                      ⚡ Send Again
                    </button>
                  </div>
                \`;
              } else if (isSent) {
                stageActions = \`
                  <div style="display: flex; gap: 4px; align-items: center;">
                    <button type="button" class="Polaris-Button Polaris-Button--slim" style="font-size: 10.5px; padding: 2px 7px; display: inline-flex; align-items: center; gap: 3px;" onclick="retryFailedDispatch('\${d.id}')" title="Send again to \${escapeHtml(d.customerEmail)}">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                      Send Again
                    </button>
                  </div>
                \`;
              }`;

if (appCode.includes(oldStageActions)) {
  appCode = appCode.replace(oldStageActions, newStageActions);
  console.log('Patched stageActions in session inspector modal');
} else {
  console.warn('Could not find oldStageActions in app.js');
}

// E. Add retrySessionFailed and resendWholeSession functions to app.js
if (!appCode.includes('async function retrySessionFailed(')) {
  const newSessionFunctions = `
async function retrySessionFailed(sessionId, evt) {
  if (evt) evt.stopPropagation();
  try {
    showToast('Sending again to all failed recipients in this session...', 'info');
    const res = await authFetch(\`/api/activity-sessions/\${encodeURIComponent(sessionId)}/retry-failed\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ forceAll: false })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || 'Batch retry completed successfully!', 'success');
      loadDispatches();
      loadActivitySessions();
      if (activeInspectedSessionId === sessionId) {
        openSessionInspector(sessionId);
      }
    } else {
      showToast(data.error || 'Failed to retry session recipients.', 'critical');
    }
  } catch (err) {
    showToast(err.message, 'critical');
  }
}

async function resendWholeSession(sessionId) {
  if (!confirm('Send this sequence stage again to all recipients in this session?')) return;
  try {
    showToast('Re-sending email sequence to all recipients...', 'info');
    const res = await authFetch(\`/api/activity-sessions/\${encodeURIComponent(sessionId)}/retry-failed\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ forceAll: true })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || 'Batch re-send completed successfully!', 'success');
      loadDispatches();
      loadActivitySessions();
      if (activeInspectedSessionId === sessionId) {
        openSessionInspector(sessionId);
      }
    } else {
      showToast(data.error || 'Failed to re-send session.', 'critical');
    }
  } catch (err) {
    showToast(err.message, 'critical');
  }
}
`;
  appCode += '\n' + newSessionFunctions;
  console.log('Added retrySessionFailed and resendWholeSession to app.js');
}

// F. In DEFAULT_STARTER_CLINICAL_HTML, add Dr. Marc's verified founder photo in signature
const oldSigStarter = `    <p style="font-size:14px; line-height:1.6; color:#666666; margin:28px 0 0 0; border-top:1px solid #f0ecf2; padding-top:20px;">
      Warmest holistic wishes,<br>
      <strong style="color:#0d0820;">Dr. Marc Mortiboys (BDS)</strong><br>
      <span style="font-size:12.5px; color:#888888;">Founder &amp; Biological Dental Surgeon &middot; The Dental Shaman</span>
    </p>`;

const newSigStarter = `    <div style="margin:28px 0 0 0; border-top:1px solid #f0ecf2; padding-top:20px; display:flex; align-items:center; gap:16px;">
      <img src="https://thedentalshaman.com/marc_smiling_nature.jpg" alt="Dr. Marc Mortiboys" width="56" height="56" style="width:56px; height:56px; border-radius:50%; object-fit:cover; border:2px solid #744B6F; display:block;">
      <div>
        <p style="margin:0 0 3px 0; font-size:13px; color:#666666; font-style:italic;">Warmest holistic wishes,</p>
        <p style="margin:0 0 2px 0; font-size:15px; font-weight:bold; color:#0d0820;">Dr. Marc Mortiboys (BDS)</p>
        <p style="margin:0; font-size:12px; color:#888888;">Founder &amp; Biological Dental Surgeon &middot; The Dental Shaman</p>
      </div>
    </div>`;

if (appCode.includes(oldSigStarter)) {
  appCode = appCode.replace(oldSigStarter, newSigStarter);
  console.log('Added verified founder portrait to DEFAULT_STARTER_CLINICAL_HTML');
}

// G. In openSessionInspector, update btnInspectorRetryFailed visibility and label
const oldRibbonAssign = `    if (ribbonEl) {
      ribbonEl.innerHTML = \`
        <span style="font-size:12px; font-weight:600; color:#0f172a;">Recipients: \${(s.recipients || []).length}</span>
        <span style="font-size:12px; font-weight:600; color:#16a34a;">&bull; Sent: \${sentCount}</span>
        <span style="font-size:12px; font-weight:600; color:#0284c7;">&bull; Scheduled: \${schCount}</span>
        \${failCount > 0 ? \`<span style="font-size:12px; font-weight:600; color:#dc2626;">&bull; Failed: \${failCount}</span>\` : ''}
        \${convCount > 0 ? \`<span style="font-size:12px; font-weight:600; color:#008060;">&bull; Converted: \${convCount}</span>\` : ''}
      \`;
    }`;

const newRibbonAssign = `    if (ribbonEl) {
      ribbonEl.innerHTML = \`
        <span style="font-size:12px; font-weight:600; color:#0f172a;">Recipients: \${(s.recipients || []).length}</span>
        <span style="font-size:12px; font-weight:600; color:#16a34a;">&bull; Sent: \${sentCount}</span>
        <span style="font-size:12px; font-weight:600; color:#0284c7;">&bull; Scheduled: \${schCount}</span>
        \${failCount > 0 ? \`<span style="font-size:12px; font-weight:600; color:#dc2626;">&bull; Failed: \${failCount}</span>\` : ''}
        \${convCount > 0 ? \`<span style="font-size:12px; font-weight:600; color:#008060;">&bull; Converted: \${convCount}</span>\` : ''}
      \`;

      const btnRetryFailed = document.getElementById('btnInspectorRetryFailed');
      if (btnRetryFailed) {
        if (failCount > 0) {
          btnRetryFailed.style.display = 'inline-flex';
          btnRetryFailed.innerText = \`⚡ Send Again to Failed (\${failCount})\`;
        } else {
          btnRetryFailed.style.display = 'none';
        }
      }
    }`;

if (appCode.includes(oldRibbonAssign)) {
  appCode = appCode.replace(oldRibbonAssign, newRibbonAssign);
  console.log('Added btnInspectorRetryFailed toggle to openSessionInspector');
}

fs.writeFileSync(appJsPath, appCode, 'utf8');

console.log('--- 4. Updating asset cache version in index.html ---');
let html = fs.readFileSync(htmlPath, 'utf8');
html = html.replace(/style\.css\?v=18\.\d+/g, 'style.css?v=18.30');
html = html.replace(/app\.js\?v=18\.\d+/g, 'app.js?v=18.30');

// In sessionInspectorModal header, inject dynamic header actions
const oldInspectorHeader = `<div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          <button type="button" class="Polaris-Button Polaris-Button--destructive Polaris-Button--slim" id="btnInspectorDeleteSession" onclick="deleteCurrentInspectedSession()">`;

const newInspectorHeader = `<div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          <button type="button" class="Polaris-Button Polaris-Button--primary Polaris-Button--slim" id="btnInspectorRetryFailed" style="background: #dc2626; border-color: #b91c1c; font-weight: 600; display: none;" onclick="retrySessionFailed(activeInspectedSessionId)">⚡ Send Again to Failed</button>
          <button type="button" class="Polaris-Button Polaris-Button--slim" id="btnInspectorResendAll" onclick="resendWholeSession(activeInspectedSessionId)">↺ Send Again to All</button>
          <button type="button" class="Polaris-Button Polaris-Button--destructive Polaris-Button--slim" id="btnInspectorDeleteSession" onclick="deleteCurrentInspectedSession()">`;

if (html.includes(oldInspectorHeader)) {
  html = html.replace(oldInspectorHeader, newInspectorHeader);
  console.log('Added Send Again to Failed and Send Again to All in sessionInspectorModal header');
}

fs.writeFileSync(htmlPath, html, 'utf8');

console.log('--- Patch complete! ---');
