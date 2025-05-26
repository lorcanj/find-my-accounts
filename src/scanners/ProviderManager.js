class ProviderManager {
  constructor() {
    this.providers = new Map();
    
    // Register default providers
  }

  registerProvider(provider) {
    this.providers.set(provider.name, provider);
  }

  getProvider(name) {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Provider '${name}' not found.`);
    }
    return provider;
  }

  getAllProviders() {
    return Array.from(this.providers.values());
  }
}

// Export a singleton instance
export default new ProviderManager();