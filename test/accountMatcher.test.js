import { describe, it, expect } from 'vitest';
import { extractAccountsFromMessages } from '../src/scanners/accountMatcher.js';

describe('extractAccountsFromMessages', () => {
  describe('deduplication', () => {
    it('returns two accounts for distinct canonicalKey', () => {
      const messages = [
        { canonicalKey: 'a1', email: 'no-reply@example.com', from: 'User One <no-reply@example.com>', subject: 'Welcome', snippet: 'hey', displayName: 'User One' },
        { canonicalKey: 'b2', email: 'noreply@test.com', from: 'User Two <noreply@test.com>', subject: 'Account created', snippet: 'hello', displayName: 'User Two' }
      ];
      const res = extractAccountsFromMessages(messages);
      expect(res).toHaveLength(2);
    });

    it('deduplicates messages with same canonicalKey', () => {
      const messages = [
        { canonicalKey: 'same', email: 'no-reply@example.com', from: 'User <no-reply@example.com>', subject: 'Welcome', snippet: '', displayName: 'User' },
        { canonicalKey: 'same', email: 'no-reply@example.com', from: 'User <no-reply@example.com>', subject: 'Welcome', snippet: 'again', displayName: 'User' }
      ];
      const res = extractAccountsFromMessages(messages);
      expect(res).toHaveLength(1);
    });
  });

  describe('email local part filtering (SENDER_REGEX)', () => {
    it('matches no-reply variations', () => {
      const messages = [
        { canonicalKey: 'k1', email: 'no-reply@example.com', from: 'Service <no-reply@example.com>', subject: 'Hello', displayName: 'Service' },
        { canonicalKey: 'k2', email: 'noreply@example.com', from: 'Service <noreply@example.com>', subject: 'Hello', displayName: 'Service' },
        { canonicalKey: 'k3', email: 'no_reply@example.com', from: 'Service <no_reply@example.com>', subject: 'Hello', displayName: 'Service' },
        { canonicalKey: 'k4', email: 'noreply123@example.com', from: 'Service <noreply123@example.com>', subject: 'Hello', displayName: 'Service' }
      ];
      const res = extractAccountsFromMessages(messages);
      expect(res).toHaveLength(4);
    });

    it('matches do-not-reply variations', () => {
      const messages = [
        { canonicalKey: 'k1', email: 'do-not-reply@example.com', from: 'Service <do-not-reply@example.com>', subject: 'Hi', displayName: 'Service' },
        { canonicalKey: 'k2', email: 'donotreply@example.com', from: 'Service <donotreply@example.com>', subject: 'Hi', displayName: 'Service' }
      ];
      const res = extractAccountsFromMessages(messages);
      expect(res).toHaveLength(2);
    });

    it('matches support variations', () => {
      const messages = [
        { canonicalKey: 'k1', email: 'support@example.com', from: 'Support <support@example.com>', subject: 'Hi', displayName: 'Support' },
        { canonicalKey: 'k2', email: 'support-team@example.com', from: 'Support <support-team@example.com>', subject: 'Hi', displayName: 'Support' },
        { canonicalKey: 'k3', email: 'tech.support@example.com', from: 'Support <tech.support@example.com>', subject: 'Hi', displayName: 'Support' }
      ];
      const res = extractAccountsFromMessages(messages);
      expect(res).toHaveLength(3);
    });

    it('matches billing variations', () => {
      const messages = [
        { canonicalKey: 'k1', email: 'billing@example.com', from: 'Billing <billing@example.com>', subject: 'Hi', displayName: 'Billing' },
        { canonicalKey: 'k2', email: 'billing.dept@example.com', from: 'Billing <billing.dept@example.com>', subject: 'Hi', displayName: 'Billing' }
      ];
      const res = extractAccountsFromMessages(messages);
      expect(res).toHaveLength(2);
    });

    it('matches accounts/account variations', () => {
      const messages = [
        { canonicalKey: 'k1', email: 'accounts@example.com', from: 'Accounts <accounts@example.com>', subject: 'Hi', displayName: 'Accounts' },
        { canonicalKey: 'k2', email: 'account@example.com', from: 'Account <account@example.com>', subject: 'Hi', displayName: 'Account' }
      ];
      const res = extractAccountsFromMessages(messages);
      expect(res).toHaveLength(2);
    });

    it('matches invoices/invoice variations', () => {
      const messages = [
        { canonicalKey: 'k1', email: 'invoices@example.com', from: 'Invoices <invoices@example.com>', subject: 'Hi', displayName: 'Invoices' },
        { canonicalKey: 'k2', email: 'invoice@example.com', from: 'Invoice <invoice@example.com>', subject: 'Hi', displayName: 'Invoice' }
      ];
      const res = extractAccountsFromMessages(messages);
      expect(res).toHaveLength(2);
    });

    it('matches sales, notifications, updates, alerts', () => {
      const messages = [
        { canonicalKey: 'k1', email: 'sales@example.com', from: 'Sales <sales@example.com>', subject: 'Hi', displayName: 'Sales' },
        { canonicalKey: 'k2', email: 'notifications@example.com', from: 'Notif <notifications@example.com>', subject: 'Hi', displayName: 'Notif' },
        { canonicalKey: 'k3', email: 'updates@example.com', from: 'Updates <updates@example.com>', subject: 'Hi', displayName: 'Updates' },
        { canonicalKey: 'k4', email: 'alerts@example.com', from: 'Alerts <alerts@example.com>', subject: 'Hi', displayName: 'Alerts' }
      ];
      const res = extractAccountsFromMessages(messages);
      expect(res).toHaveLength(4);
    });

    it('matches team, hello, info, help', () => {
      const messages = [
        { canonicalKey: 'k1', email: 'team@example.com', from: 'Team <team@example.com>', subject: 'Hi', displayName: 'Team' },
        { canonicalKey: 'k2', email: 'hello@example.com', from: 'Hello <hello@example.com>', subject: 'Hi', displayName: 'Hello' },
        { canonicalKey: 'k3', email: 'info@example.com', from: 'Info <info@example.com>', subject: 'Hi', displayName: 'Info' },
        { canonicalKey: 'k4', email: 'help@example.com', from: 'Help <help@example.com>', subject: 'Hi', displayName: 'Help' }
      ];
      const res = extractAccountsFromMessages(messages);
      expect(res).toHaveLength(4);
    });

    it('matches security, privacy, auth, admin', () => {
      const messages = [
        { canonicalKey: 'k1', email: 'security@example.com', from: 'Security <security@example.com>', subject: 'Hi', displayName: 'Security' },
        { canonicalKey: 'k2', email: 'privacy@example.com', from: 'Privacy <privacy@example.com>', subject: 'Hi', displayName: 'Privacy' },
        { canonicalKey: 'k3', email: 'auth@example.com', from: 'Auth <auth@example.com>', subject: 'Hi', displayName: 'Auth' },
        { canonicalKey: 'k4', email: 'admin@example.com', from: 'Admin <admin@example.com>', subject: 'Hi', displayName: 'Admin' }
      ];
      const res = extractAccountsFromMessages(messages);
      expect(res).toHaveLength(4);
    });

    it('matches keywords at beginning of email local part', () => {
      const messages = [
        { canonicalKey: 'k1', email: 'support-xyz@example.com', from: 'Svc <support-xyz@example.com>', subject: 'Hi', displayName: 'Svc' },
        { canonicalKey: 'k2', email: 'noreply.team@example.com', from: 'Svc <noreply.team@example.com>', subject: 'Hi', displayName: 'Svc' }
      ];
      const res = extractAccountsFromMessages(messages);
      expect(res).toHaveLength(2);
    });

    it('matches keywords at end of email local part', () => {
      const messages = [
        { canonicalKey: 'k1', email: 'xyz-support@example.com', from: 'Svc <xyz-support@example.com>', subject: 'Hi', displayName: 'Svc' },
        { canonicalKey: 'k2', email: 'team.noreply@example.com', from: 'Svc <team.noreply@example.com>', subject: 'Hi', displayName: 'Svc' }
      ];
      const res = extractAccountsFromMessages(messages);
      expect(res).toHaveLength(2);
    });

    it('matches keywords in middle of email local part with separators', () => {
      const messages = [
        { canonicalKey: 'k1', email: 'team.support.dept@example.com', from: 'Svc <team.support.dept@example.com>', subject: 'Hi', displayName: 'Svc' },
        { canonicalKey: 'k2', email: 'company-noreply-system@example.com', from: 'Svc <company-noreply-system@example.com>', subject: 'Hi', displayName: 'Svc' }
      ];
      const res = extractAccountsFromMessages(messages);
      expect(res).toHaveLength(2);
    });

    it('filters out emails without matching keywords', () => {
      const messages = [
        { canonicalKey: 'k1', email: 'john.doe@example.com', from: 'John Doe <john.doe@example.com>', subject: 'Hello', displayName: 'John Doe' },
        { canonicalKey: 'k2', email: 'jane@example.com', from: 'Jane <jane@example.com>', subject: 'Hi there', displayName: 'Jane' },
        { canonicalKey: 'k3', email: 'random.user@example.com', from: 'Random <random.user@example.com>', subject: 'Testing', displayName: 'Random' }
      ];
      const res = extractAccountsFromMessages(messages);
      expect(res).toHaveLength(0);
    });
  });

  describe('display name filtering (SENDER_REGEX)', () => {
    it('matches display names with account-related keywords', () => {
      const messages = [
        { canonicalKey: 'k1', email: 'contact@example.com', from: 'Support Team <contact@example.com>', subject: 'Hi', displayName: 'Support Team' },
        { canonicalKey: 'k2', email: 'mail@example.com', from: 'No Reply <mail@example.com>', subject: 'Hi', displayName: 'No Reply' },
        { canonicalKey: 'k3', email: 'msg@example.com', from: 'Billing Dept <msg@example.com>', subject: 'Hi', displayName: 'Billing Dept' }
      ];
      const res = extractAccountsFromMessages(messages);
      expect(res).toHaveLength(3);
    });

    it('matches display names with keywords in different positions', () => {
      const messages = [
        { canonicalKey: 'k1', email: 'contact@example.com', from: 'Team Support <contact@example.com>', subject: 'Hi', displayName: 'Team Support' },
        { canonicalKey: 'k2', email: 'mail@example.com', from: 'Help Center <mail@example.com>', subject: 'Hi', displayName: 'Help Center' }
      ];
      const res = extractAccountsFromMessages(messages);
      expect(res).toHaveLength(2);
    });

    it('is case-insensitive for display names', () => {
      const messages = [
        { canonicalKey: 'k1', email: 'contact@example.com', from: 'SUPPORT <contact@example.com>', subject: 'Hi', displayName: 'SUPPORT' },
        { canonicalKey: 'k2', email: 'mail@example.com', from: 'noreply <mail@example.com>', subject: 'Hi', displayName: 'noreply' }
      ];
      const res = extractAccountsFromMessages(messages);
      expect(res).toHaveLength(2);
    });
  });

  describe('subject line filtering (SUBJECT_REGEX)', () => {
    it('matches welcome messages', () => {
      const messages = [
        { canonicalKey: 'k1', email: 'sender@example.com', from: 'Company <sender@example.com>', subject: 'Welcome to our service', displayName: 'Company' },
        { canonicalKey: 'k2', email: 'mail@test.com', from: 'Service <mail@test.com>', subject: 'Welcome!', displayName: 'Service' }
      ];
      const res = extractAccountsFromMessages(messages);
      expect(res).toHaveLength(2);
    });

    it('matches verification messages', () => {
      const messages = [
        { canonicalKey: 'k1', email: 'sender@example.com', from: 'Company <sender@example.com>', subject: 'Verify your email', displayName: 'Company' },
        { canonicalKey: 'k2', email: 'mail@test.com', from: 'Service <mail@test.com>', subject: 'Email verification required', displayName: 'Service' }
      ];
      const res = extractAccountsFromMessages(messages);
      expect(res).toHaveLength(2);
    });

    it('matches confirmation messages', () => {
      const messages = [
        { canonicalKey: 'k1', email: 'sender@example.com', from: 'Company <sender@example.com>', subject: 'Please confirm your email', displayName: 'Company' },
        { canonicalKey: 'k2', email: 'mail@test.com', from: 'Service <mail@test.com>', subject: 'Confirm your registration', displayName: 'Service' }
      ];
      const res = extractAccountsFromMessages(messages);
      expect(res).toHaveLength(2);
    });

    it('matches activation messages', () => {
      const messages = [
        { canonicalKey: 'k1', email: 'sender@example.com', from: 'Company <sender@example.com>', subject: 'Activate your account', displayName: 'Company' },
        { canonicalKey: 'k2', email: 'mail@test.com', from: 'Service <mail@test.com>', subject: 'Account activation needed', displayName: 'Service' }
      ];
      const res = extractAccountsFromMessages(messages);
      expect(res).toHaveLength(2);
    });

    it('matches subscription messages', () => {
      const messages = [
        { canonicalKey: 'k1', email: 'sender@example.com', from: 'Company <sender@example.com>', subject: 'Your subscription is active', displayName: 'Company' }
      ];
      const res = extractAccountsFromMessages(messages);
      expect(res).toHaveLength(1);
    });

    it('matches invoice and receipt messages', () => {
      const messages = [
        { canonicalKey: 'k1', email: 'sender@example.com', from: 'Company <sender@example.com>', subject: 'Invoice #12345', displayName: 'Company' },
        { canonicalKey: 'k2', email: 'mail@test.com', from: 'Service <mail@test.com>', subject: 'Your receipt for purchase', displayName: 'Service' }
      ];
      const res = extractAccountsFromMessages(messages);
      expect(res).toHaveLength(2);
    });

    it('matches order and billing messages', () => {
      const messages = [
        { canonicalKey: 'k1', email: 'sender@example.com', from: 'Company <sender@example.com>', subject: 'Order confirmation', displayName: 'Company' },
        { canonicalKey: 'k2', email: 'mail@test.com', from: 'Service <mail@test.com>', subject: 'Billing update', displayName: 'Service' }
      ];
      const res = extractAccountsFromMessages(messages);
      expect(res).toHaveLength(2);
    });

    it('matches payment messages', () => {
      const messages = [
        { canonicalKey: 'k1', email: 'sender@example.com', from: 'Company <sender@example.com>', subject: 'Payment received', displayName: 'Company' },
        { canonicalKey: 'k2', email: 'mail@test.com', from: 'Service <mail@test.com>', subject: 'Payment confirmation', displayName: 'Service' }
      ];
      const res = extractAccountsFromMessages(messages);
      expect(res).toHaveLength(2);
    });

    it('matches security alert messages', () => {
      const messages = [
        { canonicalKey: 'k1', email: 'sender@example.com', from: 'Company <sender@example.com>', subject: 'Security alert for your account', displayName: 'Company' }
      ];
      const res = extractAccountsFromMessages(messages);
      expect(res).toHaveLength(1);
    });

    it('matches password and login messages', () => {
      const messages = [
        { canonicalKey: 'k1', email: 'sender@example.com', from: 'Company <sender@example.com>', subject: 'Reset your password', displayName: 'Company' },
        { canonicalKey: 'k2', email: 'mail@test.com', from: 'Service <mail@test.com>', subject: 'New login detected', displayName: 'Service' }
      ];
      const res = extractAccountsFromMessages(messages);
      expect(res).toHaveLength(2);
    });

    it('matches sign-in/signin variations', () => {
      const messages = [
        { canonicalKey: 'k1', email: 'sender@example.com', from: 'Company <sender@example.com>', subject: 'Sign in to your account', displayName: 'Company' },
        { canonicalKey: 'k2', email: 'mail@test.com', from: 'Service <mail@test.com>', subject: 'Sign-in attempt', displayName: 'Service' }
      ];
      const res = extractAccountsFromMessages(messages);
      expect(res).toHaveLength(2);
    });

    it('matches account-related messages', () => {
      const messages = [
        { canonicalKey: 'k1', email: 'sender@example.com', from: 'Company <sender@example.com>', subject: 'Your account has been created', displayName: 'Company' }
      ];
      const res = extractAccountsFromMessages(messages);
      expect(res).toHaveLength(1);
    });

    it('matches registration messages', () => {
      const messages = [
        { canonicalKey: 'k1', email: 'sender@example.com', from: 'Company <sender@example.com>', subject: 'Complete your registration', displayName: 'Company' },
        { canonicalKey: 'k2', email: 'mail@test.com', from: 'Service <mail@test.com>', subject: 'Registration successful', displayName: 'Service' }
      ];
      const res = extractAccountsFromMessages(messages);
      expect(res).toHaveLength(2);
    });

    it('is case-insensitive for subject lines', () => {
      const messages = [
        { canonicalKey: 'k1', email: 'sender@example.com', from: 'Company <sender@example.com>', subject: 'WELCOME', displayName: 'Company' },
        { canonicalKey: 'k2', email: 'mail@test.com', from: 'Service <mail@test.com>', subject: 'verify your account', displayName: 'Service' }
      ];
      const res = extractAccountsFromMessages(messages);
      expect(res).toHaveLength(2);
    });

    it('filters out subjects without matching keywords', () => {
      const messages = [
        { canonicalKey: 'k1', email: 'john@example.com', from: 'John <john@example.com>', subject: 'Meeting tomorrow', displayName: 'John' },
        { canonicalKey: 'k2', email: 'jane@example.com', from: 'Jane <jane@example.com>', subject: 'Project update', displayName: 'Jane' }
      ];
      const res = extractAccountsFromMessages(messages);
      expect(res).toHaveLength(0);
    });
  });

  describe('combined filtering logic', () => {
    it('accepts message if any criterion matches', () => {
      const messages = [
        // Matches only email
        { canonicalKey: 'k1', email: 'noreply@example.com', from: 'Person <noreply@example.com>', subject: 'Random topic', displayName: 'Person' },
        // Matches only display name
        { canonicalKey: 'k2', email: 'contact@example.com', from: 'Support <contact@example.com>', subject: 'Random topic', displayName: 'Support' },
        // Matches only subject
        { canonicalKey: 'k3', email: 'person@example.com', from: 'Person <person@example.com>', subject: 'Welcome aboard', displayName: 'Person' }
      ];
      const res = extractAccountsFromMessages(messages);
      expect(res).toHaveLength(3);
    });

    it('accepts message if multiple criteria match', () => {
      const messages = [
        { canonicalKey: 'k1', email: 'noreply@example.com', from: 'Support <noreply@example.com>', subject: 'Welcome', displayName: 'Support' }
      ];
      const res = extractAccountsFromMessages(messages);
      expect(res).toHaveLength(1);
    });

    it('rejects message if no criteria match', () => {
      const messages = [
        { canonicalKey: 'k1', email: 'john.smith@example.com', from: 'John Smith <john.smith@example.com>', subject: 'Weekend plans', displayName: 'John Smith' }
      ];
      const res = extractAccountsFromMessages(messages);
      expect(res).toHaveLength(0);
    });

    it('handles mixed messages correctly', () => {
      const messages = [
        { canonicalKey: 'k1', email: 'noreply@service.com', from: 'Service <noreply@service.com>', subject: 'Welcome', displayName: 'Service' },
        { canonicalKey: 'k2', email: 'john@example.com', from: 'John <john@example.com>', subject: 'Lunch plans', displayName: 'John' },
        { canonicalKey: 'k3', email: 'support@company.com', from: 'Company <support@company.com>', subject: 'Your invoice', displayName: 'Company' },
        { canonicalKey: 'k4', email: 'jane@example.com', from: 'Jane <jane@example.com>', subject: 'Random stuff', displayName: 'Jane' }
      ];
      const res = extractAccountsFromMessages(messages);
      expect(res).toHaveLength(2);
      expect(res[0].from).toBe('Service <noreply@service.com>');
      expect(res[1].from).toBe('Company <support@company.com>');
    });
  });

  describe('edge cases', () => {
    it('handles empty array', () => {
      const res = extractAccountsFromMessages([]);
      expect(res).toHaveLength(0);
    });

    it('handles undefined input', () => {
      const res = extractAccountsFromMessages(undefined);
      expect(res).toHaveLength(0);
    });

    it('handles single message (not array)', () => {
      const message = { canonicalKey: 'k1', email: 'noreply@example.com', from: 'Service <noreply@example.com>', subject: 'Welcome', displayName: 'Service' };
      const res = extractAccountsFromMessages(message);
      expect(res).toHaveLength(1);
    });

    it('handles messages with missing fields gracefully', () => {
      const messages = [
        { canonicalKey: 'k1', email: 'noreply@example.com' },
        { canonicalKey: 'k2', from: 'Support <support@example.com>', displayName: 'Support' },
        { canonicalKey: 'k3', subject: 'Welcome' }
      ];
      const res = extractAccountsFromMessages(messages);
      expect(res.length).toBeGreaterThan(0);
    });

    it('handles empty strings in message fields', () => {
      const messages = [
        { canonicalKey: 'k1', email: '', from: '', subject: 'Welcome', displayName: '' }
      ];
      const res = extractAccountsFromMessages(messages);
      expect(res).toHaveLength(1);
    });

    it('extracts email local part correctly', () => {
      const messages = [
        { canonicalKey: 'k1', email: 'support@example.com', from: 'Person <support@example.com>', subject: 'Hi', displayName: 'Person' }
      ];
      const res = extractAccountsFromMessages(messages);
      expect(res).toHaveLength(1);
    });

    it('handles email without @ symbol', () => {
      const messages = [
        { canonicalKey: 'k1', email: 'invalidemail', from: 'Person <invalidemail>', subject: 'Random', displayName: 'Person' }
      ];
      const res = extractAccountsFromMessages(messages);
      expect(res).toHaveLength(0);
    });
  });

  describe('Account object creation', () => {
    it('creates Account objects with correct properties', () => {
      const messages = [
        { 
          canonicalKey: 'k1', 
          email: 'noreply@example.com', 
          from: 'Service <noreply@example.com>', 
          subject: 'Welcome to our service', 
          displayName: 'Service',
          snippet: 'Thank you for signing up'
        }
      ];
      const res = extractAccountsFromMessages(messages);
      expect(res).toHaveLength(1);
      expect(res[0]).toHaveProperty('name', 'Service');
      expect(res[0]).toHaveProperty('subject', 'Welcome to our service');
      expect(res[0]).toHaveProperty('from', 'Service <noreply@example.com>');
      expect(res[0]).toHaveProperty('snippet', 'Thank you for signing up');
    });

    it('handles missing displayName gracefully', () => {
      const messages = [
        { 
          canonicalKey: 'k1', 
          email: 'noreply@example.com', 
          from: 'noreply@example.com', 
          subject: 'Welcome'
        }
      ];
      const res = extractAccountsFromMessages(messages);
      expect(res).toHaveLength(1);
      expect(res[0]).toHaveProperty('name', '');
    });
  });
});
