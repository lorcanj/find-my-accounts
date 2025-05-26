import { normaliseText } from './normalisers/utils.js';
import {
  STRONG_KEYWORDS, WEAK_KEYWORDS, NEGATIVE_KEYWORDS, PURCHASE_KEYWORDS,
  BILLING_SENDER_PATTERNS, FREQUENCY_KEYWORDS, AMOUNT_REGEX, AMOUNT_REJECT_AFTER, AMOUNT_MAX,
} from '../constants/subscriptionSignals.js';

// Pre-normalise keyword lists so they match against normSubject consistently
// (e.g. 'auto-renew' → 'auto renew', 'invoice #' → 'invoice')
const NORM_STRONG = STRONG_KEYWORDS.map(normaliseText);
const NORM_WEAK = WEAK_KEYWORDS.map(normaliseText);
const NORM_NEGATIVE = NEGATIVE_KEYWORDS.map(normaliseText);
const NORM_PURCHASE = PURCHASE_KEYWORDS.map(normaliseText);

function findMatches(normSubject, normKeywords, originalKeywords) {
  const matched = [];
  for (let i = 0; i < normKeywords.length; i++) {
    if (normSubject.includes(normKeywords[i])) {
      matched.push(originalKeywords[i]);
    }
  }
  return matched;
}

function checkBillingSender(email) {
  if (!email) return false;
  const localPart = email.split('@')[0];
  return BILLING_SENDER_PATTERNS.some(p => localPart.startsWith(p));
}

function extractAmount(subject) {
  if (!subject) return null;
  const match = subject.match(AMOUNT_REGEX);
  if (!match) return null;

  // Reject discount/salary contexts by checking what follows the match
  const afterMatch = subject.slice(match.index + match[0].length);
  if (AMOUNT_REJECT_AFTER.test(afterMatch)) return null;

  // Parse numeric value and reject amounts above the upper bound
  const numeric = parseFloat(match[0].replace(/[^0-9.]/g, ''));
  if (numeric > AMOUNT_MAX) return null;

  return match[0];
}

function detectFrequency(normSubject, subject) {
  const subjectLower = subject.toLowerCase();
  for (const [freq, keywords] of Object.entries(FREQUENCY_KEYWORDS)) {
    for (const kw of keywords) {
      const haystack = kw.startsWith('/') ? subjectLower : normSubject;
      if (haystack.includes(kw)) return freq;
    }
  }
  return null;
}

export function extractSubscriptionSignals(message) {
  const normSubject = message?.normSubject || '';
  const subject = message?.subject || '';
  const email = message?.email || null;
  const dateIso = message?.dateIso || null;

  const strongKeywords = findMatches(normSubject, NORM_STRONG, STRONG_KEYWORDS);
  const weakKeywords = findMatches(normSubject, NORM_WEAK, WEAK_KEYWORDS);
  const negativeKeywords = findMatches(normSubject, NORM_NEGATIVE, NEGATIVE_KEYWORDS);
  const purchaseKeywords = findMatches(normSubject, NORM_PURCHASE, PURCHASE_KEYWORDS);
  const isBillingSender = checkBillingSender(email);
  const rawAmount = extractAmount(subject);

  // An isolated amount with no subscription context is not a subscription signal
  const hasContext = strongKeywords.length > 0 || weakKeywords.length > 0 || isBillingSender;
  const amount = hasContext ? rawAmount : null;
  const frequency = detectFrequency(normSubject, subject);

  return {
    strongKeywords,
    weakKeywords,
    negativeKeywords,
    purchaseKeywords,
    isBillingSender,
    amount,
    frequency,
    dateIso,
  };
}
