const axios = require('axios');

async function testLocalFlow() {
  const BASE = 'http://localhost:3070';
  const MASTER_KEY = 'TDS-FLW#8E92B1C4-6A47D0F1-03B52E89';

  console.log('[Test] 1. Authenticating...');
  const authRes = await axios.post(`${BASE}/api/auth/access`, { accessKey: MASTER_KEY });
  const token = authRes.data.token;
  const headers = { Authorization: `Bearer ${token}` };

  console.log('[Test] 2. Querying sessions...');
  const sessRes = await axios.get(`${BASE}/api/activity-sessions`, { headers });
  console.log('Total sessions:', sessRes.data.sessions.length);

  console.log('[Test] 3. Testing dispatches list...');
  const dispRes = await axios.get(`${BASE}/api/tracking/dispatches?limit=5`, { headers });
  console.log('Dispatches returned:', dispRes.data.dispatches.length);
  if (dispRes.data.dispatches.length > 0) {
    const d = dispRes.data.dispatches[0];
    console.log('Sample dispatch status:', d.status, 'customerEmail:', d.customerEmail);
  }

  console.log('[Test] Local verification successful!');
}

testLocalFlow().catch(err => {
  console.error('[Test Error]:', err.response?.data || err.message);
  process.exit(1);
});
