#!/usr/bin/env node
/* eslint-env node */
'use strict';

// Phase 209B item 1 — a Release build must name its server.
//
// The app reads the server from Settings, then from `API_BASE_URL`
// compiled in from `.env`. With neither, every screen says "No server
// set — go to Settings." That's fine on a developer's phone and wrong in
// the App Store, so a Release build that has no `API_BASE_URL`, or has
// one that isn't https, fails here instead of shipping.
//
// Reads the same file react-native-config compiles in, chosen the same
// way (node_modules/react-native-config/ios/ReactNativeConfig/
// ReadDotEnv.rb): `/tmp/envfile` if it exists, else `$ENVFILE`, else
// `.env`, resolved against the project root.
//
// There is no dev allowlist here. Plain http for localhost is a
// development convenience (src/api/serverUrl.ts, DEV_HTTP_HOSTS); a
// Release build has no use for it.
//
// Run by the "Check release server URL" build phase in
// ios/MotoDiag.xcodeproj, for the Release configuration only.
//
// Usage: node scripts/check-release-env.js [projectRoot]

const fs = require('fs');
const path = require('path');

const KEY = 'API_BASE_URL';
const DEFAULT_ENV_FILE = '.env';
const CUSTOM_ENV_MARKER = '/tmp/envfile';

// ReadDotEnv.rb's pattern, translated: KEY=VALUE, optional `export`,
// optional matching quotes.
const LINE = /^(?:export\s+|)([A-Za-z0-9_]+)\s*=\s*(?:(["'])?(.*?[^\\])\2?|)$/;

const RELEASE_URL = /^https:\/\/([a-z0-9.-]+)(?::(\d{1,5}))?(\/[^?#\s]*)?$/i;
const HOST_LABEL = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i;

/** Which env file react-native-config will compile in. */
function resolveEnvFile(projectRoot, env = process.env, marker = CUSTOM_ENV_MARKER) {
  const chosen = fs.existsSync(marker)
    ? fs.readFileSync(marker, 'utf8').trim()
    : env.ENVFILE || DEFAULT_ENV_FILE;
  const underRoot = path.resolve(projectRoot, chosen);
  if (fs.existsSync(underRoot)) {
    return underRoot;
  }
  if (fs.existsSync(chosen)) {
    return path.resolve(chosen);
  }
  return path.resolve(projectRoot, DEFAULT_ENV_FILE);
}

function parseEnv(text) {
  const out = {};
  for (const line of text.split('\n')) {
    if (line.trim() === '' || /^\s*#/.test(line)) {
      continue;
    }
    const m = LINE.exec(line);
    if (m) {
      out[m[1]] = m[3] === undefined ? '' : m[3];
    }
  }
  return out;
}

/** Returns {ok, message}. Never throws for a bad value. */
function checkReleaseEnv(projectRoot, env = process.env, marker = CUSTOM_ENV_MARKER) {
  const file = resolveEnvFile(projectRoot, env, marker);
  if (!fs.existsSync(file)) {
    return {
      ok: false,
      message: `${file} does not exist. A Release build needs ${KEY} (copy .env.example).`,
    };
  }
  const value = (parseEnv(fs.readFileSync(file, 'utf8'))[KEY] || '').trim();
  if (value === '') {
    return {ok: false, message: `${KEY} is not set in ${file}. A Release build must name its server.`};
  }
  if (value.includes('<')) {
    return {ok: false, message: `${KEY} in ${file} is still the placeholder (${value}).`};
  }
  const m = RELEASE_URL.exec(value);
  const hostOk =
    m !== null && m[1].split('.').every((label) => HOST_LABEL.test(label));
  if (!hostOk) {
    return {
      ok: false,
      message: `${KEY} in ${file} must be an https:// address with no query or credentials (got ${value}).`,
    };
  }
  return {ok: true, message: `${KEY} ok: ${value} (from ${file})`};
}

module.exports = {checkReleaseEnv, parseEnv, resolveEnvFile};

if (require.main === module) {
  const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
  const result = checkReleaseEnv(root);
  if (result.ok) {
    console.log(`check-release-env: ${result.message}`);
  } else {
    // "error:" makes Xcode show it in the issue navigator.
    console.error(`error: check-release-env: ${result.message}`);
    process.exit(1);
  }
}
