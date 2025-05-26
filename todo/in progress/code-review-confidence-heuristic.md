# Confidence Heuristic Analysis — `isAccountRelated()`

**File:** `src/scanners/accountMatcher.js`

---

## How It Works

The function `isAccountRelated()` scores each email message using three regex signals:

| Signal | Regex targets |
|---|---|
| **Strong sender** | `noreply`, `donotreply`, `support`, `billing`, `accounts`, `invoices`, `security`, `privacy`, `auth` |
| **Weak sender** | `team`, `hello`, `info`, `help`, `admin`, `sales`, `notifications`, `updates`, `alerts` |
| **Subject keyword** | `welcome`, `verify`, `confirm`, `activate`, `subscription`, `invoice`, `receipt`, `order`, `billing`, `payment`, `security alert`, `password`, `login`, `sign-in`, `account`, `regist` |

Combined into confidence tiers:

| Signals matched | Confidence |
|---|---|
| Strong sender | HIGH |
| Weak sender + subject keyword | HIGH |
| Subject keyword only | MEDIUM |
| Weak sender only | LOW |
| Nothing | rejected |

---

## False Positive Risks

### 1. `SUBJECT_REGEX` lacks a trailing word boundary

The regex uses `\b` at the start of matches but not the end. As a result:

- `"account"` matches **account**ant, **account**ing, **account**ability
- `"order"` matches b**order**, dis**order** (unlikely in email subjects, but imprecise)
- `"regist"` matches registration, register — intentional for prefix matching, but undocumented

**Fix:** Close captures with `\b)` to prevent partial-word matches where unintended.

### 2. Some weak senders are too generic

- **`sales@`** — cold outreach is extremely common from addresses where you have no account. One of the weakest possible account signals.
- **`hello@`** — widely used for marketing and outreach, not account relationships.
- **`info@`** — generic company-wide contact address, often newsletters.

These inflate LOW-confidence results with noise. `sales` in particular may warrant removal.

### 3. Subject-only → MEDIUM may be too generous

A subject containing `"welcome"` or `"confirm"` from a sender with no matching keyword gets MEDIUM confidence. Newsletters and spam use these words frequently. Without *any* sender signal, MEDIUM overstates certainty — LOW would be more appropriate.

---

## False Negatives (Missed Real Accounts)

### 4. Missing strong sender keywords

Several common transactional sender patterns are not covered and would be missed entirely or fall through to a weaker tier:

| Missing keyword | Common example |
|---|---|
| `service` / `services` | `service@paypal.com` |
| `orders` | `orders@amazon.com` |
| `membership` | `membership@costco.com` |
| `customer` | `customer@company.com` |
| `subscriptions` | `subscriptions@spotify.com` |
| `confirm` / `verification` | `confirmation@booking.com` |
| `rewards` / `loyalty` | `rewards@starbucks.com` |
| `mailer` / `mail` | `mailer@company.com` |

An email from `orders@amazon.com` with subject "Your order has shipped" currently matches only on the subject keyword ("order") → MEDIUM. The sender alone should produce HIGH.

### 5. Missing subject keywords

Several strong account-signal subject patterns aren't covered:

- **Auth flows:** `two-factor`, `2FA`, `OTP`, `verification code`, `one-time` — very strong account signals, entirely missed
- **Subscription lifecycle:** `membership`, `renewal`, `trial`, `upgrade`
- **Account management:** `reset`, `profile`
- **E-commerce activity:** `shipping`, `delivery`, `tracking`
- **Implicit account signal:** `unsubscribe` — implies an existing subscription relationship

A subject like "Your verification code is 123456" is rejected entirely if the sender doesn't match either regex.

---

## Structural Observations

### 6. No negative signals

The heuristic only looks for positive matches. Bulk mail headers (`Precedence: bulk`, `List-Unsubscribe`) are common on mailing lists that aren't account relationships. These aren't currently forwarded from the mbox parser, but if they were, they could be used to downgrade confidence — a `noreply@` sender with bulk mail headers is more likely a newsletter than a transactional account email.

### 7. Message volume isn't factored in

The dedup logic keeps the *highest* single-message confidence but never boosts confidence based on repeated evidence. Seeing 50 emails from the same canonical key is a much stronger account signal than seeing one. A LOW sender appearing 20 times probably deserves at least MEDIUM.

### 8. The tier system is coarse

The flat if/else chain only expresses one signal combination (weak sender + subject → HIGH). Additional combinations aren't possible without adding more special cases. A point-based scoring model would be more composable:

```
strong sender: +3    weak sender: +1    strong subject: +2    weak subject: +1

Score ≥ 3 → HIGH
Score = 2 → MEDIUM
Score = 1 → LOW
Score = 0 → reject
```

This would naturally handle new combinations (e.g., two weak signals combining) and make it straightforward to add new signal types — message count, header-based signals, domain reputation — without restructuring the logic.

---

## Recommendations (ordered by impact)

| Priority | Change |
|---|---|
| 1 | Add missing strong sender keywords: `service`, `orders`, `membership`, `customer`, `subscriptions`, `confirm`, `rewards`, `mailer` |
| 2 | Add missing subject keywords: `2FA`/`OTP`/`verification code`, `shipping`/`delivery`/`tracking`, `membership`/`renewal`/`trial`, `reset`, `unsubscribe` |
| 3 | Add trailing `\b` to `SUBJECT_REGEX` captures to prevent partial-word matches on `account`, `order`, etc. |
| 4 | Demote subject-only from MEDIUM → LOW to reduce newsletter/spam false positives |
| 5 | Reconsider `sales`, `hello`, and `info` as weak sender signals — high false positive rate |
| 6 | *(Longer term)* Move to a point-based scoring model for composability and extensibility |
| 7 | *(Longer term)* Factor in message count per canonical key to boost confidence from repeated evidence |
