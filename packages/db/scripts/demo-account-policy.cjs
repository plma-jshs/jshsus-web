const DEFAULT_TEST_USERNAME = '9999';
const DEFAULT_TEST_PASSWORD = 'Hello00!';
const DEFAULT_TEST_STUDENT_NO = 9999;

const KNOWN_DEMO_ACCOUNT_IDS = new Set(['9999', 'test', 'test.student']);
const KNOWN_DEMO_NAMES = new Set(['테스트', '테스트 학생', '김성찬']);

function normalizeAccountIds(accountIds) {
  if (!Array.isArray(accountIds)) return [];
  return accountIds.filter((accountId) => typeof accountId === 'string');
}

/**
 * Existing rows may only be claimed by the local fixture when both their
 * profile and local-login identity match a previously shipped demo account.
 * A student number alone is never enough evidence because it can belong to a
 * real student in a copied database.
 */
function isKnownDemoProfile(profile, requestedUsername = DEFAULT_TEST_USERNAME) {
  if (!profile || !KNOWN_DEMO_NAMES.has(profile.name)) return false;

  const allowedAccountIds = new Set(KNOWN_DEMO_ACCOUNT_IDS);
  allowedAccountIds.add(requestedUsername);

  return normalizeAccountIds(profile.localAccountIds).some((accountId) =>
    allowedAccountIds.has(accountId),
  );
}

function isKnownLegacyDemoProfile(profile) {
  if (!profile || Number(profile.studentNo) !== 29999) return false;
  if (!KNOWN_DEMO_NAMES.has(profile.name)) return false;

  return normalizeAccountIds(profile.localAccountIds).some((accountId) =>
    KNOWN_DEMO_ACCOUNT_IDS.has(accountId),
  );
}

module.exports = {
  DEFAULT_TEST_PASSWORD,
  DEFAULT_TEST_STUDENT_NO,
  DEFAULT_TEST_USERNAME,
  isKnownDemoProfile,
  isKnownLegacyDemoProfile,
};
