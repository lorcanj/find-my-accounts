import { CONFIDENCE } from './confidence.js';

export const STRONG_KEYWORDS = Object.freeze([
  'renewal', 'renewed', 'auto-renew',
  'recurring charge', 'recurring payment',
  'subscription confirmed', 'subscription active',
  'billing cycle', 'billing period',
  'payment processed', 'payment received', 'payment successful',
  'invoice #', 'receipt for your',
  'trial ending', 'trial expires', 'trial will end',
  'plan upgrade', 'plan change',
]);

export const WEAK_KEYWORDS = Object.freeze([
  'monthly', 'annual', 'yearly',
  'premium', 'pro plan', 'plus plan',
  'membership',
]);

export const NEGATIVE_KEYWORDS = Object.freeze([
  'cancelled', 'canceled', 'cancellation confirmed',
  'subscription ended', 'subscription expired',
  'refund processed', 'refund issued',
  'trial expired', 'free tier',
  'downgraded to free',
]);

export const PURCHASE_KEYWORDS = Object.freeze([
  'order confirmed', 'order shipped', 'order delivered',
  'shipping confirmation', 'delivery confirmation',
  'your order', 'dispatch',
]);

export const BILLING_SENDER_PATTERNS = Object.freeze([
  'billing', 'receipts', 'payments', 'invoices', 'subscriptions',
]);

export const FREQUENCY_KEYWORDS = Object.freeze({
  monthly:   ['monthly', '/mo', '/month'],
  annual:    ['annual', 'yearly', '/yr', '/year'],
  weekly:    ['weekly', '/week'],
  quarterly: ['quarterly', '/quarter'],
});

// Matches currency amounts in subject lines, e.g. $9.99, €14.99/month, A$49.00/year, USD 9.99
export const AMOUNT_REGEX = /(?:(?:A|CA|NZ|HK|SG)?\$|€|£|¥|USD|EUR|GBP|CAD|AUD)\s?\d+(?:[.,]\d{1,2})?(?:\s?\/\s?(?:mo(?:nth)?|yr|year|week|quarter))?/i;

export const SUB_CONFIDENCE = CONFIDENCE;

export const STATUS = Object.freeze({
  ACTIVE:    'active',
  CANCELLED: 'cancelled',
  TRIAL:     'trial',
});

export const FREQUENCY = Object.freeze({
  MONTHLY:   'monthly',
  ANNUAL:    'annual',
  WEEKLY:    'weekly',
  QUARTERLY: 'quarterly',
});
