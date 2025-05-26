import { SubscriptionInfo } from '../models/Account.js';
import { CONFIDENCE } from '../constants/confidence.js';
import { STATUS } from '../constants/subscriptionSignals.js';

const TRIAL_KEYWORDS = ['trial ending', 'trial expires', 'trial will end'];

/**
 * Enrich an account with subscription info derived from aggregated signals.
 * Mutates account.subscription in place; returns the account for chaining.
 */
export function enrichAccountWithSubscription(account, signalsArray) {
  if (!signalsArray || signalsArray.length === 0) return account;

  // ── 2. AGGREGATE ──
  const allStrong = [];
  const allWeak = [];
  const allNegative = [];
  const allPurchase = [];
  let anyBillingSender = false;
  const allAmounts = [];
  const allFrequencies = [];

  for (const sig of signalsArray) {
    if (sig.strongKeywords?.length)   allStrong.push(...sig.strongKeywords);
    if (sig.weakKeywords?.length)     allWeak.push(...sig.weakKeywords);
    if (sig.negativeKeywords?.length) allNegative.push(...sig.negativeKeywords);
    if (sig.purchaseKeywords?.length) allPurchase.push(...sig.purchaseKeywords);
    if (sig.isBillingSender) anyBillingSender = true;
    if (sig.amount != null)    allAmounts.push({ amount: sig.amount, dateIso: sig.dateIso });
    if (sig.frequency != null) allFrequencies.push({ frequency: sig.frequency, dateIso: sig.dateIso });
  }

  // ── 3. PURCHASE SUPPRESSION ──
  if (allPurchase.length > 0 && allStrong.length === 0) return account;

  // ── 4. CHECK we have something to work with ──
  const hasStrong = allStrong.length > 0;
  const hasWeak = allWeak.length > 0;
  const hasAmount = allAmounts.length > 0;
  if (!hasStrong && !hasWeak && !hasAmount && !anyBillingSender) return account;

  // ── 5. CONFIDENCE ──
  const countStrongOrBilling = signalsArray.filter(
    s => (s.strongKeywords?.length > 0) || s.isBillingSender
  ).length;
  const countStrong = signalsArray.filter(s => s.strongKeywords?.length > 0).length;

  let confidence = null;
  if      (hasStrong && hasAmount)        confidence = CONFIDENCE.HIGH;
  else if (hasStrong && anyBillingSender) confidence = CONFIDENCE.HIGH;
  else if (countStrongOrBilling > 1)      confidence = CONFIDENCE.HIGH;
  else if (hasStrong && countStrong >= 2) confidence = CONFIDENCE.MEDIUM;
  else if (hasAmount)                     confidence = CONFIDENCE.MEDIUM;
  else if (hasWeak && anyBillingSender)   confidence = CONFIDENCE.MEDIUM;
  else if (hasStrong)                     confidence = CONFIDENCE.LOW;
  else if (hasWeak)                       confidence = CONFIDENCE.LOW;

  if (confidence === null) return account;

  // ── 6. STATUS (latest-wins) ──
  const sorted = [...signalsArray].sort(dateAsc);
  let status = STATUS.ACTIVE;

  for (let i = sorted.length - 1; i >= 0; i--) {
    const sig = sorted[i];
    const hasStrongKw = sig.strongKeywords?.length > 0;
    const hasNegativeKw = sig.negativeKeywords?.length > 0;
    if (hasStrongKw || hasNegativeKw) {
      if (hasNegativeKw) {
        status = STATUS.CANCELLED;
      } else if (sig.strongKeywords.some(kw => TRIAL_KEYWORDS.includes(kw))) {
        status = STATUS.TRIAL;
      } else {
        status = STATUS.ACTIVE;
      }
      break;
    }
  }

  // ── 7. AMOUNT + FREQUENCY (latest-wins) ──
  const amount = allAmounts.length > 0
    ? allAmounts.sort(dateDesc)[0].amount
    : null;

  const frequency = allFrequencies.length > 0
    ? allFrequencies.sort(dateDesc)[0].frequency
    : null;

  // ── 8. ASSIGN ──
  account.subscription = new SubscriptionInfo({ confidence, amount, frequency, status });
  return account;
}

// ── Sort helpers ──
// null dateIso sorts to the beginning (oldest)
function dateAsc(a, b) {
  if (a.dateIso == null && b.dateIso == null) return 0;
  if (a.dateIso == null) return -1;
  if (b.dateIso == null) return 1;
  return a.dateIso < b.dateIso ? -1 : a.dateIso > b.dateIso ? 1 : 0;
}

function dateDesc(a, b) {
  return dateAsc(b, a);
}
