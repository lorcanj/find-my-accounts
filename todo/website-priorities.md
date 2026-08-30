# Website — Priorities

Distilled from an external audit (28 Aug 2026) of the public site, Chrome listing, and GitHub repo. Full audit not reproduced here — this is the actionable subset, ranked by effort vs. expected impact.

## Tier 2 — worth doing, moderate effort

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

## Loose ends from the homepage copy pass (30 Aug 2026)

Small, cheap fixes noticed while reworking `docs/index.html` — not urgent, but worth batching into a future pass.

- **`og:image` is still a placeholder** (`docs/index.html` line ~13). No image means shared links (Slack, X, Discord, iMessage, etc.) show a plain text card with no preview, which hurts click-through. Needs a real 1200×630 image — either a product screenshot or a simple designed card with the logo + tagline — saved into `docs/` and wired up via `<meta property="og:image">`.
- **No `robots.txt` or `sitemap.xml` in `docs/`** — not required for a one-page site, but cheap standard signals for crawlers if going for thoroughness.
- **No `<link rel="canonical">` tag** — harmless to omit on a single-page site, one-line addition if being strict about it.

## Explicitly skip / de-prioritize indefinitely

- Leading with GDPR — it's a use case, not the core consumer hook
- Leading with "MBOX" — implementation detail, not what users search for
- Claiming a universal/complete account database — not accurate to how detection works
- Buying backlinks or mass directory spam
