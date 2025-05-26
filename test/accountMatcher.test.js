const { extractAccountsFromMessages, parseNameFromFromHeader } = require('../src/scanners/accountMatcher');

describe('extractAccountsFromMessages', () => {
  it('should extract accounts from messages with relevant keywords in subject', () => {
    const messages = [
      {
        payload: {
          headers: [
            { name: 'Subject', value: 'Welcome to Example!' },
            { name: 'From', value: 'Example <noreply@example.com>' }
          ]
        },
        snippet: 'Thanks for signing up!'
      },
      {
        payload: {
          headers: [
            { name: 'Subject', value: 'Your account has been activated' },
            { name: 'From', value: 'Service <service@example.com>' }
          ]
        },
        snippet: 'Your account is now active.'
      },
      {
        payload: {
          headers: [
            { name: 'Subject', value: 'Random newsletter' },
            { name: 'From', value: 'News <news@example.com>' }
          ]
        },
        snippet: 'This is not an account email.'
      }
    ];
    const result = extractAccountsFromMessages(messages);
    expect(result).toHaveLength(2);
    expect(result[0].from).toBe('Example <noreply@example.com>');
    expect(result[1].subject).toContain('account');
  });

  it('should not add duplicate accounts', () => {
    const messages = [
      {
        payload: {
          headers: [
            { name: 'Subject', value: 'Welcome to Example!' },
            { name: 'From', value: 'Example <noreply@example.com>' }
          ]
        },
        snippet: 'Thanks for signing up!'
      },
      {
        payload: {
          headers: [
            { name: 'Subject', value: 'Welcome to Example!' },
            { name: 'From', value: 'Example <noreply@example.com>' }
          ]
        },
        snippet: 'Duplicate email.'
      }
    ];
    const result = extractAccountsFromMessages(messages);
    expect(result).toHaveLength(1);
  });

  it('should handle missing headers gracefully', () => {
    const messages = [
      {
        payload: {
          headers: []
        },
        snippet: 'No headers here.'
      }
    ];
    const result = extractAccountsFromMessages(messages);
    expect(result).toHaveLength(0);
  });

  it('should handle missing From header', () => {
    const messages = [
      {
        payload: {
          headers: [
            { name: 'Subject', value: 'Welcome!' }
          ]
        },
        snippet: 'No from header.'
      }
    ];
    const result = extractAccountsFromMessages(messages);
    expect(result).toHaveLength(1);
    expect(result[0].from).toBe('');
  });

  it('should handle missing Subject header', () => {
    const messages = [
      {
        payload: {
          headers: [
            { name: 'From', value: 'Example <noreply@example.com>' }
          ]
        },
        snippet: 'No subject header.'
      }
    ];
    const result = extractAccountsFromMessages(messages);
    expect(result).toHaveLength(0);
  });

  it('should not match partial keyword in subject', () => {
    const messages = [
      {
        payload: {
          headers: [
            { name: 'Subject', value: 'reverification notice' },
            { name: 'From', value: 'Example <noreply@example.com>' }
          ]
        },
        snippet: 'Partial keyword.'
      }
    ];
    const result = extractAccountsFromMessages(messages);
    expect(result).toHaveLength(0);
  });
});

describe('parseNameFromFromHeader', () => {
    it('should handle From header with only email', () => {
      expect(parseNameFromFromHeader('noreply@example.com')).toBe('noreply@example.com');
    });

    it('should handle From header with name but no angle brackets', () => {
      expect(parseNameFromFromHeader('Example Name noreply@example.com')).toBe('noreply@example.com');
    });

    it('should handle From header with special characters in name', () => {
      expect(parseNameFromFromHeader('😊 Example <noreply@example.com>')).toBe('😊 Example');
    });

    it('should handle From header with quoted name containing special characters', () => {
      expect(parseNameFromFromHeader('"O\'Reilly, Inc." <info@oreilly.com>')).toBe("O'Reilly, Inc.");
    });

    it('should handle From header with display name only', () => {
      expect(parseNameFromFromHeader('Display Name Only')).toBe('Display Name Only');
    });

    it('should handle From header with comments', () => {
      expect(parseNameFromFromHeader('Example (comment) <noreply@example.com>')).toBe('Example (comment)');
    });

    it('should handle empty From header', () => {
      expect(parseNameFromFromHeader('')).toBe('');
    });

    it('should extract name from formatted From header', () => {
        expect(parseNameFromFromHeader('Example Name <user@example.com>')).toBe('Example Name');
    });

    it('should extract email if no name present', () => {
        expect(parseNameFromFromHeader('user@example.com')).toBe('user@example.com');
    });

    it('should handle quoted names', () => {
        expect(parseNameFromFromHeader('"Example Name" <user@example.com>')).toBe('Example Name');
    });

    it('should trim whitespace', () => {
        expect(parseNameFromFromHeader('   Example Name   <user@example.com>')).toBe('Example Name');
    });

    it('should return the header if nothing else matches', () => {
        expect(parseNameFromFromHeader('Some Random String')).toBe('Some Random String');
    });
});
