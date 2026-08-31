# Bug: AMOUNT_REGEX matches comma-as-thousands separator producing malformed amounts

## Summary

The `AMOUNT_REGEX` pattern `[.,]\d{1,2}` is intended to match decimal portions (e.g. `$9.99`) but also matches the comma in thousands-separated numbers like `$60,000`, producing a malformed capture of `$60,00`.

**Updated:** this was originally filed as low priority on the assumption that `AMOUNT_MAX` catches every affected value downstream. That assumption is wrong — see below. The truncation *defeats* `AMOUNT_MAX` whenever the amount has a decimal part, and malformed amounts reach the badge.

## Observed behaviour

Values `AMOUNT_MAX` does catch (no decimal part — truncation still leaves a large number):

| Subject | Captured | Parsed | Outcome |
|---|---|---|---|
| `Graduate Engineer - $60,000/year` | `$60,00` | 6000 | rejected (> 999.99) |
| `FSCS-protected up to £120,000` | `£120,00` | 12000 | rejected (> 999.99) |

Values `AMOUNT_MAX` does **not** catch — truncation drops the magnitude below the cap, so the malformed string is displayed in the badge:

| Subject | Captured | Parsed | Outcome |
|---|---|---|---|
| `Invoice $1,299.00` | `$1,29` | 129 | **badge shows `$1,29`** |
| `Renewal $2,400.00` | `$2,40` | 240 | **badge shows `$2,40`** |
| `Your bill: $1,000` | `$1,00` | 100 | **badge shows `$1,00`** |
| `Receipt USD 1,250.50` | `USD 1,25` | 125 | **badge shows `USD 1,25`** |
| `Invoice for €1.234,56` | `€1.23` | 1.23 | **badge shows `€1.23`** |

## Root cause

`[.,]\d{1,2}` doesn't distinguish between:
- `,` as decimal separator (EU convention, e.g. `€14,99`) — valid
- `,` as thousands separator (e.g. `$60,000`) — should not match

Because the regex stops *inside* the thousands group, `parseFloat` on the truncated capture (`subscriptionSignalExtractor.js:40`) sees a number one or more orders of magnitude too small. The `AMOUNT_MAX` check at line 41 then compares against that wrong value, so it passes exactly the large invoices it was written to reject.

## Impact

Two user-facing failures, not one:

1. **Wrong amount displayed.** A £1,299 annual invoice renders as `$1,29` in the subscription badge.
2. **`AMOUNT_MAX` guard neutralised.** Any amount ≥ 1000 written with both a thousands separator and a decimal part bypasses the cap. Since the cap exists to suppress non-subscription figures, large one-off invoices can now also promote an account to HIGH confidence via the `hasStrong && hasAmount` rung.

## Possible fix

Negative lookahead after comma to reject when followed by 3+ digits (thousands pattern):
```
[.,](?!\d{3})\d{1,2}
```
Needs care around EU decimal conventions where `€14,99` is valid (2 digits after comma) vs `$60,000` (3 digits after comma).

Note this alone still mis-parses `$1,299.00` — the lookahead rejects the `,29` branch, but the regex would then match bare `$1` and parse as 1. A complete fix needs the integer part to consume grouped thousands (e.g. `\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?` for the en-GB/en-US convention) rather than only patching the decimal branch.

## Priority

**Medium** (raised from Low) — produces visibly wrong amounts in the UI and disables the `AMOUNT_MAX` false-positive guard for four-figure invoices. See `bug-subscription-signal-aggregation.md` for the confidence-ladder issues this interacts with.
