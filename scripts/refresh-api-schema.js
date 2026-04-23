#!/usr/bin/env node
// Phase 187 — refresh api-schema/openapi.json from a running backend.
//
// Reads API_BASE_URL from env (default http://localhost:8000). Fails
// loudly if the backend is unreachable — stale snapshots are better
// than silently corrupted ones. Writes a formatted JSON file so git
// diffs are readable.
//
// Usage:
//   npm run refresh-api-schema
//   API_BASE_URL=http://localhost:8000 node scripts/refresh-api-schema.js
//
// Requires Node 20+ for global fetch. See ADR-005 for rationale.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000';
const SPEC_URL = `${BASE_URL.replace(/\/+$/, '')}/openapi.json`;
const OUTPUT_PATH = path.resolve(__dirname, '..', 'api-schema', 'openapi.json');

async function main() {
  process.stdout.write(`[refresh-api-schema] fetching ${SPEC_URL}\n`);

  let response;
  try {
    response = await fetch(SPEC_URL, {
      headers: {Accept: 'application/json'},
    });
  } catch (err) {
    process.stderr.write(
      `[refresh-api-schema] fetch failed: ${err.message}\n` +
      `  Is the backend running? Try:\n` +
      `  cd ../moto-diag && .venv/Scripts/python.exe -m motodiag serve --host 0.0.0.0 --port 8000\n`,
    );
    process.exit(1);
  }

  if (!response.ok) {
    process.stderr.write(
      `[refresh-api-schema] backend returned ${response.status} ${response.statusText}\n`,
    );
    process.exit(1);
  }

  const spec = await response.json();

  // Sanity-check a minimal OpenAPI 3.1 shape so we don't overwrite a
  // valid snapshot with garbage.
  if (typeof spec !== 'object' || !spec.openapi || !spec.paths) {
    process.stderr.write(
      `[refresh-api-schema] response does not look like an OpenAPI spec ` +
      `(missing openapi or paths key). Refusing to overwrite.\n`,
    );
    process.exit(1);
  }

  const outputDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, {recursive: true});
  }

  const previous = fs.existsSync(OUTPUT_PATH)
    ? fs.readFileSync(OUTPUT_PATH, 'utf8')
    : null;
  const next = JSON.stringify(spec, null, 2) + '\n';

  fs.writeFileSync(OUTPUT_PATH, next, 'utf8');

  const pathCount = Object.keys(spec.paths).length;
  const tagCount = Array.isArray(spec.tags) ? spec.tags.length : 0;
  const sizeKb = (Buffer.byteLength(next, 'utf8') / 1024).toFixed(1);

  process.stdout.write(
    `[refresh-api-schema] wrote ${OUTPUT_PATH}\n` +
    `  OpenAPI ${spec.openapi} · ${pathCount} paths · ${tagCount} tags · ${sizeKb} KB\n`,
  );

  if (previous === next) {
    process.stdout.write(`[refresh-api-schema] (no changes — snapshot up to date)\n`);
  } else if (previous === null) {
    process.stdout.write(`[refresh-api-schema] (new file — first snapshot)\n`);
  } else {
    const prevPaths = Object.keys(JSON.parse(previous).paths || {});
    const nextPaths = Object.keys(spec.paths);
    const added = nextPaths.filter(p => !prevPaths.includes(p));
    const removed = prevPaths.filter(p => !nextPaths.includes(p));
    if (added.length) process.stdout.write(`  + paths: ${added.join(', ')}\n`);
    if (removed.length) process.stdout.write(`  - paths: ${removed.join(', ')}\n`);
    if (!added.length && !removed.length) {
      process.stdout.write(`  (paths unchanged; schemas/metadata updated)\n`);
    }
  }

  process.stdout.write(
    `[refresh-api-schema] next: npm run generate-api-types\n`,
  );
}

main().catch(err => {
  process.stderr.write(`[refresh-api-schema] unexpected error: ${err.stack || err}\n`);
  process.exit(1);
});
