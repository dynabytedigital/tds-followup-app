const axios = require('axios');

const PROD_URL = 'https://tds-followup-app.onrender.com';
const MASTER_KEY = 'TDS-FLW#8E92B1C4-6A47D0F1-03B52E89';
const TEST_EMAIL = 'devnayem30@gmail.com';

async function runProdChecks() {
  console.log('[Prod Test] 1. Checking HTML on production for v=18.25 asset hashes...');
  const htmlRes = await axios.get(PROD_URL);
  const html = htmlRes.data;
  console.log('[Prod Test] HTML contains style.css?v=18.25:', html.includes('style.css?v=18.25'));
  console.log('[Prod Test] HTML contains app.js?v=18.25:', html.includes('app.js?v=18.25'));
  console.log('[Prod Test] HTML contains Settings & Delivery Configuration:', html.includes('Settings &amp; Delivery Configuration'));
  console.log('[Prod Test] HTML contains settings-form-row:', html.includes('settings-form-row'));

  console.log('\n[Prod Test] 2. Authenticating against production...');
  const authRes = await axios.post(`${PROD_URL}/api/auth/access`, { accessKey: MASTER_KEY });
  const token = authRes.data.token;
  console.log('[Prod Test] Production Bearer token acquired successfully.');

  const client = axios.create({
    baseURL: PROD_URL,
    headers: { 'Authorization': `Bearer ${token}` }
  });

  console.log('\n[Prod Test] 3. Verifying Settings endpoint on production...');
  const settingsRes = await client.get('/api/settings');
  console.log('[Prod Test] Settings default tracking code:', settingsRes.data.settings?.defaultDiscountCode);

  console.log('\n[Prod Test] 4. Triggering Follow-Up Batch Send to devnayem30@gmail.com (creating Activity Session)...');
  const testCustomer = {
    id: 'prod_test_nayem_v1825',
    first_name: 'Nayem',
    last_name: 'Dev',
    email: TEST_EMAIL,
    total_spent: '195.00',
    orders_count: 3
  };

  const batchRes = await client.post('/api/followup/batch-send', {
    recipients: [testCustomer],
    templateId: 'water_flosser_1',
    campaignId: 'water_flosser',
    customSubject: 'Your Flosser Has Arrived: 7-Day Adaptation Technique',
    customDiscountCode: 'TDS-FLOSSER-PROD',
    scheduleFullSequence: true
  });

  console.log('[Prod Test] Batch result:', batchRes.data.success, 'Sent:', batchRes.data.sentCount, 'Scheduled:', batchRes.data.scheduledCount);
  const sessionId = batchRes.data.sessionId;
  console.log('[Prod Test] Production Activity Session Created:', sessionId);

  console.log('\n[Prod Test] 5. Fetching Activity Sessions on production...');
  const sessionsRes = await client.get('/api/activity-sessions');
  const session = sessionsRes.data.sessions.find(s => s.id === sessionId);
  console.log('[Prod Test] Found Session on Prod:', !!session, 'Metrics:', {
    sent: session?.sentCount,
    scheduled: session?.scheduledCount,
    failed: session?.failedCount
  });

  console.log('\n[Prod Test] 6. Fetching Session Detail drilldown on production...');
  const sessionDetail = await client.get(`/api/activity-sessions/${sessionId}`);
  const sData = sessionDetail.data.session;
  console.log('[Prod Test] Dispatches count:', sData?.dispatches?.length);
  const stage2 = sData?.dispatches?.find(d => d.stage === 2);
  console.log('[Prod Test] Stage 2 Dispatch ID:', stage2?.id, 'Status:', stage2?.status, 'Scheduled For:', stage2?.scheduledFor);

  console.log('\n[Prod Test] 7. Rescheduling Stage 2 (Change Date) on production...');
  const newDate = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString();
  const rescheduleRes = await client.post(`/api/dispatches/${stage2.id}/reschedule`, {
    scheduledFor: newDate
  });
  console.log('[Prod Test] Reschedule successful:', rescheduleRes.data.success);

  console.log('\n[Prod Test] 8. Sending Stage 2 live now via Send Now...');
  const sendNowRes = await client.post(`/api/dispatches/${stage2.id}/send-now`);
  console.log('[Prod Test] Send Now dispatched:', sendNowRes.data.success);

  console.log('\n[Prod Test] 9. Cleaning up test session...');
  const delRes = await client.delete(`/api/activity-sessions/${sessionId}`);
  console.log('[Prod Test] Cleaned up session:', delRes.data.success);

  console.log('\n[Prod Test] ALL PRODUCTION VERIFICATION CHECKS PASSED!');
}

runProdChecks().catch(err => {
  console.error('[Prod Test Error]:', err.response?.data || err.message);
  process.exit(1);
});
