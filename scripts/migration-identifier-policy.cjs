const MYSQL_IDENTIFIER_MAX_LENGTH = 64;

/**
 * Mask comments and string literals while preserving backtick-quoted identifiers.
 * This keeps policy checks from treating migration data or comments as DDL.
 */
function maskSqlCommentsAndLiterals(sql) {
  let output = '';
  let state = 'normal';

  const masked = (character) => (character === '\n' || character === '\r' ? character : ' ');

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    const next = sql[index + 1];

    if (state === 'line-comment') {
      output += masked(character);
      if (character === '\n') state = 'normal';
      continue;
    }

    if (state === 'block-comment') {
      if (character === '*' && next === '/') {
        output += '  ';
        index += 1;
        state = 'normal';
      } else {
        output += masked(character);
      }
      continue;
    }

    if (state === 'single-quote' || state === 'double-quote') {
      const quote = state === 'single-quote' ? "'" : '"';
      if (character === '\\' && next !== undefined) {
        output += `${masked(character)}${masked(next)}`;
        index += 1;
      } else if (character === quote && next === quote) {
        output += '  ';
        index += 1;
      } else {
        output += masked(character);
        if (character === quote) state = 'normal';
      }
      continue;
    }

    if (state === 'backtick') {
      output += character;
      if (character === '`' && next === '`') {
        output += next;
        index += 1;
      } else if (character === '`') {
        state = 'normal';
      }
      continue;
    }

    if (character === '-' && next === '-') {
      output += '  ';
      index += 1;
      state = 'line-comment';
    } else if (character === '#') {
      output += ' ';
      state = 'line-comment';
    } else if (character === '/' && next === '*') {
      output += '  ';
      index += 1;
      state = 'block-comment';
    } else if (character === "'") {
      output += ' ';
      state = 'single-quote';
    } else if (character === '"') {
      output += ' ';
      state = 'double-quote';
    } else {
      output += character;
      if (character === '`') state = 'backtick';
    }
  }

  return output;
}

function findOverlongMysqlConstraintAndIndexIdentifiers(sql) {
  const sanitizedSql = maskSqlCommentsAndLiterals(sql);
  const identifierPattern = /\b(CONSTRAINT|INDEX|KEY)\s+`((?:``|[^`])+)`/giu;
  const violations = [];

  for (const match of sanitizedSql.matchAll(identifierPattern)) {
    const identifier = match[2].replace(/``/g, '`');
    const length = [...identifier].length;
    if (length <= MYSQL_IDENTIFIER_MAX_LENGTH) continue;

    violations.push({
      keyword: match[1].toUpperCase(),
      identifier,
      length,
      maxLength: MYSQL_IDENTIFIER_MAX_LENGTH,
    });
  }

  return violations;
}

module.exports = {
  MYSQL_IDENTIFIER_MAX_LENGTH,
  findOverlongMysqlConstraintAndIndexIdentifiers,
  maskSqlCommentsAndLiterals,
};
