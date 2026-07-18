const DEFAULT_TEST_USERNAME = '9999';
const DEFAULT_TEST_PASSWORD = 'Hello00!';
const DEFAULT_TEST_STUDENT_NO = 9999;

const KNOWN_TEST_ACCOUNT_IDS = new Set(['9999']);
const KNOWN_TEST_NAMES = new Set(['테스트']);

function normalizeAccountIds(accountIds) {
  if (!Array.isArray(accountIds)) return [];
  return accountIds.filter((accountId) => typeof accountId === 'string');
}

/**
 * Existing rows may only be claimed by the local fixture when both their
 * profile and local-login identity match the local test account.
 * A student number alone is never enough evidence because it can belong to a
 * real student in a copied database.
 */
function isKnownTestProfile(profile, requestedUsername = DEFAULT_TEST_USERNAME) {
  if (!profile || Number(profile.studentNo) !== DEFAULT_TEST_STUDENT_NO) return false;
  if (!KNOWN_TEST_NAMES.has(profile.name)) return false;

  const allowedAccountIds = new Set(KNOWN_TEST_ACCOUNT_IDS);
  allowedAccountIds.add(requestedUsername);

  return normalizeAccountIds(profile.localAccountIds).some((accountId) =>
    allowedAccountIds.has(accountId),
  );
}

module.exports = {
  DEFAULT_TEST_PASSWORD,
  DEFAULT_TEST_STUDENT_NO,
  DEFAULT_TEST_USERNAME,
  isKnownTestProfile,
};
