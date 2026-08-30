# SEO / AI-Discoverability — Priorities by ROI

Distilled from an external audit (28 Aug 2026) of the public site, Chrome listing, and GitHub repo. Full audit not reproduced here — this is the actionable subset, ranked by effort vs. expected impact.

## Tier 1 — do these (cheap, one-time, no downside)

1. **Add GitHub repo metadata** — description, topics, website link. Currently all blank ("No description, website, or topics provided"). 5 minutes, pure omission.
   - Description: `Privacy-first tool to find forgotten online accounts and subscriptions from an email MBOX archive. Everything runs locally in your browser.`
   - Topics: `account-discovery`, `forgotten-accounts`, `email-privacy`, `digital-footprint`, `privacy`, `mbox`, `chrome-extension`
   - Website: `https://lorcanj.github.io/find-my-accounts/`

2. **Homepage hero copy tweak** — swap "Find every account linked to your email address" (implies completeness/guarantee) for language centered on "forgotten accounts" (matches actual search intent, and is more technically honest about what heuristic detection can promise). Small, contained edit to `docs/index.html`.

3. **Ask for reviews at the right moment** — prompt in the popup after a successful scan completes, not on install. Currently near-zero Chrome Web Store reviews despite ~70+ users — this is a bigger trust gap than any copy issue.

## Tier 2 — worth doing, moderate effort

4. **FAQ section on the homepage** — answer the honest-limitation questions directly (does it access Gmail? does it upload anything? can it find every account? what about accounts that never emailed you?). Cheap to write, doubles as content for the "forgotten accounts" query cluster, and pairs naturally with `FAQPage` schema.

5. **Privacy callout as its own section/block** — "no account access / no upload / open source" is the strongest differentiator already in the copy; worth a dedicated visual block rather than one line in the hero.

6. **One evergreen guide page** — "How to Find Your Forgotten Online Accounts" — genuinely useful on its own (multiple methods, not just the product), with the extension introduced as one method. Highest-leverage single piece of content per the audit, but real writing effort and something you'd want to keep accurate over time.

### Implementation note: going multi-page

`docs/` is currently just `index.html` + `style.css` — no build step, no framework, served directly by GitHub Pages. Adding pages is as simple as dropping new `.html` files under `docs/` (e.g. `docs/faq.html`, `docs/guides/find-forgotten-accounts.html`); each gets its own `<title>`/meta description and links `style.css` the same way `index.html` does. No routing config needed.

The one wrinkle: there's currently no shared nav, so a header/footer would need to be hand-copied into every new file. Fine for a handful of pages (FAQ + one guide). If the page count grows toward the full Tier 3 cluster, revisit with a lightweight static-include step (e.g. a script that stitches shared `_header.html`/`_footer.html` into each page at build time) rather than hand-syncing HTML across many files.

## Tier 3 — hold off until Tier 1–2 show traffic

- Comparison pages (vs. Have I Been Pwned, vs. password managers, vs. email cleanup tools)
- Full content cluster (8–10 supporting articles)
- Product-led case study / "I tried to find every account I've ever created"
- Directory submissions, third-party outreach
- Localization

Rationale: these are ongoing content-marketing commitments for a solo side project. No point building a funnel before Tier 1 confirms anyone's finding the site. Revisit once GitHub stars/traffic/reviews show organic movement.

## Explicitly skip / de-prioritize indefinitely

- Leading with GDPR — it's a use case, not the core consumer hook
- Leading with "MBOX" — implementation detail, not what users search for
- Claiming a universal/complete account database — not accurate to how detection works
- Buying backlinks or mass directory spam
