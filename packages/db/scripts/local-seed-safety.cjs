const LOCAL_DATABASE_HOSTS = new Set(['mysql', 'localhost', '127.0.0.1', '::1', '[::1]']);
const LOCAL_DATABASE_NAMES = new Set(['jshsus', 'jshsus_dev', 'jshsus_test']);

function assertLocalSeedAllowed(environment = process.env) {
  if ((environment.NODE_ENV || '').toLowerCase() === 'production') {
    throw new Error('Refusing to modify the local test account while NODE_ENV=production.');
  }

  if (environment.ALLOW_LOCAL_SEED !== 'true') {
    throw new Error('Set ALLOW_LOCAL_SEED=true explicitly to modify the local test account.');
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
    throw new Error(
      `Refusing to modify the local test account on non-local database host: ${url.hostname}`,
    );
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  if (!LOCAL_DATABASE_NAMES.has(databaseName)) {
    throw new Error(`Refusing to modify non-local database name: ${databaseName || '(empty)'}`);
  }

  return databaseUrl;
}

module.exports = { assertLocalSeedAllowed };
