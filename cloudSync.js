const fs = require('fs');
const path = require('path');
const axios = require('axios');

class CloudSync {
  constructor() {
    this.token = process.env.GITHUB_TOKEN;
    this.repo = 'dynabytedigital/tds-followup-app';
    this.filePath = 'data/db.json';
    this.dbPath = path.join(__dirname, 'data', 'db.json');
    this.syncTimeout = null;
    this.isSyncing = false;
  }

  getHeaders() {
    return {
      Authorization: `token ${this.token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'RetentionFlow-AutoSync'
    };
  }

  // Debounced push to GitHub
  schedulePush() {
    if (!this.token) return;
    if (this.syncTimeout) clearTimeout(this.syncTimeout);
    this.syncTimeout = setTimeout(() => {
      this.pushToGitHub().catch(err => {
        console.warn('[CloudSync] Auto-sync push warning:', err.response?.data?.message || err.message);
      });
    }, 4000); // 4-second debounce
  }

  async pushToGitHub() {
    if (!this.token || this.isSyncing) return;
    if (!fs.existsSync(this.dbPath)) return;

    this.isSyncing = true;
    try {
      const content = fs.readFileSync(this.dbPath, 'utf8');
      let dataObj;
      try {
        dataObj = JSON.parse(content);
        if (dataObj.settings) {
          delete dataObj.settings.smtpPass;
          delete dataObj.settings.resendApiKey;
        }
        dataObj.sessions = {};
      } catch (e) {
        dataObj = {};
      }
      const base64Content = Buffer.from(JSON.stringify(dataObj, null, 2)).toString('base64');

      // 1. Get current remote file SHA
      let sha = null;
      try {
        const getRes = await axios.get(
          `https://api.github.com/repos/${this.repo}/contents/${this.filePath}`,
          { headers: this.getHeaders(), timeout: 8000 }
        );
        sha = getRes.data?.sha;
      } catch (e) {
        // File may not exist yet in remote
      }

      // 2. Put file to GitHub
      const payload = {
        message: `chore(data): auto-sync analytics & session records [${new Date().toISOString()}]`,
        content: base64Content,
        ...(sha ? { sha } : {})
      };

      await axios.put(
        `https://api.github.com/repos/${this.repo}/contents/${this.filePath}`,
        payload,
        { headers: this.getHeaders(), timeout: 10000 }
      );

      console.log('[CloudSync] Successfully backed up database to GitHub cloud repository!');
    } catch (err) {
      console.warn('[CloudSync] Failed to push to GitHub:', err.response?.data?.message || err.message);
    } finally {
      this.isSyncing = false;
    }
  }

  // Pull latest remote db from GitHub on server startup if available
  async pullFromGitHub() {
    if (!this.token) return;
    try {
      console.log('[CloudSync] Checking GitHub cloud repository for latest database state...');
      const res = await axios.get(
        `https://api.github.com/repos/${this.repo}/contents/${this.filePath}`,
        { headers: this.getHeaders(), timeout: 8000 }
      );

      if (res.data && res.data.content) {
        const remoteStr = Buffer.from(res.data.content, 'base64').toString('utf8');
        const remoteData = JSON.parse(remoteStr);

        let localData = {};
        if (fs.existsSync(this.dbPath)) {
          try {
            localData = JSON.parse(fs.readFileSync(this.dbPath, 'utf8'));
          } catch (e) {}
        }

        const remoteDispatches = (remoteData.dispatches || []).length;
        const localDispatches = (localData.dispatches || []).length;

        // If remote has more or equal data, update local disk
        if (remoteDispatches >= localDispatches) {
          fs.writeFileSync(this.dbPath, JSON.stringify(remoteData, null, 2), 'utf8');
          console.log(`[CloudSync] Loaded cloud database state: ${remoteDispatches} dispatches, ${(remoteData.activitySessions || []).length} sessions.`);
          return remoteData;
        }
      }
    } catch (err) {
      console.warn('[CloudSync] Could not pull from GitHub:', err.response?.data?.message || err.message);
    }
    return null;
  }
}

module.exports = new CloudSync();
