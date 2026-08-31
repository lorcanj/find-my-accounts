# Bug: Account-level signal pooling produces false-positive subscription badges

## Summary

`enrichAccountWithSubscription` pools every message's signals into one flat bucket before
evaluating confidence. This loses the distinction between **per-account facts** (the sender
address) and **per-message facts** (keywords, amounts), so the confidence ladder counts one
fact repeatedly as if it were independent corroborating evidence, and amounts get attributed
to messages they never appeared in.

Three distinct defects fall out of this. Defect 1 is the highest-impact.

## Defect 1 — a billing-style sender is counted once per message

`isBillingSender` is derived solely from the sender local-part
(`subscriptionSignalExtractor.js:26-30`), so it is **identical on every message from a given
account**. The rung at `subscriptionMatcher.js:52`:

```js
else if (countStrongOrBilling > 1)      confidence = CONFIDENCE.HIGH;
```

therefore reads, in practice, *"this sender's local part starts with
billing/receipts/payments/invoices/subscriptions **and** they emailed twice"*. It is counting
one fact twice, not two independent pieces of evidence.

The gate at `subscriptionMatcher.js:41` lets these through because `anyBillingSender` alone
satisfies it — no keyword and no amount is ever required.

### Observed behaviour

| Messages | Result |
|---|---|
| `billing@acmeplumbing.com` × 2 — `"Your appointment is confirmed"`, `"Thanks for visiting us"` | **HIGH**, `status: active` |
| `billing@onceoff.com` × 1 — `"Your appointment is confirmed"` | no badge |

Zero subscription keywords in either case. The cliff between one message and two is the tell:
a plumber, dentist, or one-off contractor billing from `billing@` becomes a HIGH-confidence
active subscription on their second email.

### Possible approaches

1. **Make the sender a qualifier, not a countable signal.** Remove `isBillingSender` from
   `countStrongOrBilling` so the rung counts only messages carrying strong keywords. The
   sender then only boosts via the existing `hasStrong && anyBillingSender` rung at line 51.
   *Risk:* demotes genuine subscriptions whose only evidence is a billing sender — though
   arguably those should not be HIGH to begin with.
2. **Require at least one keyword or amount to pass the gate at line 41.** Drop
   `!anyBillingSender` from the early-return condition, so a bare billing sender can never
   produce a badge on its own.
   *Risk:* minimal; this is the conservative half of option 1.

## Defect 2 — the MEDIUM rung at line 53 is unreachable

```js
else if (countStrongOrBilling > 1)      confidence = CONFIDENCE.HIGH;   // line 52
else if (hasStrong && countStrong >= 2) confidence = CONFIDENCE.MEDIUM; // line 53 — dead
```

`countStrong >= 2` implies `countStrongOrBilling >= 2`, since every signal counted by
`countStrong` is also counted by `countStrongOrBilling`. Line 52 therefore always matches
first and line 53 can never execute.

### Observed behaviour

| Messages | Result | Ladder intent |
|---|---|---|
| `no-reply@vendorx.com` — `"Invoice 123"`, `"Invoice 124"` | **HIGH** | MEDIUM |

Two strong-keyword emails from a plain `no-reply@` sender come out HIGH. Whatever calibration
line 53 was written to express has never once run.

### Possible approaches

Reorder so the more specific rung is tested first, or fold it into the fix for Defect 1 —
removing `isBillingSender` from `countStrongOrBilling` makes lines 52 and 53 test genuinely
different conditions (`>1` strong vs `>=2` strong are still equivalent, so line 53 would
still need deleting or re-scoping).

## Defect 3 — amounts are attributed across unrelated messages

`allAmounts` pools amounts from every message and picks the most recent
(`subscriptionMatcher.js:82-84`). Nothing records *which* message supplied the keyword
evidence, so the displayed figure can come from an email with no subscription relevance.

### Observed behaviour

`receipts@bigshop.com`:

| Date | Subject |
|---|---|
| Sep 2024 | `"Your order has shipped - $249.99"` |
| Sep 2024 | `"Invoice for your purchase"` |
| Dec 2024 | `"Your order confirmed - $89.00"` |

Result: **HIGH**, `amount: "$89.00"` — the badge shows a figure lifted from a shipping
confirmation. Note the `hasContext` guard at `subscriptionSignalExtractor.js:71` does not
help: the `receipts@` sender makes `isBillingSender` true on the order emails, so their
amounts are captured.

This compounds with the purchase-suppression scoping already filed in
`bug-invoice-purchase-false-positive.md` — suppression at `subscriptionMatcher.js:35` is
all-or-nothing per account, so a single `invoice` email disables it for a mailbox full of
order confirmations.

### Possible approaches

1. **Narrow fix:** only accept an amount from a message that itself carries a strong keyword.
   Cheap, no structural change.
   *Risk:* loses amounts from real subscriptions that split the receipt across two emails.
2. **Structural fix:** stop flattening. Keep signals per-message and require co-occurrence
   within a single message before amount and keyword reinforce each other. Addresses
   Defects 1 and 3 and the purchase-suppression scoping in one change.
   *Risk:* larger rework of `enrichAccountWithSubscription`.

## Related: the mirror-image false negative

The ladder is currently strict on genuine consumer subscriptions and loose on `billing@`
senders — the opposite of what is wanted. Real subscriptions from non-billing senders with
only weak keywords are dropped:

| Messages | Result |
|---|---|
| `info@mailer.netflix.com` — `"Your Netflix membership"`, `"Your monthly plan"` | no badge |

This is the deliberate cost of demoting bare `"receipt"` in `3e81a81` to fix the PayPal false
positive (see `test/integration/paypalSubscriptionBug.test.js`), so it is a known tradeoff
rather than a defect. Worth revisiting alongside Defect 1: tightening the `billing@` path
creates headroom to loosen the weak-keyword path.

## Test coverage note

All 392 tests pass with every defect above present. The existing suite pins the PayPal
regression and the happy paths, but has no case for a billing-style sender with no keywords,
and none asserting MEDIUM confidence from the line 53 rung. Any fix should add both.

## Priority

**High** for Defect 1 — it fires on ordinary tradespeople and service providers, needs no
keywords, and lands at HIGH confidence. Medium for Defects 2 and 3.
