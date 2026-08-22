# find my accounts

Discover old accounts and forgotten subscriptions hidden in your email, with direct links to delete each one and flag what's still costing you money. Everything is processed locally in your browser.

find my accounts is a privacy-focused tool for locating and removing forgotten online accounts, using only your own email data. No data is uploaded or sent to a server at any point.

## What it does

- Parses an mbox file and extracts individual email messages
- Normalises email addresses and service domains from headers and message content
- Matches discovered domains against the bundled JustDeleteMe dataset, showing deletion difficulty and a direct link where available
- Detects subscriptions, flagging the service name, amount, and whether it appears to still be active
- Provides a simple interface for importing an mbox file and reviewing matches (large files are parsed in a web worker to keep the UI responsive)
- Exports results as CSV

## Who it's for

Anyone who wants to see what accounts they've accumulated over the years, spot forgotten subscriptions that are still being charged, reduce their exposure after a data breach, tidy up their digital footprint, or gather the account list needed for a GDPR right-to-erasure request.

## How it works

1. Export your email as an mbox file either via Google Takeout (Gmail), Thunderbird, Apple Mail, Proton Mail, or similar
2. Upload the mbox file to the extension
3. The extension scans it locally to identify account-related emails and match them to known services with deletion links

Currently supports English-language emails only.

## Privacy

All processing happens locally in your browser — your email file is never uploaded, transmitted, or seen by a server. The extension is open source, so the code can be inspected directly rather than taken on trust.

Unlike cloud-based account cleanup services, there's no account to create and no data handed to a third party at any stage.

## Install

Available on the [Chrome Web Store](https://chromewebstore.google.com/detail/find-my-accounts-find-del/apeccjnoepacandnpapofclblfkokiif).