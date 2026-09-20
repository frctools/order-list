import { createError, type H3Event } from 'h3'
import { useAuth } from './auth'

/** Validates an organization API key supplied in the standard x-api-key header. */
export async function requireOrganizationApiKey(event: H3Event) {
  const key = getHeader(event, 'x-api-key')
  if (!key) {
    throw createError({ statusCode: 401, statusMessage: 'Missing x-api-key header' })
  }

  const result = await useAuth().api.verifyApiKey({
    body: { key, configId: 'organization' }
  })
  if (!result.valid || !result.key) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid API key' })
  }

  return result.key.referenceId
}
