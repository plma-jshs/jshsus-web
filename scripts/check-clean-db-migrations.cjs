#!/usr/bin/env node
const { execFileSync, spawnSync } = require('node:child_process');
const path = require('node:path');

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

function pullImageWithRetry(attempts = 3) {
  let lastError = '';
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = spawnSync('docker', ['pull', image], {
      encoding: 'utf8',
      stdio: ['ignore', 'inherit', 'pipe'],
    });
    if (result.status === 0) return;

    lastError = result.stderr.trim();
    if (attempt < attempts) {
      const delayMs = attempt * 5_000;
      console.warn(
        `MySQL image pull attempt ${attempt}/${attempts} failed; retrying in ${delayMs / 1_000}s.`,
      );
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
    }
  }
  throw new Error(`Could not pull ${image} after ${attempts} attempts. ${lastError}`);
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

function mysqlExec(sql) {
  return run('docker', [
    'exec',
    containerId,
    'mysql',
    '-h127.0.0.1',
    `-u${user}`,
    `-p${password}`,
    database,
    '-N',
    '-B',
    '-e',
    sql,
  ]);
}

function seedPrivacyRetentionFixture() {
  mysqlExec(`
    INSERT INTO users
      (student_no, name, user_status, status_changed_at, created_at, updated_at)
    VALUES
      (7777, 'Retention fixture', 'graduated', '2024-01-01 00:00:00.000', now(3), now(3));
    SET @privacy_user_id = LAST_INSERT_ID();

    INSERT INTO students
      (user_id, student_no, name, grade, class_no, number, current_point, created_at, updated_at)
    VALUES
      (@privacy_user_id, 7777, 'Retention fixture', 3, 1, 1, 1, now(3), now(3));
    SET @privacy_student_id = LAST_INSERT_ID();

    INSERT INTO point_reasons
      (point_reason_type, point, comment, is_active, created_at, updated_at)
    VALUES
      ('PLUS', 1, 'Retention fixture', true, now(3), now(3));
    SET @privacy_reason_id = LAST_INSERT_ID();

    INSERT INTO point_records
      (student_id, teacher_id, reason_id, reason_type, reason_text, point, comment,
       base_date, created_at, updated_at)
    VALUES
      (@privacy_student_id, @privacy_user_id, @privacy_reason_id, 'PLUS',
       'Retention fixture', 1, 'Retention fixture', '2024-01-01', now(3), now(3));
    SET @privacy_point_record_id = LAST_INSERT_ID();

    INSERT INTO point_adjustments
      (point_record_id, actor_id, point_adjustment_action, before_point, after_point,
       reason, created_at)
    VALUES
      (@privacy_point_record_id, @privacy_user_id, 'correct', 0, 1,
       'Retention fixture', now(3));

    INSERT INTO point_award_cases
      (student_id, type, threshold_point, point_award_case_status, memo, created_at, updated_at)
    VALUES
      (@privacy_student_id, 'fixture', 1, 'completed', 'Retention fixture',
       '2024-01-01 00:00:00.000', now(3));

    INSERT INTO activity_requests
      (student_id, created_by_id, location, starts_at, ends_at, purpose,
       activity_request_status, created_at, updated_at)
    VALUES
      (@privacy_student_id, @privacy_user_id, 'fixture',
       '2024-01-01 10:00:00.000', '2024-01-01 11:00:00.000',
       'Retention fixture', 'approved', now(3), now(3));
    SET @privacy_activity_request_id = LAST_INSERT_ID();

    INSERT INTO activity_request_participants
      (activity_request_id, student_id, created_at)
    VALUES
      (@privacy_activity_request_id, @privacy_student_id, now(3));

    INSERT INTO activity_request_events
      (activity_request_id, actor_id, activity_request_event_type, note, created_at)
    VALUES
      (@privacy_activity_request_id, @privacy_user_id, 'approved',
       'Retention fixture', now(3));

    INSERT INTO legacy_activity_archives
      (source_id, activity_date, time_text, time_ranges, location, purpose,
       representative_text, participants_text, source_payload_hash, imported_at)
    VALUES
      ('retention-fixture', '2024-01-01', '10:00-11:00',
       JSON_ARRAY(JSON_OBJECT('startsAt', '10:00', 'endsAt', '11:00')),
       'fixture', 'Retention fixture', '7777 Retention fixture',
       '7777 Retention fixture',
       'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', now(3));

  `);
}

