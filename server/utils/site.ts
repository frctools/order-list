// Where this deployment lives, in one place.
//
// Invite links, notification emails and the links inside them all point here,
// so moving the app to a different domain is one edit rather than a hunt
// through the email templates.
//
// Note the Cloudflare route in nuxt.config.ts is separate infrastructure and
// is not derived from this — both have to name the same host for invite links
// to actually resolve.

export const SITE_NAME = 'Innovators Parts'
export const SITE_TAGLINE = 'Powered by FRCTools'
export const SITE_URL = 'https://parts.innovatorsrobotics.com'

// The bare host, for anywhere a URL would be the wrong shape (vendor
// integrations that ask a tool to identify itself, for instance).
export const SITE_HOST = new URL(SITE_URL).host

// Sending from these needs the domain verified in Resend.
//
// The display name is not decoration: a bare address is one of the cheaper
// signals a filter reads as machine-generated, and these are the first mails a
// brand-new sending domain will ever send, when it has no reputation to lean
// on. Resend accepts the "Name <address>" form directly.
export const EMAIL_FROM_INVITES = `${SITE_NAME} <hello@${SITE_HOST}>`
export const EMAIL_FROM_NOTIFICATIONS
  = `${SITE_NAME} <notifications@${SITE_HOST}>`

// The app itself, for links out of an email.
export const APP_URL = `${SITE_URL}/app`
export const SETTINGS_URL = `${SITE_URL}/settings`
