import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as authSchema from './auth-schema'
import * as appSchema from './schema'

const schema = { ...authSchema, ...appSchema }

// One pool for the life of the process.
//
// This used to build a fresh pool on every useDB() call. On Workers that was
// merely wasteful — isolates are short-lived and Hyperdrive pooled underneath.
// On a long-running Node server it exhausts Postgres connections instead: a
// single request touches useDB() several times, none of them are closed, and
// the server stops answering once max_connections is reached.
let pool: Pool | undefined
let db: NodePgDatabase<typeof schema> | undefined

export const useDB = (): NodePgDatabase<typeof schema> => {
  if (!db) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL!,
      // Comfortably under Postgres' default max_connections of 100, leaving
      // room for psql, backups and a second app process.
      max: Number(process.env.DATABASE_POOL_MAX ?? 10)
    })
    db = drizzle(pool, { schema })
  }
  return db
}

// Let the process shut down without waiting on idle connections.
export const closeDB = async (): Promise<void> => {
  await pool?.end()
  pool = undefined
  db = undefined
}
