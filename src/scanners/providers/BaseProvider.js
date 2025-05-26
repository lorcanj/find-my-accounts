/**
 * Abstract base class for Email Providers.
 * This structure prepares for a future TypeScript interface.
 */
export default class BaseProvider {
  constructor(name) {
    if (this.constructor === BaseProvider) {
      throw new Error("Abstract classes can't be instantiated.");
    }
    this.name = name;
  }

  /**
   * Authenticate with the provider.
   * @returns {Promise<string>} The access token.
   */
  async authenticate() {
    throw new Error("Method 'authenticate()' must be implemented.");
  }

  /**
   * Scan the provider for emails/accounts.
   * @param {string} token - The access token from authenticate().
   * @param {object} options - Scan options (e.g., maxResults).
   * @returns {Promise<Array>} List of normalised Account objects.
   */
  async scan(token, options = {}) {
      throw new Error("Method 'scan()' must be implemented.");
  }

  /**
  * Convert provider-specific data to your app's Account model.
  * @param {object} rawData 
  * @returns {object} Account-compatible object
   */
  normaliseAccount(rawData) {
    throw new Error("Method 'normaliseAccount()' must be implemented.");
  }
}

/**
 * Provider contract notes:
 * - `scan(token, options)` MUST return a Promise resolving to an array of normalised
 *   Account-like objects. Each object should include at least a `from` string and
 *   either `subject` or `name` fields. Example shape:
 *   { from: 'Example <no-reply@example.com>', subject: 'Welcome', name: 'Example' }
 * - Normalising at the provider boundary keeps callers (popup, services, UI) simple
 *   and makes migration to TypeScript straightforward (the class acts like an interface).
 */