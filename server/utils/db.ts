import { drizzle } from 'drizzle-orm/node-postgres'
import * as authSchema from './auth-schema'
import * as appSchema from './schema'
import type { Hyperdrive } from '@cloudflare/workers-types'

export const useDB = () => {
  const hyperdrive = process.env.HYPERDRIVE as Hyperdrive | undefined
  return drizzle({
    connection: {
      connectionString: hyperdrive?.connectionString || process.env.DATABASE_URL!,
      max: 2,
      idleTimeoutMillis: 30000
    },
    schema: { ...authSchema, ...appSchema }
  })
}