function main() {
  console.log(`Starting clean MySQL migration check with ${image}...`);
  pullImageWithRetry();
  containerId = run('docker', [
    'run',
    '--rm',
    '--pull=never',
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
  const databaseUrl = `mysql://${user}:${password}@127.0.0.1:${port}/${database}`;
  const databasePackageDir = path.resolve('packages/db');
  const commandEnvironment = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    DATABASE_SSL_MODE: 'disabled',
  };

  console.log('Seeding a stale object to verify baseline reset preflight...');
  mysqlExec('CREATE TABLE stale_legacy_table (id int primary key)');

  console.log(`Checking baseline preflight on temporary database at 127.0.0.1:${port}...`);
  const preflight = spawnSync(
    process.execPath,
    [path.join(databasePackageDir, 'scripts/prepare-baseline-database.cjs')],
    {
      stdio: 'inherit',
      env: {
        ...commandEnvironment,
        RESET_DATABASE_ON_BASELINE_MISMATCH: 'true',
      },
    },
  );
  if (preflight.status !== 0) {
    throw new Error(`Clean database baseline preflight failed with exit code ${preflight.status}.`);
  }
  const staleCount = Number(
    mysqlExec(
      "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stale_legacy_table'",
    ).trim(),
  );
  if (staleCount !== 0) {
    throw new Error('Baseline preflight did not remove the seeded stale table.');
  }

  console.log(`Applying migrations to temporary database on 127.0.0.1:${port}...`);
  const result = spawnSync(
    process.execPath,
    [path.join(databasePackageDir, 'node_modules/drizzle-kit/bin.cjs'), 'migrate'],
    {
      stdio: 'inherit',
      cwd: databasePackageDir,
      env: commandEnvironment,
    },
  );
  if (result.status !== 0) {
    throw new Error(`Clean database migration check failed with exit code ${result.status}.`);
  }

  console.log(`Bootstrapping core data on temporary database at 127.0.0.1:${port}...`);
  const bootstrap = spawnSync(
    process.execPath,
    [path.join(databasePackageDir, 'scripts/bootstrap-core-data.cjs')],
    {
      stdio: 'inherit',
      env: commandEnvironment,
    },
  );
  if (bootstrap.status !== 0) {
    throw new Error(`Clean database bootstrap check failed with exit code ${bootstrap.status}.`);
  }

  console.log('Running the privacy retention dry-run against the migrated database...');
  const privacyDryRun = spawnSync(
    process.execPath,
    [path.join(databasePackageDir, 'scripts/privacy-retention.cjs')],
    {
      stdio: 'inherit',
      env: commandEnvironment,
    },
  );
  if (privacyDryRun.status !== 0) {
    throw new Error(
      `Privacy retention dry-run check failed with exit code ${privacyDryRun.status}.`,
    );
  }

  console.log('Applying privacy retention to an isolated expired-record fixture...');
  seedPrivacyRetentionFixture();
  const privacyApply = spawnSync(
    process.execPath,
    [
      path.join(databasePackageDir, 'scripts/privacy-retention.cjs'),
      '--apply',
      '--confirm-policy',
      'owner-confirmed-2026-07-31',
    ],
    {
      stdio: 'inherit',
      env: {
        ...commandEnvironment,
        AWS_REGION: 'ap-northeast-2',
        COGNITO_USER_POOL_ID: 'ap-northeast-2_fixture',
      },
    },
  );
  if (privacyApply.status !== 0) {
    throw new Error(`Privacy retention apply check failed with exit code ${privacyApply.status}.`);
  }
  const retainedOriginals = Number(
    mysqlExec(`
      SELECT
        (SELECT COUNT(*) FROM point_records WHERE reason_text = 'Retention fixture')
        +
        (SELECT COUNT(*) FROM point_adjustments WHERE reason = 'Retention fixture')
        +
        (SELECT COUNT(*) FROM point_award_cases WHERE memo = 'Retention fixture')
        +
        (SELECT COUNT(*) FROM activity_requests WHERE purpose = 'Retention fixture')
        +
        (SELECT COUNT(*) FROM activity_request_events WHERE note = 'Retention fixture')
        +
        (SELECT COUNT(*) FROM legacy_activity_archives
         WHERE source_id = 'retention-fixture')
    `).trim(),
  );
  if (retainedOriginals !== 0) {
    throw new Error(`Privacy retention left ${retainedOriginals} expired fixture originals.`);
  }
  const maskedStubs = Number(
    mysqlExec(`
      SELECT COUNT(*)
        FROM users u
        JOIN students s ON s.user_id = u.id
       WHERE u.personal_data_erased_at IS NOT NULL
         AND u.student_no IS NULL
         AND s.student_no < 0
    `).trim(),
  );
  if (maskedStubs !== 1) {
    throw new Error(`Privacy retention expected one masked identity stub, found ${maskedStubs}.`);
  }

  console.log('Clean database migration and bootstrap check passed.');
}

try {
  main();
} finally {
  cleanup();
}
