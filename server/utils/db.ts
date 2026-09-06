import { drizzle } from 'drizzle-orm/node-postgres'
import * as authSchema from './auth-schema'
import * as appSchema from './schema'
import type { Hyperdrive } from '@cloudflare/workers-types'
import { Pool } from 'pg'

const hyperdrive = process.env.HYPERDRIVE as Hyperdrive | undefined
const pool = new Pool({
  connectionString: hyperdrive?.connectionString || process.env.DATABASE_URL!,
  max: 2, // Allows up to 2 simultaneous connections
  idleTimeoutMillis: 30000,
});

export const useDB = () => drizzle(
  pool,
  {
    schema: { ...authSchema, ...appSchema }
  }
)
