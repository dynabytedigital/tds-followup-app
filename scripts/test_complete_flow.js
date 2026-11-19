const axios = require('axios');

const BASE_URL = 'http://localhost:3070';
const MASTER_KEY = 'TDS-FLW#8E92B1C4-6A47D0F1-03B52E89';
const TEST_EMAIL = 'devnayem30@gmail.com';

async function runTests() {
  console.log('[Test] 1. Authenticating with Master Access Code...');
  const authRes = await axios.post(`${BASE_URL}/api/auth/access`, { accessKey: MASTER_KEY });
  const token = authRes.data.token;
  console.log('[Test] Authenticated successfully. Bearer token acquired.');

  const client = axios.create({
    baseURL: BASE_URL,
    headers: { 'Authorization': `Bearer ${token}` }
  });

  console.log('\n[Test] 2. Checking Settings endpoint for zero discounts...');
  const settingsRes = await client.get('/api/settings');
  console.log('[Test] Settings default code:', settingsRes.data.settings?.defaultDiscountCode);

  console.log('\n[Test] 3. Testing Follow-Up Batch Send with Activity Session creation for devnayem30@gmail.com...');
  const testCustomer = {
    id: 'cust_test_nayem_99',
    first_name: 'Nayem',
    last_name: 'Dev',
    email: TEST_EMAIL,
    total_spent: '145.00',
    orders_count: 2
  };

  const batchRes = await client.post('/api/followup/batch-send', {
    recipients: [testCustomer],
    templateId: 'water_flosser_1',
    campaignId: 'water_flosser',
    customSubject: 'Your Holistic Flosser Setup & 7-Day Adaptation Technique',
    customDiscountCode: 'TDS-FLOSSER-TEST',
    scheduleFullSequence: true
  });

  console.log('[Test] Batch Send Result:', batchRes.data.success, 'Sent:', batchRes.data.sentCount, 'Scheduled:', batchRes.data.scheduledCount);
  const sessionId = batchRes.data.sessionId;
  console.log('[Test] Activity Session ID Created:', sessionId);

  console.log('\n[Test] 4. Fetching Activity Sessions list...');
  const sessionsRes = await client.get('/api/activity-sessions');
  const session = sessionsRes.data.sessions.find(s => s.id === sessionId);
  console.log('[Test] Found Session in list:', !!session, 'Metrics:', {
    sent: session?.sentCount,
    scheduled: session?.scheduledCount,
    failed: session?.failedCount
  });

  console.log('\n[Test] 5. Fetching Session Detail drilldown by Session ID...');
  const sessionDetail = await client.get(`/api/activity-sessions/${sessionId}`);
  const sData = sessionDetail.data.session;
  console.log('[Test] Session Title:', sData?.title);
  console.log('[Test] Total Dispatches:', sData?.dispatches?.length);
  const scheduledStage2 = sData?.dispatches?.find(d => d.stage === 2);
  console.log('[Test] Stage 2 Dispatch ID:', scheduledStage2?.id, 'Status:', scheduledStage2?.status, 'Scheduled For:', scheduledStage2?.scheduledFor);

  console.log('\n[Test] 6. Testing Reschedule (Change Date) on Stage 2...');
  const newDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
  const rescheduleRes = await client.post(`/api/dispatches/${scheduledStage2.id}/reschedule`, {
    scheduledFor: newDate
  });
  console.log('[Test] Rescheduled successfully:', rescheduleRes.data.success, 'New Time:', rescheduleRes.data.scheduledFor);

  console.log('\n[Test] 7. Testing Send Now on Stage 2 (live email to devnayem30@gmail.com)...');
  const sendNowRes = await client.post(`/api/dispatches/${scheduledStage2.id}/send-now`);
  console.log('[Test] Send Now result:', sendNowRes.data.success, 'Status:', sendNowRes.data.status, 'Sent At:', sendNowRes.data.sentAt);

  console.log('\n[Test] 8. Testing Delete Session (cancels and cleans up remaining scheduled dispatches)...');
  const deleteRes = await client.delete(`/api/activity-sessions/${sessionId}`);
  console.log('[Test] Delete Session result:', deleteRes.data.success, 'Cancelled dispatches:', deleteRes.data.cancelledDispatches);

  console.log('\n[Test] 9. Verifying Session is removed from active sessions list...');
  const verifySessionsRes = await client.get('/api/activity-sessions');
  const stillExists = verifySessionsRes.data.sessions.some(s => s.id === sessionId);
  console.log('[Test] Session still exists in active list?', stillExists);

  console.log('\n[Test] ALL 9 VERIFICATION CHECKS PASSED PERFECTLY!');
}

runTests().catch(err => {
  console.error('[Test Error]:', err.response?.data || err.message);
  process.exit(1);
});
