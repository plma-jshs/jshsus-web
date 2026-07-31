function classifyMigrationTimeline(databaseTimeline, migrationTimeline) {
  const expected = migrationTimeline.map((entry) => entry.when);
  const isPrefix =
    databaseTimeline.length > 0 &&
    databaseTimeline.length <= expected.length &&
    databaseTimeline.every((value, index) => value === expected[index]);

  if (!isPrefix) return 'diverged';
  return databaseTimeline.length === expected.length ? 'current' : 'behind';
}

function isLoopbackDatabaseHost(hostname) {
  const normalized = String(hostname)
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === 'mysql' ||
    normalized === 'host.docker.internal'
  );
}

module.exports = {
  classifyMigrationTimeline,
  isLoopbackDatabaseHost,
};
