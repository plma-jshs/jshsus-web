const { randomInt } = require('node:crypto');

const TEST_STUDENT_NO = 9999;

function parseArgs(argv) {
  const options = {
    apply: false,
    confirmPoolId: null,
    ensureTestAccount: false,
    includeTestAccount: false,
    studentNo: null,
    temporaryPasswordEnv: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--apply') {
      options.apply = true;
      continue;
    }
    if (argument === '--include-test-account') {
      options.includeTestAccount = true;
      continue;
    }
    if (argument === '--ensure-test-account') {
      options.ensureTestAccount = true;
      continue;
    }
    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }

    const [name, inlineValue] = argument.split('=', 2);
    if (
      name === '--confirm-pool-id' ||
      name === '--student-no' ||
      name === '--temporary-password-env'
    ) {
      const value = inlineValue ?? argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${name} requires a value.`);
      }
      if (inlineValue == null) index += 1;

      if (name === '--confirm-pool-id') {
        options.confirmPoolId = value;
      } else if (name === '--temporary-password-env') {
        if (!/^[A-Z_][A-Z0-9_]*$/.test(value)) {
          throw new Error('--temporary-password-env must name an uppercase environment variable.');
        }
        options.temporaryPasswordEnv = value;
      } else {
        const studentNo = Number(value);
        if (!Number.isSafeInteger(studentNo) || studentNo <= 0) {
          throw new Error('--student-no must be a positive integer.');
        }
        options.studentNo = studentNo;
      }
      continue;
    }

    throw new Error(`Unknown option: ${argument}`);
  }

  if (options.studentNo === TEST_STUDENT_NO && !options.includeTestAccount) {
    throw new Error('Student 9999 is a test account; add --include-test-account explicitly.');
  }

  if (
    options.ensureTestAccount &&
    (!options.apply || options.studentNo !== TEST_STUDENT_NO || !options.includeTestAccount)
  ) {
    throw new Error(
      '--ensure-test-account requires --apply --student-no 9999 --include-test-account.',
    );
  }

  return options;
}

function canonicalUsername(studentNo) {
  if (!Number.isSafeInteger(studentNo) || studentNo <= 0) {
    throw new Error('studentNo must be a positive integer.');
  }
  return String(studentNo);
}

function secureShuffle(values) {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = randomInt(index + 1);
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

function randomCharacter(alphabet) {
  return alphabet[randomInt(alphabet.length)];
}

function generateTemporaryPassword(length = 24) {
  if (!Number.isSafeInteger(length) || length < 16) {
    throw new Error('Temporary passwords must contain at least 16 characters.');
  }

  const groups = [
    'ABCDEFGHJKLMNPQRSTUVWXYZ',
    'abcdefghijkmnopqrstuvwxyz',
    '23456789',
    '!@#$%^&*_-+=',
  ];
  const all = groups.join('');
  const characters = groups.map(randomCharacter);
  while (characters.length < length) characters.push(randomCharacter(all));
  return secureShuffle(characters).join('');
}

function validateTemporaryPassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('The temporary password must contain at least 8 characters.');
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error(
      'The temporary password must include uppercase, lowercase, and numeric characters.',
    );
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    throw new Error('The temporary password must include a symbol.');
  }
  return password;
}

function attributesToMap(attributes = []) {
  return new Map(attributes.filter((item) => item?.Name).map((item) => [item.Name, item.Value]));
}

function validateCognitoUser(user, candidate) {
  if (!user?.Username) throw new Error(`Cognito user ${candidate.username} has no username.`);
  if (user.Username !== candidate.username) {
    throw new Error(`Cognito username conflict for student ${candidate.studentNo}.`);
  }

  const attributes = attributesToMap(user.UserAttributes);
  const subject = attributes.get('sub');
  if (!subject) throw new Error(`Cognito user ${candidate.username} has no sub attribute.`);
  if (
    attributes.has('preferred_username') &&
    attributes.get('preferred_username') !== String(candidate.studentNo)
  ) {
    throw new Error(`Cognito preferred_username conflict for student ${candidate.studentNo}.`);
  }
  return subject;
}

function validatePoolSupportsStudentNumberLogin(pool) {
  const aliases = pool?.AliasAttributes ?? [];
  const usernameAttributes = pool?.UsernameAttributes ?? [];
  const supportsPlainUsername = usernameAttributes.length === 0;
  if (!supportsPlainUsername && !aliases.includes('preferred_username')) {
    throw new Error(
      'The user pool must support plain username sign-in or preferred_username aliases before provisioning.',
    );
  }
}

function safeErrorName(error) {
  if (error && typeof error === 'object' && typeof error.name === 'string') return error.name;
  return 'UnknownError';
}

function safeErrorSummary(error) {
  if (
    error instanceof Error &&
    error.name === 'Error' &&
    !('code' in error) &&
    !('$metadata' in error)
  ) {
    return error.message;
  }
  return safeErrorName(error);
}

module.exports = {
  TEST_STUDENT_NO,
  attributesToMap,
  canonicalUsername,
  generateTemporaryPassword,
  parseArgs,
  safeErrorName,
  safeErrorSummary,
  validateCognitoUser,
  validatePoolSupportsStudentNumberLogin,
  validateTemporaryPassword,
};
