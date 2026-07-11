# JSHSUS Renewal

NestJS, React, MySQL, Drizzle ORM, TanStack, Docker 기반 과구리 리뉴얼 프로젝트입니다.

Node.js 24와 pnpm 10을 기준으로 합니다. `.nvmrc` 또는 `.node-version`을 사용해 런타임을 맞춰주세요.

## 시작하기

```bash
pnpm install
cp .env.example .env
docker compose up -d mysql redis
docker compose --profile tools run --rm migrate
pnpm dev
```

- Web: `http://localhost:5173`
- Admin: `http://localhost:5174`
- API: `http://localhost:4000/api/health`

## 구조

```txt
apps/api      NestJS API
apps/web      React + Vite + TanStack student portal
apps/admin    React + Vite + TanStack admin portal
packages/db   Drizzle MySQL schema
packages/types shared API types
docs          planning docs
```

구조와 기능 추가 규칙은 [`docs/architecture.md`](docs/architecture.md)를 기준으로 합니다.

API는 도메인별 Nest 모듈로 나뉘며, DB 오류를 mock 데이터로 대체하지 않습니다. 관리자 권한은 역할과 세부 permission을 분리해서 검사하고, 상벌점·청원·탐활서의 상태 변경은 트랜잭션으로 처리합니다.

## 품질 검사

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm format:check
pnpm build
pnpm audit --prod
```

## 보안 메모

secret과 비밀번호는 코드와 Compose 파일에 하드코딩하지 않습니다. 운영값은 서버 환경변수나 Secret Manager에서 주입합니다. 레거시 SHA-512 비밀번호는 로그인 성공 시 Argon2id로 자동 교체됩니다.

## 레거시 데이터 가져오기

실제 dump 파일은 repo에 커밋하지 않습니다. 로컬/스테이징 DB에 schema를 적용한 뒤 명시적으로 import합니다.

```bash
MYSQL_PORT=3307 docker compose up -d mysql
DATABASE_URL=mysql://jshs_web:local_mysql_password@localhost:3307/jshsus pnpm db:migrate
DATABASE_URL=mysql://jshs_web:local_mysql_password@localhost:3307/jshsus pnpm db:legacy:import -- --dump /path/to/IAM.JSHS-dump.sql --yes
```

`--yes`를 빼면 dump 행 수만 확인하는 dry-run으로 동작합니다.

## 핵심 도메인 Smoke Test

API 서버를 실행한 상태에서 상벌점, 보관함, 기숙사, 탐활서, 청원, 내 상태 조회를 한 번에 검증합니다.
테스트는 임시 데이터를 만들고 종료 시 정리합니다.

```bash
API_PORT=4010 \
DATABASE_URL=mysql://jshs_web:local_mysql_password@localhost:3307/jshsus \
REDIS_URL=redis://:local_redis_password@localhost:6379/0 \
pnpm dev:api

API_BASE_URL=http://localhost:4010/api \
DATABASE_URL=mysql://jshs_web:local_mysql_password@localhost:3307/jshsus \
REDIS_URL=redis://:local_redis_password@localhost:6379/0 \
LEGACY_SYSTEM_ADMIN_STUIDS=9988 \
pnpm smoke:core
```

성공 시 `core-smoke=ok`와 각 도메인별 `...=ok`가 출력됩니다.

## 운영 배포

운영에서는 `docker-compose.prod.yml`을 함께 사용합니다. 프론트엔드는 Nginx가 정적 파일과 `/api` 프록시를 제공하며, 마이그레이션이 성공한 뒤 API와 프론트 컨테이너를 갱신합니다.

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d redis
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile tools run --rm migrate
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build api web admin
```

운영에서 외부 MySQL을 사용할 때는 서버의 `.env`에 `DATABASE_URL`을 설정합니다. Compose는 이 값을 우선하며, 저장소의 `.env` 파일은 배포 동기화 대상에서 제외되므로 서버에 최초 1회 별도로 배치해야 합니다.
