import { and, eq, gt, sql } from 'drizzle-orm'
import { useDB } from './db'
import { invitation, member, user } from './auth-schema'

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

/**
 * Turn every pending invitation for this user into membership.
 *
 * Being invited and being a member are separate things: the gate above only
 * checks an invitation exists, while acceptance happens when the browser visits
 * /accept-invitation/<id>. That link only ever arrives by email, so anyone who
 * signs in any other way -- straight to /auth/login, or through Google, or at
 * /auth/signup without the link -- ends up with an account, no organization and
 * an empty dashboard, while the invitation sits there pending. With no
 * RESEND_KEY set no email goes out at all, and that is the only path there is.
 *
 * So acceptance is done here instead, keyed off the address the invitation was
 * sent to, which is the same thing Better Auth's own acceptInvitation checks
 * before it will do anything.
 *
 * Returns the organization to make active, when joining one.
 */
export async function acceptPendingInvitations(
  userId: string,
  email: string
): Promise<string | null> {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return null

  const db = useDB()
  const pending = await db
    .select({
      id: invitation.id,
      organizationId: invitation.organizationId,
      role: invitation.role
    })
    .from(invitation)
    .where(and(
      sql`lower(${invitation.email}) = ${normalized}`,
      eq(invitation.status, 'pending'),
      gt(invitation.expiresAt, new Date())
    ))

  if (pending.length === 0) return null

  const existing = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, userId))
  const alreadyIn = new Set(existing.map(m => m.organizationId))

  let joined: string | null = null

  for (const invite of pending) {
    // Re-running this must not produce a second membership row: there are no
    // transactions here, so a failure part-way through leaves some invitations
    // accepted and the rest pending, and the next sign-in picks up the rest.
    if (!alreadyIn.has(invite.organizationId)) {
      await db.insert(member).values({
        id: crypto.randomUUID(),
        organizationId: invite.organizationId,
        userId,
        role: invite.role ?? 'member',
        createdAt: new Date()
      })
      alreadyIn.add(invite.organizationId)
    }

    await db
      .update(invitation)
      .set({ status: 'accepted' })
      .where(eq(invitation.id, invite.id))

    joined ??= invite.organizationId
  }

  return joined
}

/**
 * The organization a fresh session should start in, when the user belongs to
 * exactly one. Better Auth leaves activeOrganizationId null on a new session
 * and every API route refuses without it, so without this the dashboard shows a
 * team while the server disagrees until the client reconciles. Ambiguous cases
 * -- more than one membership -- are left to the client, which remembers the
 * last choice.
 */
export async function soleOrganizationOf(userId: string): Promise<string | null> {
  const rows = await useDB()
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, userId))
    .limit(2)

  return rows.length === 1 ? rows[0]!.organizationId : null
}
