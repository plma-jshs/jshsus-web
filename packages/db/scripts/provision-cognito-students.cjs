#!/usr/bin/env node

const mysql = require('mysql2/promise');
const {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  CognitoIdentityProviderClient,
  DescribeUserPoolCommand,
} = require('@aws-sdk/client-cognito-identity-provider');
const { seedConnectionOptions } = require('./seed-connection.cjs');
const {
  TEST_STUDENT_NO,
  canonicalUsername,
  parseArgs,
  safeErrorName,
  safeErrorSummary,
  validateCognitoUser,
  validatePoolSupportsStudentNumberLogin,
  validateTemporaryPassword,
} = require('./cognito-student-provisioning.cjs');

const LOCK_TIMEOUT_SECONDS = 5;
const PROVIDER = 'cognito';

function printHelp() {
  console.log(`Provision student identities in Amazon Cognito (dry-run by default).

Usage:
  pnpm --filter @jshsus/db db:provision-cognito-students -- [options]

Options:
  --student-no <number>       Inspect or provision one student only
  --include-test-account     Include the local 9999 test account
  --ensure-test-account      Create the staging-only 9999 fixture if it is absent
  --apply                     Create Cognito users and link their sub values
  --confirm-pool-id <id>      Required with --apply; must exactly match COGNITO_USER_POOL_ID
  --temporary-password-env <name>
                              Read a single pilot user's temporary password from this env var
  --help                      Show this help

Required environment:
  DATABASE_URL, COGNITO_USER_POOL_ID, AWS_REGION (or AWS_DEFAULT_REGION)

AWS credentials use the standard SDK provider chain, including AWS_PROFILE.
The credential principal must be allowed to call cognito-idp:DescribeUserPool
for preflight validation and AdminGetUser/AdminCreateUser for pilot provisioning.
Bulk apply is intentionally blocked until an encrypted credential-distribution process exists.
Temporary passwords are never printed or persisted by this command.`);
}

function readConfig(environment, options) {
  const databaseUrl = environment.DATABASE_URL;
  const poolId = environment.COGNITO_USER_POOL_ID;
  const region = environment.AWS_REGION || environment.AWS_DEFAULT_REGION;

  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  if (!poolId) throw new Error('COGNITO_USER_POOL_ID is required.');
  if (!region) throw new Error('AWS_REGION or AWS_DEFAULT_REGION is required.');

  if (options.apply && options.confirmPoolId !== poolId) {
    throw new Error(
      '--apply requires --confirm-pool-id with the exact COGNITO_USER_POOL_ID value.',
    );
  }

  if (options.apply && options.studentNo == null) {
    throw new Error(
      'Bulk apply is disabled until encrypted temporary-password distribution is implemented.',
    );
  }
  if (options.apply && !options.temporaryPasswordEnv) {
    throw new Error('--apply requires --temporary-password-env for the single pilot account.');
  }

  let temporaryPassword = null;
  if (options.apply) {
    temporaryPassword = validateTemporaryPassword(environment[options.temporaryPasswordEnv]);
  }

  if (options.ensureTestAccount && environment.COGNITO_PROVISIONING_STAGE !== 'staging') {
    throw new Error('--ensure-test-account requires COGNITO_PROVISIONING_STAGE=staging.');
  }

  return { databaseUrl, poolId, region, temporaryPassword };
}

async function databaseMetadata(connection) {
  const [tableRows] = await connection.query(
    `SELECT TABLE_NAME AS tableName
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()`,
  );
  const [columnRows] = await connection.query(
    `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()`,
  );

  const tables = new Set(tableRows.map((row) => row.tableName));
  const columns = new Map();
  for (const row of columnRows) {
    if (!columns.has(row.tableName)) columns.set(row.tableName, new Set());
    columns.get(row.tableName).add(row.columnName);
  }
  return { columns, tables };
}

function columnExpression(columns, tableAlias, columnName, fallback = 'NULL') {
  return columns.has(columnName) ? `${tableAlias}.\`${columnName}\`` : fallback;
}

function userActiveClause(userColumns) {
  if (userColumns.has('status')) return "u.`status` = 'active'";
  if (userColumns.has('user_status')) return "u.`user_status` = 'active'";
  return '1 = 1';
}

