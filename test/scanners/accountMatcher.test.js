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
        subject: 'Welcome to Service',
        displayName: 'Test Sender'
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
        displayName: 'Service Name'
      }];
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(Account);
    });

    it('returns multiple accounts for distinct canonicalKeys', () => {
      // Test that messages with different canonicalKeys create separate accounts
      const messages = [
        { canonicalKey: 'key-a', from: 'User One <one@example.com>', subject: 'Welcome' },
        { canonicalKey: 'key-b', from: 'User Two <two@example.com>', subject: 'Account created' },
        { canonicalKey: 'key-c', from: 'User Three <three@example.com>', subject: 'Welcome Hi' }
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
        { canonicalKey: 'same-key', from: 'service@example.com', subject: 'Welcome' },
        { canonicalKey: 'same-key', from: 'service@example.com', subject: 'Welcome' }
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
          subject: 'First Welcome', 
          displayName: 'First Name'
        },
        { 
          canonicalKey: 'duplicate', 
          from: 'second@example.com', 
          subject: 'Second Welcome', 
          displayName: 'Second Name'
        }
      ];
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('First Name');
      expect(result[0].subject).toBe('First Welcome');
      expect(result[0].from).toBe('first@example.com');
    });

    it('handles many messages with same canonicalKey efficiently', () => {
      // Test deduplication with a larger number of duplicate messages
      // This ensures the Set-based deduplication works correctly at scale
      const messages = Array.from({ length: 100 }, (_, i) => ({
        canonicalKey: 'same-key',
        from: `sender${i}@example.com`,
        subject: `Welcome Subject ${i}`
      }));
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result).toHaveLength(1);
    });

    it('correctly deduplicates mixed unique and duplicate keys', () => {
      // Test a realistic scenario with some unique and some duplicate keys
      const messages = [
        { canonicalKey: 'unique1', from: 'a@example.com', subject: 'Welcome A' },
        { canonicalKey: 'duplicate', from: 'b@example.com', subject: 'Welcome B' },
        { canonicalKey: 'unique2', from: 'c@example.com', subject: 'Welcome C' },
        { canonicalKey: 'duplicate', from: 'd@example.com', subject: 'Welcome D' },
        { canonicalKey: 'unique3', from: 'e@example.com', subject: 'Welcome E' },
        { canonicalKey: 'duplicate', from: 'f@example.com', subject: 'Welcome F' }
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
        subject: 'Welcome'
      }];
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result[0].name).toBe('Company Name');
    });

    it('correctly extracts from field', () => {
      // Test that the from field is properly extracted
      const messages = [{
        canonicalKey: 'key1',
        from: 'support@service.com',
        subject: 'Welcome'
      }];
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result[0].from).toBe('support@service.com');
    });

    it('correctly extracts subject field', () => {
      // Test that the subject field is properly extracted
      const messages = [{
        canonicalKey: 'key1',
        from: 'test@example.com',
        subject: 'Welcome to Our Service'
      }];
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result[0].subject).toBe('Welcome to Our Service');
    });

    it('preserves domain in Account and JSON output when provided by normalised message', () => {
      const messages = [{
        canonicalKey: 'github|verify',
        displayName: 'GitHub',
        from: 'noreply@github.com',
        subject: '[GitHub] Please verify your email address',
        domain: 'github.com'
      }];

      const result = extractAccountsFromMessages(messages);

      expect(result).toHaveLength(1);
      expect(result[0].domain).toBe('github.com');

      const exportedJson = JSON.stringify(result);
      expect(exportedJson).toContain('"domain":"github.com"');
    });


    it('extracts all fields correctly in a complete message', () => {
      // Test that all fields are extracted together in a realistic scenario
      const messages = [{
        canonicalKey: 'complete-key',
        displayName: 'GitHub',
        from: 'noreply@github.com',
        subject: '[GitHub] Please verify your email address'
      }];
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('GitHub');
      expect(result[0].from).toBe('noreply@github.com');
      expect(result[0].subject).toBe('[GitHub] Please verify your email address');
    });
  });

  // ========================================
  // 4. Edge cases - missing or empty fields
  // ========================================
  
  describe('missing and empty fields', () => {
    it('handles missing displayName by falling back to from address', () => {
      // Test that when displayName is missing, the Account's name defaults to from address
      const messages = [{
        canonicalKey: 'key1',
        from: 'test@example.com',
        subject: 'Welcome'
      }];
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result[0].name).toBe('test@example.com');
    });

    it('handles missing from field by using empty string', () => {
      // Test that when from is missing, it defaults to ''
      const messages = [{
        canonicalKey: 'key1',
        displayName: 'Test',
        subject: 'Welcome'
      }];
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result[0].from).toBe('');
    });

    it('handles missing subject field by using empty string', () => {
      // Test that when subject is missing, it defaults to ''
      const messages = [{
        canonicalKey: 'key1',
        displayName: 'Support Team',
        from: 'test@example.com'
      }];
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result[0].subject).toBe('');
    });

    it('handles empty string values for all fields', () => {
      // Test that empty strings are handled correctly (not treated as missing)
      const messages = [{
        canonicalKey: 'key1',
        displayName: '',
        from: '',
        subject: ''
      }];
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result).toHaveLength(0);
    });

    it('handles message with only canonicalKey', () => {
      // Test the minimal valid message - just a canonicalKey
      const messages = [{
        canonicalKey: 'minimal-key'
      }];
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result).toHaveLength(0);
    });

    it('handles null values in fields', () => {
      // Test that null values in fields are handled gracefully
      const messages = [{
        canonicalKey: 'key1',
        displayName: null,
        from: null,
        subject: null
      }];
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result).toHaveLength(0);
    });

    it('does not deduplicate messages with undefined canonicalKey', () => {
      // Messages without a canonicalKey should each be kept individually
      const messages = [
        { from: 'test1@example.com', subject: 'Welcome 1' },
        { from: 'test2@example.com', subject: 'Welcome 2' }
      ];

      const result = extractAccountsFromMessages(messages);

      expect(result).toHaveLength(2);
    });

    it('keeps all messages when canonicalKey is undefined even from same sender', () => {
      const messages = [
        { from: 'noreply@example.com', subject: 'Welcome 1' },
        { from: 'noreply@example.com', subject: 'Welcome 2' },
        { from: 'noreply@example.com', subject: 'Welcome 3' }
      ];

      const result = extractAccountsFromMessages(messages);

      // No canonicalKey means no dedup — all are kept
      expect(result).toHaveLength(3);
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
        from: 'noreply@example.com',
        subject: 'Welcome'
      }];
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result[0].name).toBe('Company™ & Partners® — Official');
    });

    it('handles special characters in subject', () => {
      // Test that special characters in subjects are preserved
      const messages = [{
        canonicalKey: 'key1',
        from: 'test@example.com',
        subject: 'Re: Your order #12345 — Status: ✓ Confirmed'
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
        subject: '🎉 Welcome! 你好'
      }];
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result[0].name).toBe('🚀 Startup Inc');
      expect(result[0].subject).toBe('🎉 Welcome! 你好');
    });

    it('handles very long field values', () => {
      // Test that long strings don't cause issues
      const longString = 'Welcome'.repeat(100);
      const messages = [{
        canonicalKey: 'key1',
        displayName: longString,
        from: 'test@example.com',
        subject: longString
      }];
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result).toHaveLength(1);
      expect(result[0].name).toHaveLength(700);
      expect(result[0].subject).toHaveLength(700);
    });

    it('handles HTML entities in fields', () => {
      // Test that HTML entities are preserved (not decoded)
      const messages = [{
        canonicalKey: 'key1',
        displayName: 'Company &amp; Co',
        from: 'noreply@example.com',
        subject: 'Welcome &lt;important&gt;'
      }];
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result[0].name).toBe('Company &amp; Co');
      expect(result[0].subject).toBe('Welcome &lt;important&gt;');
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
        subject: 'Welcome to Netflix!'
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
          subject: '[GitHub] Please verify your device'
        },
        {
          canonicalKey: 'google|verify',
          displayName: 'Google',
          from: 'no-reply@accounts.google.com',
          subject: 'Verify your Google Account'
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
          subject: 'Welcome to Amazon'
        },
        {
          canonicalKey: 'amazon|account',
          displayName: 'Amazon',
          from: 'order-update@amazon.com',
          subject: 'Your order has shipped'
        },
        {
          canonicalKey: 'amazon|account',
          displayName: 'Amazon.com',
          from: 'marketing@amazon.com',
          subject: 'Daily deals for you'
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
        { canonicalKey: 'simple', displayName: 'Service A', from: 'a@example.com', subject: 'Welcome A' },
        { canonicalKey: 'with|pipes', displayName: 'Service B', from: 'b@example.com', subject: 'Welcome B' },
        { canonicalKey: 'with-dashes', displayName: 'Service C', from: 'c@example.com', subject: 'Welcome C' },
        { canonicalKey: 'with_underscores', displayName: 'Service D', from: 'd@example.com', subject: 'Welcome D' },
        { canonicalKey: 'MixedCase123', displayName: 'Service E', from: 'e@example.com', subject: 'Welcome E' }
      ];
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result).toHaveLength(5);
      expect(result.map(a => a.name)).toEqual(['Service A', 'Service B', 'Service C', 'Service D', 'Service E']);
    });
  });

  // ========================================
  // 7. lastEmailDate tracking
  // ========================================

  describe('lastEmailDate tracking', () => {
    it('sets lastEmailDate from message dateIso', () => {
      const messages = [{
        canonicalKey: 'key1',
        from: 'noreply@service.com',
        subject: 'Welcome',
        displayName: 'Service',
        dateIso: '2025-06-15T12:00:00.000Z'
      }];

      const result = extractAccountsFromMessages(messages);

      expect(result[0].lastEmailDate).toBe('2025-06-15T12:00:00.000Z');
    });

    it('sets lastEmailDate to null when dateIso is missing', () => {
      const messages = [{
        canonicalKey: 'key1',
        from: 'noreply@service.com',
        subject: 'Welcome',
        displayName: 'Service'
      }];

      const result = extractAccountsFromMessages(messages);

      expect(result[0].lastEmailDate).toBeNull();
    });

    it('keeps the most recent date when deduplicating by canonicalKey', () => {
      const messages = [
        {
          canonicalKey: 'same-key',
          from: 'noreply@service.com',
          subject: 'Welcome',
          displayName: 'Service',
          dateIso: '2024-01-01T00:00:00.000Z'
        },
        {
          canonicalKey: 'same-key',
          from: 'noreply@service.com',
          subject: 'Verify your account',
          displayName: 'Service',
          dateIso: '2025-06-15T00:00:00.000Z'
        }
      ];

      const result = extractAccountsFromMessages(messages);

      expect(result).toHaveLength(1);
      expect(result[0].lastEmailDate).toBe('2025-06-15T00:00:00.000Z');
    });

    it('keeps existing date when duplicate has no dateIso', () => {
      const messages = [
        {
          canonicalKey: 'same-key',
          from: 'noreply@service.com',
          subject: 'Welcome',
          displayName: 'Service',
          dateIso: '2025-01-01T00:00:00.000Z'
        },
        {
          canonicalKey: 'same-key',
          from: 'noreply@service.com',
          subject: 'Update',
          displayName: 'Service'
        }
      ];

      const result = extractAccountsFromMessages(messages);

      expect(result).toHaveLength(1);
      expect(result[0].lastEmailDate).toBe('2025-01-01T00:00:00.000Z');
    });

    it('updates null date when duplicate has a dateIso', () => {
      const messages = [
        {
          canonicalKey: 'same-key',
          from: 'noreply@service.com',
          subject: 'Welcome',
          displayName: 'Service'
        },
        {
          canonicalKey: 'same-key',
          from: 'noreply@service.com',
          subject: 'Confirm your account',
          displayName: 'Service',
          dateIso: '2025-03-01T00:00:00.000Z'
        }
      ];

      const result = extractAccountsFromMessages(messages);

      expect(result).toHaveLength(1);
      expect(result[0].lastEmailDate).toBe('2025-03-01T00:00:00.000Z');
    });

    it('does not replace a newer date with an older one', () => {
      const messages = [
        {
          canonicalKey: 'same-key',
          from: 'noreply@service.com',
          subject: 'Welcome',
          displayName: 'Service',
          dateIso: '2025-06-15T00:00:00.000Z'
        },
        {
          canonicalKey: 'same-key',
          from: 'noreply@service.com',
          subject: 'Old email',
          displayName: 'Service',
          dateIso: '2020-01-01T00:00:00.000Z'
        }
      ];

      const result = extractAccountsFromMessages(messages);

      expect(result).toHaveLength(1);
      expect(result[0].lastEmailDate).toBe('2025-06-15T00:00:00.000Z');
    });

    it('tracks lastEmailDate independently per canonicalKey', () => {
      const messages = [
        { canonicalKey: 'key-a', from: 'a@example.com', subject: 'Welcome', displayName: 'A', dateIso: '2024-01-01T00:00:00.000Z' },
        { canonicalKey: 'key-b', from: 'b@example.com', subject: 'Welcome', displayName: 'B', dateIso: '2025-06-01T00:00:00.000Z' },
        { canonicalKey: 'key-a', from: 'a@example.com', subject: 'Verify your account', displayName: 'A', dateIso: '2025-03-01T00:00:00.000Z' },
      ];

      const result = extractAccountsFromMessages(messages);

      expect(result).toHaveLength(2);
      expect(result[0].lastEmailDate).toBe('2025-03-01T00:00:00.000Z'); // key-a updated
      expect(result[1].lastEmailDate).toBe('2025-06-01T00:00:00.000Z'); // key-b unchanged
    });
  });

  // ========================================
  // 8. Performance and edge cases
  // ========================================
  
  describe('performance and stress tests', () => {
    it('handles large number of unique messages efficiently', () => {
      // Test that the function can handle many unique messages
      const messages = Array.from({ length: 1000 }, (_, i) => ({
        canonicalKey: `key-${i}`,
        displayName: `Service ${i}`,
        from: `service${i}@example.com`,
        subject: `Welcome ${i}`
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
        { canonicalKey: 'key1', from: 'test1@example.com', subject: 'Welcome 1' },
        {},
        { canonicalKey: 'key2', from: 'test2@example.com', subject: 'Welcome 2' }
      ];
      
      const result = extractAccountsFromMessages(messages);
      
      // key1, empty object (ignored), key2
      expect(result).toHaveLength(2);
    });

    it('handles array with mixture of valid and minimal messages', () => {
      // Test realistic scenario with varied message completeness
      const messages = [
        { 
          canonicalKey: 'complete',
          displayName: 'Complete Service',
          from: 'noreply@complete.com',
          subject: 'Welcome Subject'
        },
        {
          canonicalKey: 'minimal',
          from: 'support@minimal.com',
          subject: 'Account Info'
        },
        {
          canonicalKey: 'partial',
          displayName: 'Partial Service'
        }
      ];
      
      const result = extractAccountsFromMessages(messages);
      
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Complete Service');
      expect(result[1].from).toBe('support@minimal.com');
    });
  });
});
