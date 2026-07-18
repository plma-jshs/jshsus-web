const { readFileSync } = require('node:fs');

function seedConnectionOptions(databaseUrl, environment = process.env) {
  const sslMode = environment.DATABASE_SSL_MODE || 'disabled';
  if (sslMode === 'disabled') return databaseUrl;

  const ssl = { rejectUnauthorized: sslMode === 'verify_identity' };
  if (environment.DATABASE_SSL_CA_PATH) {
    ssl.ca = readFileSync(environment.DATABASE_SSL_CA_PATH, 'utf8');
  }

  return { uri: databaseUrl, ssl };
}

module.exports = { seedConnectionOptions };
