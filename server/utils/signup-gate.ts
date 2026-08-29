import { and, eq, gt, sql } from 'drizzle-orm'
import { useDB } from './db'
import { invitation, user } from './auth-schema'

// This instance is closed: an account can only be created by someone holding a
// pending invitation from an organization admin. The one exception is the very
// first account, which has nobody to invite it — see isBootstrapSignUp below.
//
// The gate lives in a database hook rather than on the signup route because
// Better Auth owns /api/auth/**; anything bolted onto the page or the client
// would be trivially bypassed by posting to the endpoint directly.

export const SIGNUP_CLOSED_MESSAGE
  = 'Accounts here are by invitation only. Ask an admin of your team to invite '
    + 'you, then create your account from the link in that email.'

export type SignUpMode = 'bootstrap' | 'invitation' | 'closed'

/**
 * True only while no user exists at all, so the first person to arrive can
 * create the owner account and start inviting. Stops being true permanently
 * the moment that account is created.
 *
 * On a freshly deployed instance that window is open to whoever finds the site
 * first, which is a real race on a public host. Setting SIGNUP_BOOTSTRAP_EMAIL
 * closes it: only that address can claim the owner account. Leave it unset and
 * the window is simply first-come.
 */
export async function isBootstrapSignUp(email?: string): Promise<boolean> {
  const allowed = process.env.SIGNUP_BOOTSTRAP_EMAIL?.trim().toLowerCase()
  if (allowed && email && email.trim().toLowerCase() !== allowed) return false

  const [row] = await useDB()
    .select({ count: sql<number>`count(*)::int` })
    .from(user)
  return (row?.count ?? 0) === 0
}

/**
 * A pending, unexpired invitation for this address. Better Auth lowercases the
 * address when it stores an invitation, but compare case-insensitively anyway
 * so a differently-cased signup still matches.
 */
export async function findPendingInvitation(email: string) {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return null

  const [row] = await useDB()
    .select({
      id: invitation.id,
      email: invitation.email,
      organizationId: invitation.organizationId
    })
    .from(invitation)
    .where(and(
      sql`lower(${invitation.email}) = ${normalized}`,
      eq(invitation.status, 'pending'),
      gt(invitation.expiresAt, new Date())
    ))
    .limit(1)

  return row ?? null
}

/** A pending, unexpired invitation looked up by its id (from an invite link). */
export async function findPendingInvitationById(invitationId: string) {
  const id = invitationId.trim()
  if (!id) return null

  const [row] = await useDB()
    .select({
      id: invitation.id,
      email: invitation.email,
      organizationId: invitation.organizationId
    })
    .from(invitation)
    .where(and(
      eq(invitation.id, id),
      eq(invitation.status, 'pending'),
      gt(invitation.expiresAt, new Date())
    ))
    .limit(1)

  return row ?? null
}

export async function isSignUpAllowed(email: string): Promise<boolean> {
  if (await findPendingInvitation(email)) return true
  return isBootstrapSignUp(email)
}
