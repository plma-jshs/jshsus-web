const LOCAL_DATABASE_HOST = 'mysql';
const LOCAL_DATABASE_NAME = 'jshsus';
const MYSQL_DATA_TARGET = '/var/lib/mysql';
const MYSQL_VOLUME_KEY = 'mysql-data';

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} is missing from the resolved Docker Compose configuration.`);
  }
  return value;
}

function assertLocalDatabaseUrl(serviceName, databaseUrl) {
  if (typeof databaseUrl !== 'string' || databaseUrl.length === 0) {
    throw new Error(`${serviceName} DATABASE_URL is missing.`);
  }

  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error(`${serviceName} DATABASE_URL is not a valid URL.`);
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  if (
    parsed.protocol !== 'mysql:' ||
    parsed.hostname !== LOCAL_DATABASE_HOST ||
    Number(parsed.port || 3306) !== 3306 ||
    databaseName !== LOCAL_DATABASE_NAME
  ) {
    throw new Error(
      `${serviceName} DATABASE_URL must resolve to mysql:3306/${LOCAL_DATABASE_NAME}. ` +
        'Refusing to continue; check COMPOSE_DATABASE_URL.',
    );
  }
}

function resolveLocalResetTarget({ composeConfig, mysqlContainerInspect, volumeInspect }) {
  const config = requireObject(composeConfig, 'Compose config');
  const services = requireObject(config.services, 'Compose services');
  const mysqlService = requireObject(services.mysql, 'mysql service');
  const mysqlEnvironment = requireObject(mysqlService.environment, 'mysql environment');

  if (mysqlEnvironment.MYSQL_DATABASE !== LOCAL_DATABASE_NAME) {
    throw new Error(
      `MYSQL_DATABASE must be ${LOCAL_DATABASE_NAME}; received ` +
        `${mysqlEnvironment.MYSQL_DATABASE || '(empty)'}.`,
    );
  }

  for (const serviceName of ['api', 'bootstrap', 'migrate']) {
    const service = requireObject(services[serviceName], `${serviceName} service`);
    const environment = requireObject(service.environment, `${serviceName} environment`);
    assertLocalDatabaseUrl(serviceName, environment.DATABASE_URL);
  }

  const mysqlMount = Array.isArray(mysqlService.volumes)
    ? mysqlService.volumes.find((mount) => mount?.target === MYSQL_DATA_TARGET)
    : null;
  if (!mysqlMount || mysqlMount.type !== 'volume' || mysqlMount.source !== MYSQL_VOLUME_KEY) {
    throw new Error(`mysql ${MYSQL_DATA_TARGET} must use the ${MYSQL_VOLUME_KEY} named volume.`);
  }

  const volumes = requireObject(config.volumes, 'Compose volumes');
  const mysqlVolume = requireObject(volumes[MYSQL_VOLUME_KEY], `${MYSQL_VOLUME_KEY} volume`);
  const volumeName = mysqlVolume.name;
  if (typeof volumeName !== 'string' || volumeName.length === 0) {
    throw new Error('Resolved mysql volume name is missing.');
  }

  const projectName = config.name;
  if (typeof projectName !== 'string' || projectName.length === 0) {
    throw new Error('Resolved Docker Compose project name is missing.');
  }

  if (mysqlContainerInspect) {
    const mounts = Array.isArray(mysqlContainerInspect.Mounts) ? mysqlContainerInspect.Mounts : [];
    const activeMount = mounts.find((mount) => mount?.Destination === MYSQL_DATA_TARGET);
    if (!activeMount || activeMount.Type !== 'volume' || activeMount.Name !== volumeName) {
      throw new Error(
        `The active mysql container is not mounted from the expected volume ${volumeName}.`,
      );
    }
  }

  if (volumeInspect) {
    if (volumeInspect.Name !== volumeName) {
      throw new Error('Docker volume inspection does not match the resolved mysql volume.');
    }
    const labels = volumeInspect.Labels || {};
    if (
      labels['com.docker.compose.project'] !== projectName ||
      labels['com.docker.compose.volume'] !== MYSQL_VOLUME_KEY
    ) {
      throw new Error(
        `Volume ${volumeName} is not owned by ${projectName}/${MYSQL_VOLUME_KEY}; refusing to remove it.`,
      );
    }
  }

  return {
    databaseName: LOCAL_DATABASE_NAME,
    projectName,
    volumeName,
  };
}

module.exports = {
  assertLocalDatabaseUrl,
  resolveLocalResetTarget,
};
