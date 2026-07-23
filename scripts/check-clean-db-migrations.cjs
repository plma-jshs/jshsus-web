#!/usr/bin/env node
const { execFileSync, spawnSync } = require('node:child_process');

const image = process.env.MIGRATION_CHECK_MYSQL_IMAGE ?? 'mysql:8.4';
const database = 'jshsus_migration_check';
const user = 'jshsus';
const password = 'migration_check_password';
const rootPassword = 'migration_check_root_password';
const containerName = `jshsus-migration-check-${process.pid}-${Date.now()}`;
let containerId = '';

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
    ...options,
  });
}

function cleanup() {
  if (!containerId) return;
  spawnSync('docker', ['rm', '-f', containerId], { stdio: 'ignore' });
  containerId = '';
}

process.on('exit', cleanup);
process.on('SIGINT', () => {
  cleanup();
  process.exit(130);
});
process.on('SIGTERM', () => {
  cleanup();
  process.exit(143);
});

function waitForMysql() {
  const deadline = Date.now() + 90_000;
  let lastError = '';
  while (Date.now() < deadline) {
    const result = spawnSync(
      'docker',
      [
        'exec',
        containerId,
        'mysqladmin',
        'ping',
        '-h127.0.0.1',
        `-u${user}`,
        `-p${password}`,
        '--silent',
      ],
      { encoding: 'utf8' },
    );
    if (result.status === 0) return;
    lastError = `${result.stderr}${result.stdout}`.trim();
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1_000);
  }
  throw new Error(`Timed out waiting for MySQL to become healthy. ${lastError}`);
}

function hostPort() {
  const output = run('docker', ['port', containerId, '3306/tcp']).trim();
  const match = output.match(/:(\d+)$/);
  if (!match) throw new Error(`Could not determine MySQL host port from: ${output}`);
  return match[1];
}

function main() {
  console.log(`Starting clean MySQL migration check with ${image}...`);
  containerId = run('docker', [
    'run',
    '--rm',
    '--name',
    containerName,
    '-e',
    `MYSQL_DATABASE=${database}`,
    '-e',
    `MYSQL_USER=${user}`,
    '-e',
    `MYSQL_PASSWORD=${password}`,
    '-e',
    `MYSQL_ROOT_PASSWORD=${rootPassword}`,
    '-p',
    '127.0.0.1::3306',
    '-d',
    image,
  ]).trim();

  waitForMysql();
  const port = hostPort();
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const databaseUrl = `mysql://${user}:${password}@127.0.0.1:${port}/${database}`;

  console.log(`Applying migrations to temporary database on 127.0.0.1:${port}...`);
  const result = spawnSync(pnpm, ['db:migrate'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DATABASE_SSL_MODE: 'disabled',
    },
  });
  if (result.status !== 0) {
    throw new Error(`Clean database migration check failed with exit code ${result.status}.`);
  }

  console.log('Clean database migration check passed.');
}

try {
  main();
} finally {
  cleanup();
}
