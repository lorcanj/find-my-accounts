
import { parseOneAddress } from 'email-addresses';
import { toIsoDate, normaliseEmail, normaliseText } from './utils.js';

// Maps Gmail message detail objects to a canonical, plain JS object shape
// Normaliser is pure and returns primitive fields only.
export default function normaliseGmailMessage(raw) {
	const headers = raw.payload?.headers || [];
	const getHeader = (name) => headers.find(h => h.name === name)?.value || '';

	const subject = getHeader('Subject') || '';
	const from = getHeader('From') || '';
	const date = getHeader('Date') || raw.internalDate || null;

	// normalized date as ISO (if parsable)
	const dateIso = toIsoDate(date);

	// extract email and display name
	let email = null;
	let displayName = null;

	// Use the RFC-aware `email-addresses` parser (ESM).
	const parsed = parseOneAddress(from);
	if (parsed && parsed.address) {
		email = normaliseEmail(parsed.address);
		if (parsed.name) displayName = String(parsed.name).trim() || null;
	} else {
		// parsing failed or nothing useful; keep raw From as displayName
		displayName = from.trim() || null;
	}

	// domain extraction
	let domain = null;
	if (email) {
		const parts = email.split('@');
		if (parts[1]) domain = parts[1].toLowerCase();
	}

	// labels / threads (Gmail-specific fields may be present)
	const threadId = raw.threadId || null;
	const messageId = raw.id || null;
	const labels = raw.labelIds || raw.labels || [];

	// normalized subject/displayName for matching/dedupe (use shared helpers)
	const normSubject = normaliseText(subject);
	const normDisplayName = displayName ? normaliseText(displayName) : null;

	const normalised = {
		provider: 'gmail',
		messageId,
		threadId,
		subject: subject || '',
		normSubject,
		from: from || '',
		email: email || null,
		displayName: displayName || null,
		normDisplayName,
		_normalised: true,
		snippet: raw.snippet || '',
		date: date || null,
		dateIso,
		domain: domain || null,
		labels: Array.isArray(labels) ? labels.map(l => String(l).toLowerCase()) : [],
		metadata: { headers, rawSummary: { labelIds: raw.labelIds } },
		raw
	};

	return normalised;
}

