const fs = require('fs');
const path = require('path');

const appJsPath = path.join(__dirname, '..', 'public', 'app.js');
let content = fs.readFileSync(appJsPath, 'utf8');

// 1. Patch actionsHtml in renderDispatches
const actionsRegex = /let actionsHtml = '';[\s\S]*?else if \(d\.status === 'failed'\) \{[\s\S]*?\} else \{[\s\S]*?actionsHtml = `<span style="font-size:12px; color:var\(--p-color-text-subdued\);">&mdash;<\/span>`;[\s\S]*?\}/;

const newActionsBlock = `let actionsHtml = '';
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
          <button type="button" class="Polaris-Button Polaris-Button--slim btn-failed-retry" style="font-size: 10.5px; padding: 2px 8px; color: #b91c1c; border-color: #fca5a5; background: #fff5f5; font-weight: 600; display: inline-flex; align-items: center; gap: 3px;" onclick="retryFailedDispatch('\${d.id}')" title="Retry Delivery to \${escapeHtml(d.customerEmail)}">
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

if (actionsRegex.test(content)) {
  content = content.replace(actionsRegex, newActionsBlock);
  console.log('actionsHtml regex matched and replaced!');
} else {
  console.error('actionsHtml regex DID NOT match');
}

// 2. Patch active sessions ribbon
const ribbonRegex = /container\.innerHTML = sessions\.slice\(0, 4\)\.map\(s => `[\s\S]*?`\)\.join\(''\);/;

const newRibbonBlock = `container.innerHTML = sessions.slice(0, 4).map(s => \`
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

if (ribbonRegex.test(content)) {
  content = content.replace(ribbonRegex, newRibbonBlock);
  console.log('ribbonRegex matched and replaced!');
} else {
  console.error('ribbonRegex DID NOT match');
}

// 3. Patch stageActions inside openSessionInspector
const stageActionsRegex = /\} else if \(isFail\) \{[\s\S]*?stageActions = `[\s\S]*?⚡ Retry Delivery[\s\S]*?`;[\s\S]*?\}/;

const newStageActionsBlock = `} else if (isFail) {
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

if (stageActionsRegex.test(content)) {
  content = content.replace(stageActionsRegex, newStageActionsBlock);
  console.log('stageActionsRegex matched and replaced!');
} else {
  console.error('stageActionsRegex DID NOT match');
}

// 4. In openSessionInspector, update btnInspectorRetryFailed visibility
const inspectorRibbonRegex = /if \(ribbonEl\) \{[\s\S]*?ribbonEl\.innerHTML = `[\s\S]*?`;[\s\S]*?\}/;

const newInspectorRibbonBlock = `if (ribbonEl) {
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

if (inspectorRibbonRegex.test(content)) {
  content = content.replace(inspectorRibbonRegex, newInspectorRibbonBlock);
  console.log('inspectorRibbonRegex matched and replaced!');
} else {
  console.error('inspectorRibbonRegex DID NOT match');
}

fs.writeFileSync(appJsPath, content, 'utf8');
console.log('Finished writing updated app.js!');