async function loadFromCurrentEnrollment(connection, metadata) {
  const requiredTables = ['users', 'students', 'student_enrollments', 'school_years'];
  if (!requiredTables.every((table) => metadata.tables.has(table))) return [];

  const userColumns = metadata.columns.get('users') ?? new Set();
  const studentColumns = metadata.columns.get('students') ?? new Set();
  const enrollmentColumns = metadata.columns.get('student_enrollments') ?? new Set();
  const schoolYearColumns = metadata.columns.get('school_years') ?? new Set();
  if (
    !studentColumns.has('user_id') ||
    !enrollmentColumns.has('student_id') ||
    !enrollmentColumns.has('student_no') ||
    !schoolYearColumns.has('year') ||
    !schoolYearColumns.has('is_active')
  ) {
    return [];
  }

  const enrollmentStatus = enrollmentColumns.has('status') ? "AND se.`status` = 'active'" : '';
  const [rows] = await connection.query(
    `SELECT DISTINCT
       u.id AS userId,
       se.student_no AS studentNo,
       ${columnExpression(studentColumns, 's', 'name', columnExpression(userColumns, 'u', 'name'))} AS name,
       ${columnExpression(userColumns, 'u', 'email')} AS email
     FROM student_enrollments se
     INNER JOIN school_years sy ON sy.year = se.school_year AND sy.is_active = 1
     INNER JOIN students s ON s.id = se.student_id
     INNER JOIN users u ON u.id = s.user_id
     WHERE ${userActiveClause(userColumns)} ${enrollmentStatus}
     ORDER BY se.student_no ASC`,
  );
  return rows;
}

async function loadFromStudents(connection, metadata) {
  if (!metadata.tables.has('users') || !metadata.tables.has('students')) return [];
  const userColumns = metadata.columns.get('users') ?? new Set();
  const studentColumns = metadata.columns.get('students') ?? new Set();
  if (!studentColumns.has('user_id') || !studentColumns.has('student_no')) return [];

  const [rows] = await connection.query(
    `SELECT
       u.id AS userId,
       s.student_no AS studentNo,
       ${columnExpression(studentColumns, 's', 'name', columnExpression(userColumns, 'u', 'name'))} AS name,
       ${columnExpression(userColumns, 'u', 'email')} AS email
     FROM students s
     INNER JOIN users u ON u.id = s.user_id
     WHERE ${userActiveClause(userColumns)}
     ORDER BY s.student_no ASC`,
  );
  return rows;
}

async function loadFromUsers(connection, metadata) {
  if (!metadata.tables.has('users')) return [];
  const columns = metadata.columns.get('users') ?? new Set();
  if (!columns.has('student_no')) throw new Error('users.student_no is required for fallback.');
  const gradeClause = columns.has('grade') ? 'AND u.`grade` BETWEEN 1 AND 3' : '';
  const [rows] = await connection.query(
    `SELECT
       u.id AS userId,
       u.student_no AS studentNo,
       ${columnExpression(columns, 'u', 'name')} AS name,
       ${columnExpression(columns, 'u', 'email')} AS email
     FROM users u
     WHERE ${userActiveClause(columns)}
       AND u.student_no > 0
       ${gradeClause}
     ORDER BY u.student_no ASC`,
  );
  return rows;
}

function normalizeCandidates(rows, options) {
  const byStudentNo = new Map();
  const byUserId = new Map();
  for (const row of rows) {
    const userId = Number(row.userId);
    const studentNo = Number(row.studentNo);
    if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error('Invalid users.id found.');
    if (!Number.isSafeInteger(studentNo) || studentNo <= 0) {
      throw new Error(`Invalid student number for user ${userId}.`);
    }
    if (!options.includeTestAccount && studentNo === TEST_STUDENT_NO) continue;
    if (options.studentNo != null && studentNo !== options.studentNo) continue;
    if (byStudentNo.has(studentNo)) throw new Error(`Duplicate student number: ${studentNo}.`);
    if (byUserId.has(userId)) throw new Error(`User ${userId} has multiple student profiles.`);

    const candidate = {
      email: typeof row.email === 'string' && row.email.trim() ? row.email.trim() : null,
      name: typeof row.name === 'string' && row.name.trim() ? row.name.trim() : String(studentNo),
      studentNo,
      userId,
      username: canonicalUsername(studentNo),
    };
    byStudentNo.set(studentNo, candidate);
    byUserId.set(userId, candidate);
  }

  const candidates = [...byStudentNo.values()].sort(
    (left, right) => left.studentNo - right.studentNo,
  );
  if (options.studentNo != null && candidates.length === 0) {
    throw new Error(`Active student ${options.studentNo} was not found.`);
  }
  return candidates;
}

