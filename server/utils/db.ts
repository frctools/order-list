import { drizzle } from 'drizzle-orm/node-postgres'
import * as authSchema from './auth-schema'
import * as appSchema from './schema'
import type { Hyperdrive } from '@cloudflare/workers-types'

const schema = { ...authSchema, ...appSchema }

function createDB(connectionString: string) {
  return drizzle({
    connection: {
      connectionString,
      max: 2,
      idleTimeoutMillis: 30000
    },
    schema
  })
}

// Local dev runs in one long-lived Node process, so creating a new pool on
// every useDB() call (several per request) piles up open connections until
// the database refuses new ones. Reuse a single pool there. On Workers we
// still create one per call: Hyperdrive does the pooling, and sockets can't
// be shared across requests.
let devDB: ReturnType<typeof createDB> | undefined

export const useDB = () => {
  const hyperdrive = process.env.HYPERDRIVE as Hyperdrive | undefined
  if (hyperdrive?.connectionString) {
    return createDB(hyperdrive.connectionString)
  }
  devDB ??= createDB(process.env.DATABASE_URL!)
  return devDB
}
