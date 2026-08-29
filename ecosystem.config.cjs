// PM2 process definitions for the droplet.
//
// Both processes listen on localhost only — Caddy is the single thing bound to
// a public port, terminating TLS and proxying to the app.
//
//   pm2 start ecosystem.config.cjs
//   pm2 save && pm2 startup     (so they come back after a reboot)

const fs = require('node:fs')
const path = require('node:path')

const root = __dirname

// Nitro only reads .env in dev, and PM2 has no env_file option, so a
// production process started from here would otherwise come up with no
// DATABASE_URL and fail on its first query. Parse the file ourselves rather
// than adding a dotenv dependency just for this.
function readEnvFile(file) {
  if (!fs.existsSync(file)) return {}
  const out = {}
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    // Strip one layer of matching quotes, so quoted secrets don't arrive
    // with the quotes still attached.
    if (value.length > 1 && ((value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

const fileEnv = readEnvFile(path.join(root, '.env'))

module.exports = {
  apps: [
    {
      name: 'innovators-parts',
      script: path.join(root, '.output/server/index.mjs'),
      // Node, not Bun. @nuxt/content's server runtime opens its SQLite
      // through better-sqlite3, which is a Node native addon that Bun
      // cannot dlopen ('better-sqlite3' is not yet supported in Bun), so
      // every content query throws and /docs answers 404 while the rest of
      // the site looks fine. This survived a Windows-built .output, which
      // bundled a different connector, and broke the moment CI built on
      // Linux and the real driver got picked.
      interpreter: 'node',
      cwd: root,
      // Nuxt's node-server build reads its own config from the environment.
      env: {
        ...fileEnv,
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: '3000'
      },
      // One vCPU is plenty for a team-sized load, and a second instance would
      // double the database connections for no benefit. Raise with the droplet
      // if that stops being true.
      exec_mode: 'fork',
      instances: 1,
      max_memory_restart: '512M',
      time: true
    },
    {
      // The scraper the app delegates blocked vendors to. Not exposed.
      //
      // Its routes import the app's own db/schema modules, so it needs the
      // same DATABASE_URL the app uses — not just a host and port.
      name: 'vendord',
      script: path.join(root, 'vendord/.output/server/index.mjs'),
      // Node, not Bun. @nuxt/content's server runtime opens its SQLite
      // through better-sqlite3, which is a Node native addon that Bun
      // cannot dlopen ('better-sqlite3' is not yet supported in Bun), so
      // every content query throws and /docs answers 404 while the rest of
      // the site looks fine. This survived a Windows-built .output, which
      // bundled a different connector, and broke the moment CI built on
      // Linux and the real driver got picked.
      interpreter: 'node',
      cwd: root,
      env: {
        ...fileEnv,
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: '3434'
      },
      exec_mode: 'fork',
      instances: 1,
      max_memory_restart: '256M',
      time: true
    }
  ]
}
