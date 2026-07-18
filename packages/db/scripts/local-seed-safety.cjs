const LOCAL_DATABASE_HOSTS = new Set(['mysql', 'localhost', '127.0.0.1', '::1', '[::1]']);
const LOCAL_DATABASE_NAMES = new Set(['jshsus', 'jshsus_dev', 'jshsus_test']);

function assertLocalSeedAllowed(environment = process.env) {
  if ((environment.NODE_ENV || '').toLowerCase() === 'production') {
    throw new Error('Refusing to modify local demo data while NODE_ENV=production.');
  }

  if (environment.ALLOW_LOCAL_SEED !== 'true') {
    throw new Error('Set ALLOW_LOCAL_SEED=true explicitly to modify local demo data.');
  }

  const databaseUrl = environment.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');

  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid MySQL URL.');
  }
  if (url.protocol !== 'mysql:') {
    throw new Error('DATABASE_URL must use the mysql protocol.');
  }

  const hostname = url.hostname.toLowerCase();
  if (!LOCAL_DATABASE_HOSTS.has(hostname)) {
    throw new Error(`Refusing to modify demo data on non-local database host: ${url.hostname}`);
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  if (!LOCAL_DATABASE_NAMES.has(databaseName)) {
    throw new Error(`Refusing to modify non-local database name: ${databaseName || '(empty)'}`);
  }

  return databaseUrl;
}

function assertStagingSeedAllowed(environment = process.env) {
  if ((environment.NODE_ENV || '').toLowerCase() !== 'production') {
    throw new Error('Staging demo data requires NODE_ENV=production.');
  }

  if (environment.DEPLOYMENT_TIER !== 'staging') {
    throw new Error('Staging demo data requires DEPLOYMENT_TIER=staging.');
  }

  if (environment.ALLOW_STAGING_DEMO_SEED !== 'true') {
    throw new Error('Set ALLOW_STAGING_DEMO_SEED=true explicitly to modify staging demo data.');
  }

  const databaseUrl = environment.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');

  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid MySQL URL.');
  }
  if (url.protocol !== 'mysql:') {
    throw new Error('DATABASE_URL must use the mysql protocol.');
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  const confirmedDatabaseName = environment.DEMO_SEED_DATABASE_NAME;
  if (!confirmedDatabaseName || confirmedDatabaseName !== databaseName) {
    throw new Error('DEMO_SEED_DATABASE_NAME must exactly match the staging database name.');
  }

  const password = environment.TEST_USER_PASSWORD || '';
  if (password.length < 12 || password === 'Test1234!') {
    throw new Error(
      'Staging TEST_USER_PASSWORD must be a non-default value of at least 12 characters.',
    );
  }

  return databaseUrl;
}

function assertDemoSeedAllowed(environment = process.env) {
  return environment.ALLOW_STAGING_DEMO_SEED === 'true'
    ? assertStagingSeedAllowed(environment)
    : assertLocalSeedAllowed(environment);
}

module.exports = { assertDemoSeedAllowed, assertLocalSeedAllowed, assertStagingSeedAllowed };
