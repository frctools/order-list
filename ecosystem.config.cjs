// PM2 process definitions for the droplet.
//
// Both processes listen on localhost only — Caddy is the single thing bound to
// a public port, terminating TLS and proxying to the app.
//
//   pm2 start ecosystem.config.cjs
//   pm2 save && pm2 startup     (so they come back after a reboot)

const path = require('node:path')

const root = __dirname

module.exports = {
  apps: [
    {
      name: 'innovators-parts',
      script: path.join(root, '.output/server/index.mjs'),
      interpreter: 'bun',
      // Nuxt's node-server build reads its own config from the environment.
      env: {
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
      name: 'vendord',
      script: path.join(root, 'vendord/.output/server/index.mjs'),
      interpreter: 'bun',
      env: {
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