async function loadCandidates(connection, options) {
  const metadata = await databaseMetadata(connection);
  let source = 'active enrollment';
  let rows = await loadFromCurrentEnrollment(connection, metadata);
  if (
    options.studentNo != null &&
    !rows.some((row) => Number(row.studentNo) === options.studentNo)
  ) {
    rows = [];
  }
  if (rows.length === 0) {
    source = 'students';
    rows = await loadFromStudents(connection, metadata);
  }
  if (
    options.studentNo != null &&
    !rows.some((row) => Number(row.studentNo) === options.studentNo)
  ) {
    rows = [];
  }
  if (rows.length === 0) {
    source = 'users fallback';
    rows = await loadFromUsers(connection, metadata);
  }
  return { candidates: normalizeCandidates(rows, options), source };
}

function requireColumns(metadata, table, required) {
  if (!metadata.tables.has(table)) throw new Error(`Required table ${table} does not exist.`);
  const columns = metadata.columns.get(table) ?? new Set();
  for (const column of required) {
    if (!columns.has(column)) throw new Error(`Required column ${table}.${column} does not exist.`);
  }
  return columns;
}

async function ensureStagingTestAccount(connection) {
  const metadata = await databaseMetadata(connection);
  const userColumns = requireColumns(metadata, 'users', [
    'id',
    'student_no',
    'name',
    'grade',
    'class_no',
    'number',
  ]);
  requireColumns(metadata, 'students', [
    'id',
    'user_id',
    'student_no',
    'name',
    'grade',
    'class_no',
    'number',
  ]);
  requireColumns(metadata, 'roles', ['id', 'name']);
  requireColumns(metadata, 'user_roles', ['user_id', 'role_id']);
  requireColumns(metadata, 'auth_accounts', ['user_id', 'provider', 'provider_account_id']);

  const statusColumn = userColumns.has('status')
    ? 'status'
    : userColumns.has('user_status')
      ? 'user_status'
      : null;
  if (!statusColumn) throw new Error('users requires status or user_status.');

  await connection.beginTransaction();
  try {
    const [numberOwners] = await connection.execute(
      `SELECT id, name, grade, class_no AS classNo, number, \`${statusColumn}\` AS status
       FROM users WHERE student_no = ? LIMIT 2 FOR UPDATE`,
      [TEST_STUDENT_NO],
    );
    if (numberOwners.length > 1) throw new Error('Multiple users own test student number 9999.');

    let userId;
    if (numberOwners.length === 0) {
      const [result] = await connection.execute(
        `INSERT INTO users (student_no, name, grade, class_no, number, \`${statusColumn}\`)
         VALUES (?, ?, 9, 9, 99, 'active')`,
        [TEST_STUDENT_NO, '테스트'],
      );
      userId = Number(result.insertId);
    } else {
      const owner = numberOwners[0];
      const exactFixture =
        owner.name === '테스트' &&
        Number(owner.grade) === 9 &&
        Number(owner.classNo) === 9 &&
        Number(owner.number) === 99 &&
        owner.status === 'active';
      if (!exactFixture) {
        throw new Error(
          'Student number 9999 belongs to a non-test user; refusing to overwrite it.',
        );
      }
      userId = Number(owner.id);
    }

    const [localAccounts] = await connection.execute(
      `SELECT id FROM auth_accounts
       WHERE user_id = ? AND provider = 'local'
       LIMIT 1 FOR UPDATE`,
      [userId],
    );
    if (localAccounts.length > 0) {
      throw new Error('The staging Cognito test fixture must not have a local password account.');
    }

    const [studentRows] = await connection.execute(
      `SELECT id, user_id AS userId, name, grade, class_no AS classNo, number
       FROM students WHERE student_no = ? OR user_id = ? FOR UPDATE`,
      [TEST_STUDENT_NO, userId],
    );
    if (studentRows.length === 0) {
      await connection.execute(
        `INSERT INTO students (user_id, student_no, name, grade, class_no, number)
         VALUES (?, ?, ?, 9, 9, 99)`,
        [userId, TEST_STUDENT_NO, '테스트'],
      );
    } else {
      const exactStudent =
        studentRows.length === 1 &&
        Number(studentRows[0].userId) === userId &&
        studentRows[0].name === '테스트' &&
        Number(studentRows[0].grade) === 9 &&
        Number(studentRows[0].classNo) === 9 &&
        Number(studentRows[0].number) === 99;
      if (!exactStudent) throw new Error('Conflicting students row exists for the test fixture.');
    }

    const roleNames = [
      'student',
      'teacher',
      'student_affairs_head',
      'broadcast_club',
      'student_council',
      'system_admin',
    ];
    const [roleRows] = await connection.query(
      `SELECT id, name FROM roles
       WHERE name IN (${roleNames.map(() => '?').join(', ')})
       FOR UPDATE`,
      roleNames,
    );
    const rolesByName = new Map(roleRows.map((role) => [role.name, Number(role.id)]));
    const missingRoles = roleNames.filter((name) => !rolesByName.has(name));
    if (missingRoles.length > 0) {
      throw new Error(`Required test roles are missing: ${missingRoles.join(', ')}.`);
    }
    for (const roleName of roleNames) {
      await connection.execute(
        `INSERT INTO user_roles (user_id, role_id)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
        [userId, rolesByName.get(roleName)],
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

function isNotFound(error) {
  return safeErrorName(error) === 'UserNotFoundException';
}

function isRetryable(error) {
  return (
    error?.$retryable != null ||
    [
      'InternalErrorException',
      'ServiceUnavailableException',
      'ThrottlingException',
      'TooManyRequestsException',
    ].includes(safeErrorName(error))
  );
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function sendWithRetry(client, commandFactory, attempts = 4) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await client.send(commandFactory());
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === attempts - 1) throw error;
      await delay(200 * 2 ** attempt + randomJitter(100));
    }
  }
  throw lastError;
}

function randomJitter(maximum) {
  return Math.floor(Math.random() * maximum);
}

async function getCognitoUser(client, poolId, username) {
  try {
    return await sendWithRetry(
      client,
      () => new AdminGetUserCommand({ UserPoolId: poolId, Username: username }),
    );
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

async function readDatabaseLinks(connection, userId, subject = null) {
  const parameters = [PROVIDER, userId];
  let subjectClause = '';
  if (subject) {
    subjectClause = ' OR (provider = ? AND provider_account_id = ?)';
    parameters.push(PROVIDER, subject);
  }
  const [rows] = await connection.execute(
    `SELECT id, user_id AS userId, provider_account_id AS subject
     FROM auth_accounts
     WHERE (provider = ? AND user_id = ?)${subjectClause}
     ORDER BY id ASC`,
    parameters,
  );
  return rows;
}

function validateLinks(links, candidate, subject = null) {
  const userLinks = links.filter((link) => Number(link.userId) === candidate.userId);
  if (userLinks.length > 1) {
    throw new Error(`User ${candidate.userId} has multiple Cognito links.`);
  }
  if (subject) {
    const subjectOwners = links.filter((link) => link.subject === subject);
    if (subjectOwners.some((link) => Number(link.userId) !== candidate.userId)) {
      throw new Error(`Cognito subject conflict for student ${candidate.studentNo}.`);
    }
    if (userLinks.length === 1 && userLinks[0].subject !== subject) {
      throw new Error(`User ${candidate.userId} is linked to a different Cognito subject.`);
    }
  }
  return userLinks[0] ?? null;
}

async function inspectCandidate(connection, client, poolId, candidate) {
  const canonical = await getCognitoUser(client, poolId, candidate.username);
  const aliasUser = await getCognitoUser(client, poolId, String(candidate.studentNo));
  if (aliasUser && aliasUser.Username !== candidate.username) {
    throw new Error(`Student-number alias ${candidate.studentNo} belongs to another Cognito user.`);
  }

  const subject = canonical ? validateCognitoUser(canonical, candidate) : null;
  const links = await readDatabaseLinks(connection, candidate.userId, subject);
  const link = validateLinks(links, candidate, subject);
  if (!canonical && link) {
    throw new Error(
      `Student ${candidate.studentNo} has a database link but no canonical Cognito user.`,
    );
  }

  if (!canonical) return { action: 'create_and_link', candidate };
  if (!link) return { action: 'link_existing', candidate, subject };
  return { action: 'no_op', candidate, subject };
}

function cognitoAttributes(candidate) {
  const attributes = [
    { Name: 'preferred_username', Value: String(candidate.studentNo) },
    { Name: 'name', Value: candidate.name },
  ];
  if (candidate.email) attributes.push({ Name: 'email', Value: candidate.email });
  return attributes;
}

async function createOrLoadCognitoUser(client, poolId, candidate, temporaryPassword) {
  const existing = await getCognitoUser(client, poolId, candidate.username);
  if (existing) return existing;

  try {
    await sendWithRetry(
      client,
      () =>
        new AdminCreateUserCommand({
          MessageAction: 'SUPPRESS',
          TemporaryPassword: temporaryPassword,
          UserAttributes: cognitoAttributes(candidate),
          Username: candidate.username,
          UserPoolId: poolId,
        }),
    );
  } catch (error) {
    if (safeErrorName(error) !== 'UsernameExistsException' && !isRetryable(error)) throw error;
  }

  const created = await getCognitoUser(client, poolId, candidate.username);
  if (!created)
    throw new Error(`Cognito user creation could not be confirmed for ${candidate.studentNo}.`);
  return created;
}

async function ensureDatabaseLink(connection, candidate, subject) {
  await connection.beginTransaction();
  try {
    const [users] = await connection.execute(
      'SELECT id FROM users WHERE id = ? LIMIT 1 FOR UPDATE',
      [candidate.userId],
    );
    if (users.length !== 1) throw new Error(`User ${candidate.userId} no longer exists.`);

    const links = await readDatabaseLinks(connection, candidate.userId, subject);
    const existing = validateLinks(links, candidate, subject);
    if (!existing) {
      await connection.execute(
        `INSERT INTO auth_accounts (user_id, provider, provider_account_id)
         VALUES (?, ?, ?)`,
        [candidate.userId, PROVIDER, subject],
      );
    }
    await connection.commit();
    return existing ? 'already_linked' : 'linked';
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function applyPlan(connection, client, poolId, item, temporaryPassword) {
  const user = await createOrLoadCognitoUser(client, poolId, item.candidate, temporaryPassword);
  const subject = validateCognitoUser(user, item.candidate);
  await ensureDatabaseLink(connection, item.candidate, subject);
}

function summarizePlan(plan) {
  return plan.reduce(
    (summary, item) => {
      summary[item.action] += 1;
      return summary;
    },
    { create_and_link: 0, link_existing: 0, no_op: 0 },
  );
}

async function acquireLock(connection, poolId) {
  const lockName = `jshsus:cognito:${poolId}`;
  const [rows] = await connection.execute('SELECT GET_LOCK(?, ?) AS acquired', [
    lockName,
    LOCK_TIMEOUT_SECONDS,
  ]);
  if (Number(rows[0]?.acquired) !== 1) {
    throw new Error('Another Cognito provisioning process holds the advisory lock.');
  }
  return lockName;
}

async function main(argv = process.argv.slice(2), environment = process.env) {
  const options = parseArgs(argv);
  if (options.help) {
    printHelp();
    return;
  }
  const config = readConfig(environment, options);
  const connection = await mysql.createConnection(
    seedConnectionOptions(config.databaseUrl, environment),
  );
  const client = new CognitoIdentityProviderClient({ region: config.region });
  let lockName;

  try {
    lockName = await acquireLock(connection, config.poolId);
    const description = await sendWithRetry(
      client,
      () => new DescribeUserPoolCommand({ UserPoolId: config.poolId }),
    );
    validatePoolSupportsStudentNumberLogin(description.UserPool);

    if (options.ensureTestAccount) {
      await ensureStagingTestAccount(connection);
    }

    const { candidates, source } = await loadCandidates(connection, options);
    const plan = [];
    for (const candidate of candidates) {
      try {
        plan.push(await inspectCandidate(connection, client, config.poolId, candidate));
      } catch (error) {
        throw new Error(
          `Preflight failed for student ${candidate.studentNo}: ${safeErrorSummary(error)}`,
          { cause: error },
        );
      }
    }

    const summary = summarizePlan(plan);
    console.log(`Mode: ${options.apply ? 'APPLY' : 'DRY RUN'}`);
    console.log(`Candidate source: ${source}`);
    console.log(`Candidates: ${candidates.length}`);
    console.log(`Create and link: ${summary.create_and_link}`);
    console.log(`Link existing: ${summary.link_existing}`);
    console.log(`Already complete: ${summary.no_op}`);

    if (!options.apply) {
      console.log('No AWS or database changes were made.');
      return;
    }

    let applied = 0;
    for (const item of plan) {
      if (item.action === 'no_op') continue;
      try {
        await applyPlan(connection, client, config.poolId, item, config.temporaryPassword);
        applied += 1;
      } catch (error) {
        throw new Error(
          `Apply stopped at student ${item.candidate.studentNo} (${safeErrorSummary(error)}). ` +
            'The command is safe to run again after the cause is resolved.',
          { cause: error },
        );
      }
    }
    console.log(`Applied: ${applied}`);
    console.log('Temporary passwords were not printed or persisted.');
  } finally {
    if (lockName) {
      try {
        await connection.execute('SELECT RELEASE_LOCK(?)', [lockName]);
      } catch {
        // Closing the connection releases the advisory lock as a fallback.
      }
    }
    client.destroy();
    await connection.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Cognito provisioning failed: ${safeErrorSummary(error)}`);
    process.exitCode = 1;
  });
}

module.exports = {
  ensureDatabaseLink,
  ensureStagingTestAccount,
  loadCandidates,
  main,
  normalizeCandidates,
  readConfig,
  validateLinks,
};
