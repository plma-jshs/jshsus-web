const { spawnSync } = require('node:child_process');
const { resolveLocalResetTarget } = require('./local-reset-policy.cjs');

function runDocker(args, { capture = false, allowFailure = false } = {}) {
  const result = spawnSync('docker', args, {
    cwd: process.cwd(),
    encoding: capture ? 'utf8' : undefined,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });

  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    const detail = capture && result.stderr ? ` ${result.stderr.trim()}` : '';
    throw new Error(`docker ${args.join(' ')} failed.${detail}`);
  }
  return result;
}

function parseJsonOutput(result, label) {
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`Could not parse ${label} JSON output.`);
  }
}

function inspectOptionalVolume(volumeName) {
  const result = runDocker(['volume', 'inspect', volumeName], {
    allowFailure: true,
    capture: true,
  });
  if (result.status !== 0) return null;
  const inspected = parseJsonOutput(result, 'Docker volume inspection');
  return Array.isArray(inspected) ? inspected[0] : null;
}

function findMysqlContainer() {
  const result = runDocker(['compose', 'ps', '-a', '-q', 'mysql'], { capture: true });
  return result.stdout.trim().split(/\r?\n/).find(Boolean) || null;
}

function main() {
  // Parse the resolved configuration without printing it: it contains credentials.
  const composeResult = runDocker(['compose', '--profile', 'tools', 'config', '--format', 'json'], {
    capture: true,
  });
  const composeConfig = parseJsonOutput(composeResult, 'Docker Compose configuration');

  const mysqlContainerId = findMysqlContainer();
  let mysqlContainerInspect = null;
  if (mysqlContainerId) {
    const inspectResult = runDocker(['inspect', mysqlContainerId], { capture: true });
    const inspected = parseJsonOutput(inspectResult, 'mysql container inspection');
    mysqlContainerInspect = Array.isArray(inspected) ? inspected[0] : null;
  }

  const configuredVolumeName = composeConfig?.volumes?.['mysql-data']?.name;
  const volumeInspect =
    typeof configuredVolumeName === 'string' ? inspectOptionalVolume(configuredVolumeName) : null;
  const target = resolveLocalResetTarget({
    composeConfig,
    mysqlContainerInspect,
    volumeInspect,
  });

  console.log(
    `Local reset target verified: ${target.projectName}/${target.databaseName} ` +
      `(${target.volumeName})`,
  );
  if (process.argv.includes('--check')) {
    console.log('Preflight check completed; no containers or volumes were changed.');
    return;
  }

  runDocker(['compose', 'down', '--remove-orphans']);

  if (volumeInspect) {
    runDocker(['volume', 'rm', target.volumeName]);
  } else {
    console.log(`Volume ${target.volumeName} does not exist; nothing to remove.`);
  }

  // Do not pass --volumes: upload-data must survive a database reset.
  runDocker(['compose', 'up', '-d', '--build', '--wait']);
  console.log('Local database reset, migration, demo seed, and service startup completed.');
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
