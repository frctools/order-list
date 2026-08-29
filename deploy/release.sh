#!/usr/bin/env bash
#
# Ship a release to the droplet.
#
# The build happens HERE, not there: a Nuxt build wants more memory than a 2 GB
# droplet has spare, and an OOM part-way through takes the running site down
# with it.
#
#   ./deploy/release.sh                  # build, upload, migrate, reload
#   SKIP_BUILD=1 ./deploy/release.sh     # upload what is already in .output/
#
# On Windows the same steps run through plink/pscp with the key in Pageant,
# since OpenSSH cannot read a .ppk.

set -euo pipefail

HOST="${DEPLOY_HOST:-root@67.207.85.228}"
APP_DIR="${APP_DIR:-/srv/parts}"

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  echo "==> Building the app"
  bun run build
  echo "==> Building vendord"
  (cd vendord && bunx nitro build)
fi

# Nitro traces a dependency copy into .output/server/node_modules for whatever
# machine ran the build. Shipped from a Windows workstation its nested
# directories arrive empty and the app crash-loops on ENOENT, so it is left
# out and resolution walks up into the natively-installed node_modules.
echo "==> Uploading"
# .output is gitignored but is the whole point of the upload, so this tars the
# working tree rather than using git archive. node_modules is rebuilt on the
# far side; .env there is the production one and must never be overwritten.
tar -czf - \
  --exclude=./node_modules \
  --exclude=./.git \
  --exclude=./.nuxt \
  --exclude=./.env \
  --exclude=./vendord/node_modules \
  --exclude=./.output/server/node_modules \
  --exclude=./.wrangler \
  . | ssh "$HOST" "tar -xzf - -C $APP_DIR"

echo "==> Installing dependencies"
# A full install, not --production: .output does not vendor its dependencies
# (better-sqlite3 is resolved from node_modules at runtime, and /docs breaks
# without it), and drizzle-kit — which db:migrate needs — is a devDependency.
ssh "$HOST" "cd $APP_DIR && bun install"

echo "==> Migrating"
# Before the reload, never after: the new code queries columns the old
# database may not have yet.
ssh "$HOST" "cd $APP_DIR && bun run db:migrate"

echo "==> Reloading"
ssh "$HOST" "cd $APP_DIR && pm2 reload ecosystem.config.cjs --update-env && pm2 save"

echo "==> Done"
ssh "$HOST" "pm2 list"
