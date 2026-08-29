// Works out which Drizzle migrations the target database has not applied yet,
// and whether any of them would destroy data.
//
// This exists because deploying code that queries a table its database does not
// have takes the site down, and nothing in the build notices: the app starts
// fine, static pages render, and only the queries that touch the new schema
// fail. Shipping the receipts feature without its migration did exactly that.
//
// Reads the applied migrations' created_at values on stdin, one per line -- the
// values in drizzle.__drizzle_migrations, which are the same numbers as `when`
// in drizzle/meta/_journal.json.
//
//   psql -t -A -c 'select created_at from drizzle.__drizzle_migrations' \
//     | bun deploy/pending-migrations.mjs [--allow-destructive]
//
// Exits non-zero when a pending migration looks destructive and
// --allow-destructive was not passed, so an unattended deploy stops before it
// touches the server rather than after.

import { readFileSync, existsSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const allowDestructive = process.argv.includes("--allow-destructive");

// Deliberately broad. A false positive costs one checkbox; a false negative
// applies something that discards a column with nobody watching. DROP
// CONSTRAINT and DROP INDEX are caught too, which is the price of not
// parsing SQL properly.
const DESTRUCTIVE = [
  /\bDROP\b/i,
  /\bRENAME\b/i,
  /\bTRUNCATE\b/i,
  // A type change can silently round or truncate existing values.
  /\bALTER\s+COLUMN\b[\s\S]*?\bTYPE\b/i
];

const applied = new Set(
  readFileSync(0, "utf8")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
);

const journal = JSON.parse(
  readFileSync(join(root, "drizzle", "meta", "_journal.json"), "utf8")
);

const pending = journal.entries.filter(e => !applied.has(String(e.when)));

console.log(
  `${applied.size} migration(s) applied on the target, `
  + `${journal.entries.length} in the repo.`
);

if (pending.length === 0) {
  console.log("No pending migrations.");
  writeOutput(0);
  process.exit(0);
}

const risky = [];
for (const entry of pending) {
  const file = join(root, "drizzle", `${entry.tag}.sql`);
  if (!existsSync(file)) {
    console.error(`  ${entry.tag}: MISSING SQL FILE -- refusing to guess`);
    risky.push(entry.tag);
    continue;
  }
  const sql = readFileSync(file, "utf8");
  const hits = DESTRUCTIVE.filter(re => re.test(sql));
  if (hits.length > 0) {
    risky.push(entry.tag);
    console.log(`  ${entry.tag}: PENDING, needs review (${hits.length} destructive pattern(s))`);
  } else {
    console.log(`  ${entry.tag}: PENDING, additive`);
  }
}

writeOutput(pending.length);

if (risky.length > 0 && !allowDestructive) {
  console.error("");
  console.error(
    `Refusing to deploy: ${risky.join(", ")} may destroy data and would run `
    + "unattended."
  );
  console.error(
    "Read the SQL, then re-run this workflow with run_migrations ticked to "
    + "apply it deliberately."
  );
  process.exit(1);
}

function writeOutput(count) {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `pending=${count}\n`);
  }
}
