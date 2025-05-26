class GmailProvider {
  name = 'gmail';

  async authenticate() {
    // ...provider-specific auth logic
    return token;
  }

  async scan(token, options = {}) {
    // ...fetch and process messages/accounts
    return accountsArray;
  }

  normalizeAccount(rawData) {
    // ...convert raw provider data to standard account object
    return { /* ... */ };
  }
}