import { defineEventHandler, getQuery } from 'h3'
import {
  findPendingInvitationById,
  isBootstrapSignUp,
  type SignUpMode
} from '../utils/signup-gate'

/**
 * Tells the signup page which of its three states to render. Purely cosmetic —
 * the account creation itself is gated in Better Auth's user-create hook, so a
 * forged answer here buys nothing.
 */
export default defineEventHandler(async (event) => {
  const { invitation } = getQuery(event)
  const invitationId = typeof invitation === 'string' ? invitation : ''

  if (invitationId) {
    const pending = await findPendingInvitationById(invitationId)
    if (pending) {
      // Better Auth refuses to accept an invitation unless the signed-in
      // address matches it exactly, so hand the address back and let the form
      // pin it rather than letting someone sign up into a dead end.
      return { mode: 'invitation' as SignUpMode, email: pending.email }
    }
  }

  if (await isBootstrapSignUp()) {
    return { mode: 'bootstrap' as SignUpMode, email: null }
  }

  return { mode: 'closed' as SignUpMode, email: null }
})
