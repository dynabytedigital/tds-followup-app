const axios = require('axios');

async function sendProdTest() {
  const PROD_URL = 'https://tds-followup-app.onrender.com';
  const MASTER_KEY = 'TDS-FLW#8E92B1C4-6A47D0F1-03B52E89';
  const auth = await axios.post(PROD_URL + '/api/auth/access', { accessKey: MASTER_KEY });
  const token = auth.data.token;

  console.log('[Prod Test] Authenticated. Sending real email to devnayem30@gmail.com with verified images...');
  const res = await axios.post(PROD_URL + '/api/followup/test', {
    testEmail: 'devnayem30@gmail.com',
    templateId: 'water_flosser_1',
    customSubject: 'Your Flosser Has Arrived: 7-Day Adaptation Technique (Profile Photo & Media Fixed)',
    customDiscountCode: 'TDS-FLOSSER-IMG'
  }, {
    headers: { Authorization: 'Bearer ' + token }
  });

  console.log('[Prod Test] Result:', res.data);
}

sendProdTest().catch(err => {
  console.error('[Error]:', err.response?.data || err.message);
  process.exit(1);
});
