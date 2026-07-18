import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const requireCjs = createRequire(`${process.cwd()}/scripts/local-reset-policy.spec.ts`);
const { resolveLocalResetTarget } = requireCjs('./local-reset-policy.cjs') as {
  resolveLocalResetTarget: (input: {
    composeConfig: Record<string, unknown>;
    mysqlContainerInspect?: Record<string, unknown> | null;
    volumeInspect?: Record<string, unknown> | null;
  }) => { databaseName: string; projectName: string; volumeName: string };
};

function fixture() {
  const databaseUrl = 'mysql://jshs_web:password@mysql:3306/jshsus';
  return {
    composeConfig: {
      name: 'jshs_web',
      services: {
        mysql: {
          environment: { MYSQL_DATABASE: 'jshsus' },
          volumes: [{ type: 'volume', source: 'mysql-data', target: '/var/lib/mysql' }],
        },
        api: { environment: { DATABASE_URL: databaseUrl } },
        bootstrap: { environment: { DATABASE_URL: databaseUrl } },
        migrate: { environment: { DATABASE_URL: databaseUrl } },
      },
      volumes: { 'mysql-data': { name: 'jshs_web_mysql-data-v2' } },
    },
    mysqlContainerInspect: {
      Mounts: [
        {
          Type: 'volume',
          Name: 'jshs_web_mysql-data-v2',
          Destination: '/var/lib/mysql',
        },
      ],
    },
    volumeInspect: {
      Name: 'jshs_web_mysql-data-v2',
      Labels: {
        'com.docker.compose.project': 'jshs_web',
        'com.docker.compose.volume': 'mysql-data',
      },
    },
  };
}

describe('local database reset preflight', () => {
  it('returns only the verified local mysql target', () => {
    expect(resolveLocalResetTarget(fixture())).toEqual({
      databaseName: 'jshsus',
      projectName: 'jshs_web',
      volumeName: 'jshs_web_mysql-data-v2',
    });
  });

  it('rejects a remote COMPOSE_DATABASE_URL after Compose resolves it', () => {
    const input = fixture();
    input.composeConfig.services.bootstrap.environment.DATABASE_URL =
      'mysql://root:password@iam.jshsus.kr:3306/jshsus_v26';
    expect(() => resolveLocalResetTarget(input)).toThrow('check COMPOSE_DATABASE_URL');
  });

  it('rejects a remote API target even if bootstrap is local', () => {
    const input = fixture();
    input.composeConfig.services.api.environment.DATABASE_URL =
      'mysql://root:password@iam.jshsus.kr:3306/jshsus_v26';
    expect(() => resolveLocalResetTarget(input)).toThrow('api DATABASE_URL');
  });

  it('rejects a non-local MYSQL_DATABASE', () => {
    const input = fixture();
    input.composeConfig.services.mysql.environment.MYSQL_DATABASE = 'jshsus_v26';
    expect(() => resolveLocalResetTarget(input)).toThrow('MYSQL_DATABASE must be jshsus');
  });

  it('rejects an active container mounted from a different volume', () => {
    const input = fixture();
    input.mysqlContainerInspect.Mounts[0].Name = 'unrelated_mysql_data';
    expect(() => resolveLocalResetTarget(input)).toThrow('active mysql container');
  });

  it('rejects a volume not owned by this Compose project', () => {
    const input = fixture();
    input.volumeInspect.Labels['com.docker.compose.project'] = 'another_project';
    expect(() => resolveLocalResetTarget(input)).toThrow('not owned');
  });
});
