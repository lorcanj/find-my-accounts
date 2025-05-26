import { describe, it, expect } from 'vitest';
import { extractAccountsFromMessages } from '../../src/scanners/accountMatcher.js';
import Account from '../../src/models/Account.js';

describe('extractAccountsFromMessages', () => {
  // ========================================
  // 1. Basic functionality tests
  // ========================================
  
  describe('basic functionality', () => {
    it('returns an empty array when given no messages', () => {
      // Test that the function handles empty input gracefully
      const result = extractAccountsFromMessages([]);
      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });

    it('returns an empty array when given undefined', () => {
      // Test that the function handles undefined input without throwing
      const result = extractAccountsFromMessages(undefined);
      expect(result).toEqual([]);
    });

    it('throws an error when given null', () => {
      // Test that the function throws when given null input
      // The code currently doesn't handle null, which is a valid design choice
      // since messages should always be an array
      expect(() => extractAccountsFromMessages(null)).toThrow();
    });

    it('accepts a single message object (not in an array)', () => {
      // Test that the function can handle a single message object
      // This tests the array normalization logic
      const message = {
        canonicalKey: 'key1',
        from: 'sender@example.com',
        subject: 'Test Subject',
        displayName: 'Test Sender',
        snippet: 'Test snippet'
      };
      const result = extractAccountsFromMessages(message);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(Account);
    });

    it('returns an Account instance for a single valid message', () => {
      // Test that a valid message produces an Account object
      const messages = [{
        canonicalKey: 'unique-key',
        from: 'noreply@service.com',
        subject: 'Welcome to Service',
        displayName: 'Service Name',
        snippet: 'Welcome to our service'
      }];
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(Account);
    });

    it('returns multiple accounts for distinct canonicalKeys', () => {
      // Test that messages with different canonicalKeys create separate accounts
      const messages = [
        { canonicalKey: 'key-a', from: 'User One <one@example.com>', subject: 'Welcome', snippet: 'hey' },
        { canonicalKey: 'key-b', from: 'User Two <two@example.com>', subject: 'Account created', snippet: 'hello' },
        { canonicalKey: 'key-c', from: 'User Three <three@example.com>', subject: 'Hi', snippet: 'test' }
      ];
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result).toHaveLength(3);
      result.forEach(account => {
        expect(account).toBeInstanceOf(Account);
      });
    });
  });

  // ========================================
  // 2. CanonicalKey handling and deduplication
  // ========================================
  
  describe('canonicalKey deduplication', () => {
    it('deduplicates messages with the same canonicalKey', () => {
      // Test that duplicate canonicalKeys only create one account
      // This is critical for avoiding duplicate accounts from the same service
      const messages = [
        { canonicalKey: 'same-key', from: 'service@example.com', subject: 'Welcome', snippet: 'first' },
        { canonicalKey: 'same-key', from: 'service@example.com', subject: 'Welcome', snippet: 'second' }
      ];
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result).toHaveLength(1);
    });

    it('keeps the first occurrence when deduplicating by canonicalKey', () => {
      // Test that when duplicates are found, we keep the first message's data
      const messages = [
        { 
          canonicalKey: 'duplicate', 
          from: 'first@example.com', 
          subject: 'First Subject', 
          displayName: 'First Name',
          snippet: 'First snippet' 
        },
        { 
          canonicalKey: 'duplicate', 
          from: 'second@example.com', 
          subject: 'Second Subject', 
          displayName: 'Second Name',
          snippet: 'Second snippet' 
        }
      ];
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('First Name');
      expect(result[0].subject).toBe('First Subject');
      expect(result[0].from).toBe('first@example.com');
      expect(result[0].snippet).toBe('First snippet');
    });

    it('handles many messages with same canonicalKey efficiently', () => {
      // Test deduplication with a larger number of duplicate messages
      // This ensures the Set-based deduplication works correctly at scale
      const messages = Array.from({ length: 100 }, (_, i) => ({
        canonicalKey: 'same-key',
        from: `sender${i}@example.com`,
        subject: `Subject ${i}`,
        snippet: `Snippet ${i}`
      }));
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result).toHaveLength(1);
    });

    it('correctly deduplicates mixed unique and duplicate keys', () => {
      // Test a realistic scenario with some unique and some duplicate keys
      const messages = [
        { canonicalKey: 'unique1', from: 'a@example.com', subject: 'A', snippet: 'a' },
        { canonicalKey: 'duplicate', from: 'b@example.com', subject: 'B', snippet: 'b' },
        { canonicalKey: 'unique2', from: 'c@example.com', subject: 'C', snippet: 'c' },
        { canonicalKey: 'duplicate', from: 'd@example.com', subject: 'D', snippet: 'd' },
        { canonicalKey: 'unique3', from: 'e@example.com', subject: 'E', snippet: 'e' },
        { canonicalKey: 'duplicate', from: 'f@example.com', subject: 'F', snippet: 'f' }
      ];
      
      const result = extractAccountsFromMessages(messages);
      
      // Should have 4 accounts: unique1, duplicate (first occurrence), unique2, unique3
      expect(result).toHaveLength(4);
    });
  });

  // ========================================
  // 3. Field extraction tests
  // ========================================
  
  describe('field extraction', () => {
    it('correctly extracts displayName into name field', () => {
      // Test that the displayName property is mapped to the Account's name field
      const messages = [{
        canonicalKey: 'key1',
        displayName: 'Company Name',
        from: 'noreply@company.com',
        subject: 'Welcome',
        snippet: 'Thanks for signing up'
      }];
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result[0].name).toBe('Company Name');
    });

    it('correctly extracts from field', () => {
      // Test that the from field is properly extracted
      const messages = [{
        canonicalKey: 'key1',
        from: 'support@service.com',
        subject: 'Test',
        snippet: 'Test'
      }];
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result[0].from).toBe('support@service.com');
    });

    it('correctly extracts subject field', () => {
      // Test that the subject field is properly extracted
      const messages = [{
        canonicalKey: 'key1',
        from: 'test@example.com',
        subject: 'Welcome to Our Service',
        snippet: 'Thanks'
      }];
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result[0].subject).toBe('Welcome to Our Service');
    });

    it('correctly extracts snippet field', () => {
      // Test that the snippet field is properly extracted
      const messages = [{
        canonicalKey: 'key1',
        from: 'test@example.com',
        subject: 'Test',
        snippet: 'This is the email preview snippet'
      }];
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result[0].snippet).toBe('This is the email preview snippet');
    });

    it('extracts all fields correctly in a complete message', () => {
      // Test that all fields are extracted together in a realistic scenario
      const messages = [{
        canonicalKey: 'complete-key',
        displayName: 'GitHub',
        from: 'noreply@github.com',
        subject: '[GitHub] Please verify your email address',
        snippet: 'Welcome to GitHub! Please verify your email address to get started.'
      }];
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('GitHub');
      expect(result[0].from).toBe('noreply@github.com');
      expect(result[0].subject).toBe('[GitHub] Please verify your email address');
      expect(result[0].snippet).toBe('Welcome to GitHub! Please verify your email address to get started.');
    });
  });

  // ========================================
  // 4. Edge cases - missing or empty fields
  // ========================================
  
  describe('missing and empty fields', () => {
    it('handles missing displayName by using empty string', () => {
      // Test that when displayName is missing, the Account's name defaults to ''
      const messages = [{
        canonicalKey: 'key1',
        from: 'test@example.com',
        subject: 'Test',
        snippet: 'Test'
      }];
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result[0].name).toBe('');
    });

    it('handles missing from field by using empty string', () => {
      // Test that when from is missing, it defaults to ''
      const messages = [{
        canonicalKey: 'key1',
        displayName: 'Test',
        subject: 'Test',
        snippet: 'Test'
      }];
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result[0].from).toBe('');
    });

    it('handles missing subject field by using empty string', () => {
      // Test that when subject is missing, it defaults to ''
      const messages = [{
        canonicalKey: 'key1',
        displayName: 'Test',
        from: 'test@example.com',
        snippet: 'Test'
      }];
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result[0].subject).toBe('');
    });

    it('handles missing snippet field with Account constructor default', () => {
      // Test that when snippet is missing, the Account constructor's default is used
      // The Account class has a default value for snippet parameter
      const messages = [{
        canonicalKey: 'key1',
        displayName: 'Test',
        from: 'test@example.com',
        subject: 'Test'
      }];
      
      const result = extractAccountsFromMessages(messages);
      
      // Account constructor defaults snippet to '', so undefined becomes ''
      expect(result[0].snippet).toBe('');
    });

    it('handles empty string values for all fields', () => {
      // Test that empty strings are handled correctly (not treated as missing)
      const messages = [{
        canonicalKey: 'key1',
        displayName: '',
        from: '',
        subject: '',
        snippet: ''
      }];
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('');
      expect(result[0].from).toBe('');
      expect(result[0].subject).toBe('');
      expect(result[0].snippet).toBe('');
    });

    it('handles message with only canonicalKey', () => {
      // Test the minimal valid message - just a canonicalKey
      const messages = [{
        canonicalKey: 'minimal-key'
      }];
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(Account);
      expect(result[0].name).toBe('');
      expect(result[0].from).toBe('');
      expect(result[0].subject).toBe('');
    });

    it('handles null values in fields', () => {
      // Test that null values in fields are handled gracefully
      const messages = [{
        canonicalKey: 'key1',
        displayName: null,
        from: null,
        subject: null,
        snippet: null
      }];
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result).toHaveLength(1);
      // The || operator in the code converts null to empty string
      expect(result[0].name).toBe('');
      expect(result[0].from).toBe('');
      expect(result[0].subject).toBe('');
    });

    it('handles undefined canonicalKey by treating it as a valid key', () => {
      // Test that messages without canonicalKey are still processed
      // Note: undefined canonicalKey will be used as the key
      const messages = [
        { from: 'test1@example.com', subject: 'Test 1', snippet: 'one' },
        { from: 'test2@example.com', subject: 'Test 2', snippet: 'two' }
      ];
      
      const result = extractAccountsFromMessages(messages);
      
      // Both messages will have undefined canonicalKey, so they'll be deduplicated
      expect(result).toHaveLength(1);
    });

    it('handles messages with duplicate undefined canonicalKeys', () => {
      // Test that multiple messages with undefined canonicalKey are deduplicated
      const messages = [
        { from: 'test1@example.com', subject: 'First' },
        { from: 'test2@example.com', subject: 'Second' },
        { from: 'test3@example.com', subject: 'Third' }
      ];
      
      const result = extractAccountsFromMessages(messages);
      
      // All have undefined canonicalKey, so only first is kept
      expect(result).toHaveLength(1);
      expect(result[0].from).toBe('test1@example.com');
      expect(result[0].subject).toBe('First');
    });
  });

  // ========================================
  // 5. Special characters and formatting
  // ========================================
  
  describe('special characters and formatting', () => {
    it('handles special characters in displayName', () => {
      // Test that special characters in names are preserved
      const messages = [{
        canonicalKey: 'key1',
        displayName: 'Company™ & Partners® — Official',
        from: 'test@example.com',
        subject: 'Test',
        snippet: 'Test'
      }];
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result[0].name).toBe('Company™ & Partners® — Official');
    });

    it('handles special characters in subject', () => {
      // Test that special characters in subjects are preserved
      const messages = [{
        canonicalKey: 'key1',
        from: 'test@example.com',
        subject: 'Re: Your order #12345 — Status: ✓ Confirmed',
        snippet: 'Test'
      }];
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result[0].subject).toBe('Re: Your order #12345 — Status: ✓ Confirmed');
    });

    it('handles Unicode and emoji in fields', () => {
      // Test that Unicode characters and emoji are handled correctly
      const messages = [{
        canonicalKey: 'key1',
        displayName: '🚀 Startup Inc',
        from: 'hello@startup.com',
        subject: '🎉 Welcome! 你好',
        snippet: 'Unicode test: café, naïve, 日本語'
      }];
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result[0].name).toBe('🚀 Startup Inc');
      expect(result[0].subject).toBe('🎉 Welcome! 你好');
      expect(result[0].snippet).toBe('Unicode test: café, naïve, 日本語');
    });

    it('handles very long field values', () => {
      // Test that long strings don't cause issues
      const longString = 'A'.repeat(1000);
      const messages = [{
        canonicalKey: 'key1',
        displayName: longString,
        from: 'test@example.com',
        subject: longString,
        snippet: longString
      }];
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result).toHaveLength(1);
      expect(result[0].name).toHaveLength(1000);
      expect(result[0].subject).toHaveLength(1000);
      expect(result[0].snippet).toHaveLength(1000);
    });

    it('handles HTML entities in fields', () => {
      // Test that HTML entities are preserved (not decoded)
      const messages = [{
        canonicalKey: 'key1',
        displayName: 'Company &amp; Co',
        from: 'test@example.com',
        subject: 'Test &lt;important&gt;',
        snippet: 'Hello &quot;world&quot;'
      }];
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result[0].name).toBe('Company &amp; Co');
      expect(result[0].subject).toBe('Test &lt;important&gt;');
      expect(result[0].snippet).toBe('Hello &quot;world&quot;');
    });
  });

  // ========================================
  // 6. Real-world scenarios
  // ========================================
  
  describe('real-world scenarios', () => {
    it('handles typical welcome email structure', () => {
      // Test a realistic welcome email message structure
      const messages = [{
        canonicalKey: 'netflix|verify|signup',
        displayName: 'Netflix',
        from: 'info@account.netflix.com',
        subject: 'Welcome to Netflix!',
        snippet: 'You\'re all set! Start watching today.'
      }];
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Netflix');
      expect(result[0].from).toBe('info@account.netflix.com');
    });

    it('handles verification email patterns', () => {
      // Test common verification email patterns
      const messages = [
        {
          canonicalKey: 'github|verify',
          displayName: 'GitHub',
          from: 'noreply@github.com',
          subject: '[GitHub] Please verify your device',
          snippet: 'Verify your device to continue'
        },
        {
          canonicalKey: 'google|verify',
          displayName: 'Google',
          from: 'no-reply@accounts.google.com',
          subject: 'Verify your Google Account',
          snippet: 'Please confirm your email address'
        }
      ];
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('GitHub');
      expect(result[1].name).toBe('Google');
    });

    it('deduplicates multiple emails from same service', () => {
      // Test realistic scenario: multiple emails from one service over time
      const messages = [
        {
          canonicalKey: 'amazon|account',
          displayName: 'Amazon',
          from: 'account-update@amazon.com',
          subject: 'Welcome to Amazon',
          snippet: 'Thanks for creating an account'
        },
        {
          canonicalKey: 'amazon|account',
          displayName: 'Amazon',
          from: 'order-update@amazon.com',
          subject: 'Your order has shipped',
          snippet: 'Track your package'
        },
        {
          canonicalKey: 'amazon|account',
          displayName: 'Amazon.com',
          from: 'marketing@amazon.com',
          subject: 'Daily deals for you',
          snippet: 'Check out today\'s offers'
        }
      ];
      
      const result = extractAccountsFromMessages(messages);
      
      // Should only create one Amazon account
      expect(result).toHaveLength(1);
      // Should use the first message's data
      expect(result[0].name).toBe('Amazon');
      expect(result[0].subject).toBe('Welcome to Amazon');
    });

    it('handles mixed services with various canonicalKey formats', () => {
      // Test multiple different services with different key formats
      const messages = [
        { canonicalKey: 'simple', displayName: 'Service A', from: 'a@example.com', subject: 'A', snippet: 'a' },
        { canonicalKey: 'with|pipes', displayName: 'Service B', from: 'b@example.com', subject: 'B', snippet: 'b' },
        { canonicalKey: 'with-dashes', displayName: 'Service C', from: 'c@example.com', subject: 'C', snippet: 'c' },
        { canonicalKey: 'with_underscores', displayName: 'Service D', from: 'd@example.com', subject: 'D', snippet: 'd' },
        { canonicalKey: 'MixedCase123', displayName: 'Service E', from: 'e@example.com', subject: 'E', snippet: 'e' }
      ];
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result).toHaveLength(5);
      expect(result.map(a => a.name)).toEqual(['Service A', 'Service B', 'Service C', 'Service D', 'Service E']);
    });
  });

  // ========================================
  // 7. Performance and edge cases
  // ========================================
  
  describe('performance and stress tests', () => {
    it('handles large number of unique messages efficiently', () => {
      // Test that the function can handle many unique messages
      const messages = Array.from({ length: 1000 }, (_, i) => ({
        canonicalKey: `key-${i}`,
        displayName: `Service ${i}`,
        from: `service${i}@example.com`,
        subject: `Welcome ${i}`,
        snippet: `Snippet ${i}`
      }));
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result).toHaveLength(1000);
      result.forEach((account, i) => {
        expect(account.name).toBe(`Service ${i}`);
      });
    });

    it('handles empty objects in messages array', () => {
      // Test that empty objects are handled (they'll have undefined canonicalKey)
      const messages = [
        { canonicalKey: 'key1', from: 'test1@example.com', subject: 'Test 1' },
        {},
        { canonicalKey: 'key2', from: 'test2@example.com', subject: 'Test 2' }
      ];
      
      const result = extractAccountsFromMessages(messages);
      
      // key1, empty object (undefined key), key2
      expect(result).toHaveLength(3);
    });

    it('handles array with mixture of valid and minimal messages', () => {
      // Test realistic scenario with varied message completeness
      const messages = [
        { 
          canonicalKey: 'complete',
          displayName: 'Complete Service',
          from: 'complete@example.com',
          subject: 'Complete Subject',
          snippet: 'Complete snippet'
        },
        {
          canonicalKey: 'minimal',
          from: 'minimal@example.com'
        },
        {
          canonicalKey: 'partial',
          displayName: 'Partial Service',
          snippet: 'Just a snippet'
        }
      ];
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('Complete Service');
      expect(result[1].name).toBe('');
      expect(result[1].from).toBe('minimal@example.com');
      expect(result[2].name).toBe('Partial Service');
      expect(result[2].from).toBe('');
    });
  });
});
