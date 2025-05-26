# Bug: AMOUNT_REGEX matches comma-as-thousands separator producing malformed amounts

## Summary

The `AMOUNT_REGEX` pattern `[.,]\d{1,2}` is intended to match decimal portions (e.g. `$9.99`) but also matches the comma in thousands-separated numbers like `$60,000`, producing a malformed capture of `$60,00`.

## Observed behaviour

| Subject | Captured | Actual meaning |
|---|---|---|
| `Graduate Engineer - $60,000/year` | `$60,00` | Salary |
| `FSCS-protected up to £120,000` | `£120,00` | Insurance limit |

The `AMOUNT_MAX` (999.99) guard catches these downstream so they don't produce false-positive badges, but the regex match itself is wrong.

## Root cause

`[.,]\d{1,2}` doesn't distinguish between:
- `,` as decimal separator (EU convention, e.g. `€14,99`) — valid
- `,` as thousands separator (e.g. `$60,000`) — should not match

## Why it's low priority

`AMOUNT_MAX` already filters out these large values, so no user-facing impact currently. This is a correctness issue in the regex, not a functional bug.

## Possible fix

Negative lookahead after comma to reject when followed by 3+ digits (thousands pattern):
```
[.,](?!\d{3})\d{1,2}
```
Needs care around EU decimal conventions where `€14,99` is valid (2 digits after comma) vs `$60,000` (3 digits after comma).

## Priority

Low — no user-facing impact due to `AMOUNT_MAX` guard.
