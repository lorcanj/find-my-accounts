/**
 * Send-on-behalf email platforms.
 *
 * These are services that send email on behalf of third-party organisations
 * (event organisers, newsletter authors, merchants, etc.). Their merged
 * message bag contains emails from many different senders, so per-message
 * specifics like display name and subscription amounts cannot be attributed
 * to the platform account itself.
 *
 * Each entry:
 *   brand  — the brand stem produced by keyGenerator (matches `brand:<stem>` canonical keys)
 *   name   — canonical display name to show in the UI
 */
export const PLATFORM_BRANDS = [
  { brand: 'eventbrite',     name: 'Eventbrite' },
  { brand: 'mailchimp',      name: 'Mailchimp' },
  { brand: 'substack',       name: 'Substack' },
  { brand: 'sendgrid',       name: 'SendGrid' },
  { brand: 'mandrill',       name: 'Mandrill' },
  { brand: 'klaviyo',        name: 'Klaviyo' },
  { brand: 'constantcontact', name: 'Constant Contact' },
  { brand: 'shopifyemail',   name: 'Shopify Email' },
  { brand: 'squarespace',    name: 'Squarespace' },
  { brand: 'wix',            name: 'Wix' },
];

/** @type {Map<string, string>} brand stem → canonical name */
export const PLATFORM_BRAND_MAP = new Map(
  PLATFORM_BRANDS.map(({ brand, name }) => [`brand:${brand}`, name])
);
