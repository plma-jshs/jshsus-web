#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { assertLocalSeedAllowed } = require('./local-seed-safety.cjs');

const packageRoot = path.resolve(__dirname, '..');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

function run(script, extraEnv = {}) {
  const result = spawnSync(pnpm, [script], {
    cwd: packageRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...extraEnv,
    },
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

assertLocalSeedAllowed();
run('db:prepare-baseline', { RESET_DATABASE_ON_BASELINE_MISMATCH: 'true' });
run('db:migrate');
run('db:bootstrap-core');
