import BaseProvider from './BaseProvider.js';
import Account from '../../models/Account.js'; // Assuming you want to return Account objects

const GMAIL_API_BASE = 'https://www.googleapis.com/gmail/v1/users/me/messages';

export default class GmailProvider extends BaseProvider {
  constructor() {
    super('gmail');
  }

  async authenticate() {
    return new Promise((resolve, reject) => {
      // Chrome identity is specific to the extension environment
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError || !token) {
          reject(chrome.runtime.lastError || 'No token retrieved');
        } else {
          resolve(token);
        }
      });
    });
  }

  async scan(token, options = { maxResults: 50 }) {
    try {
      // 1. Get Message IDs
      const listRes = await fetch(`${GMAIL_API_BASE}?maxResults=${options.maxResults}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const listData = await listRes.json();
      const messages = listData.messages || [];

      const detailPromises = messages.map((msg) =>
        fetch(`${GMAIL_API_BASE}/${msg.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      );
      const detailResponses = await Promise.all(detailPromises);
      const detailDataArray = await Promise.all(
        detailResponses.map((res) => res.json())
      );

      const accounts = detailDataArray.map((detailData) =>
        this.normaliseAccount(detailData)
      );

      return accounts;
    } catch (error) {
      console.error('Gmail scan error:', error);
      throw error;
    }
  }

  // this isn't normalising
  normaliseAccount(gmailData) {
    // Extract headers
    const headers = gmailData.payload?.headers || [];
    const getHeader = (name) => headers.find(h => h.name === name)?.value || '';

    return new Account({
      name: getHeader('From'), // Simplified logic
      subject: getHeader('Subject'),
      from: getHeader('From'),
      snippet: gmailData.snippet,
      // You would add your domain extraction logic here
      domain: 'todo-extract-domain.com' 
    });
  }
}