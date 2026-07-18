# JSHSUS Renewal

NestJS, React, MySQL, Drizzle ORM, TanStack, Docker 기반 과구리 리뉴얼 프로젝트입니다.

Node.js 24와 pnpm 10을 기준으로 합니다. `.nvmrc` 또는 `.node-version`을 사용해 런타임을 맞춰주세요.

## 시작하기

```bash
pnpm install
cp .env.example .env
docker compose up -d --build
```

- Web: `http://localhost:5173`
- Admin: `http://localhost:5174`
- API: `http://localhost:4000/api/health`

로컬 Compose는 DB 마이그레이션 뒤 테스트 계정과 공지사항·자유게시판·청원·상벌점·JBS·기상곡
데모 데이터를 멱등하게 생성하고 나서 API를 시작합니다. 로컬 시드는 로컬 호스트의
`jshsus`, `jshsus_dev`, `jshsus_test` DB에 대해 실행 시점에 명시적으로 허용해야만 작동합니다.
재실행하면 동일 제목의 로컬 데모 행을 현재 시점 기준으로 갱신합니다.

기존 로컬 DB를 비우고 현재 스키마와 데모 데이터로 완전히 다시 만들 때는 다음 명령을
사용합니다.

```bash
pnpm local:reset-db
```

이 명령은 Docker Compose가 해석한 API·부트스트랩·마이그레이션 DB 주소가 모두
`mysql:3306/jshsus`인지 확인하고, 실행 중인 MySQL 컨테이너의 볼륨과 Compose 소유권
라벨도 확인한 뒤 해당 MySQL 볼륨만 제거합니다. 이후 이미지를 다시 빌드하고 전체
마이그레이션과 데모 시드를 적용합니다. `upload-data`는 보존되며,
`COMPOSE_DATABASE_URL`이 원격 DB를 가리키면 삭제 전에 즉시 중단합니다.
`docker compose down -v`는 업로드 볼륨까지 삭제하므로 DB 초기화 용도로 사용하지 마세요.

수동으로 시드를 다시 적용할 때만 다음 명령을 사용합니다.

```bash
NODE_ENV=development ALLOW_LOCAL_SEED=true pnpm db:create-local-test-user
```

- 학번: `9999`
- 비밀번호: `Hello00!`
- 학생 정보: `9999 테스트` (9학년 9반 99번)

데모 계정에는 학생 화면과 관리자 화면을 모두 검증할 수 있도록 `student`와
`system_admin` 역할을 함께 부여합니다. 실제 운영 사용자에게는 이 조합을 사용하지 않습니다.

`TEST_USER_USERNAME`, `TEST_USER_PASSWORD`, `TEST_USER_STUDENT_NO`로 계정값을 바꾸면
데모 데이터 시드도 같은 `TEST_USER_USERNAME`의 작성자 계정을 사용합니다.

## 구조

```txt
apps/api      NestJS API
apps/web      React + Vite + TanStack student portal
apps/admin    React + Vite + TanStack admin portal
packages/db   Drizzle MySQL schema
packages/types shared API types
packages/ui   shared design tokens
docs          planning docs
```

구조와 기능 추가 규칙은 [`docs/architecture.md`](docs/architecture.md)를 기준으로 합니다.
JBS·기상곡·세특 바이트 계산기의 확정 정책은
[`docs/broadcast-tools-implementation-plan.md`](docs/broadcast-tools-implementation-plan.md)에 정리되어 있습니다.
관리자 화면의 정보 구조와 UI 구현 기준은
[`docs/admin-design-system.md`](docs/admin-design-system.md)를 따릅니다.

API는 도메인별 Nest 모듈로 나뉘며, DB 오류를 mock 데이터로 대체하지 않습니다. 관리자 권한은 역할과 세부 permission을 분리해서 검사하고, 상벌점·청원·탐활서의 상태 변경은 트랜잭션으로 처리합니다.

## 품질 검사

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm format:check
pnpm build
pnpm audit --prod
pnpm db:migrations:check
```

## 보안 메모

secret과 비밀번호는 코드와 Compose 파일에 하드코딩하지 않습니다. 운영값은 서버 환경변수나 Secret Manager에서 주입합니다. 레거시 SHA-512 비밀번호는 로그인 성공 시 Argon2id로 자동 교체됩니다.

## 레거시 데이터 가져오기

레거시 DB 전체 dump를 가져오는 명령은 제공하지 않습니다. 검토가 끝난 테이블과 컬럼만 허용 목록에 넣고, 빈 staging DB에서 원본/변환/제외 행 수와 FK 불변조건을 검증한 뒤 수동으로 한 번만 실행합니다. 배포와 데이터 이관은 서로 독립된 작업입니다.

실측 결과와 선별 기준은 [`docs/legacy-migration-plan.md`](docs/legacy-migration-plan.md)를 따릅니다. 이 계획에 맞춘 fail-closed ETL과 사용자 정책 확인이 끝나기 전에는 운영 데이터 이관을 실행하지 않습니다.

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

`main`에 push하면 GitHub Actions가 검증을 통과한 커밋으로 네 개의 `linux/amd64` GHCR 이미지를 만듭니다. 서버는 소스를 받거나 이미지를 빌드하지 않고, 커밋 SHA 이미지와 [`docker-compose.release.yml`](docker-compose.release.yml)만 사용합니다.

최초 공개 대상은 `v26.jshsus.kr`과 `admin-v26.jshsus.kr`입니다. 기존 `jshsus.kr` PHP 사이트와 기존 Nginx Proxy Manager 호스트는 유지합니다. 새 web/admin만 기존 `nginx-proxy-manager_default` 네트워크에 연결되고 API, Redis, MySQL 포트는 호스트에 공개하지 않습니다.

새 frontend는 Nginx Proxy Manager 네트워크의 전용 주소 `172.18.0.200`과 `172.18.0.201`을 사용합니다. 기존 proxy host를 reload하거나 기존 서비스의 backend 포트를 외부에 다시 공개하지 않습니다.

GitHub `production` Environment에는 다음 secret이 필요합니다.

- `DEPLOY_HOST`, `DEPLOY_PORT`, `DEPLOY_USER`, `DEPLOY_PATH`
- `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`
- `PRODUCTION_ENV_FILE`
- `NEIS_API_KEY` (NEIS 키만 독립적으로 교체할 수 있도록 별도 보관)
- `YOUTUBE_API_KEY` (필수, JBS와 기상곡의 영상 제목·길이·임베드 가능 여부 검증)

`PRODUCTION_ENV_FILE`에 중복 기록하지 않으며, 배포 시 임시 환경파일에만 병합된다.

배포는 DB 백업과 마이그레이션을 먼저 실행하고, Redis/API/web/admin을 순서대로 갱신해 내부 health check를 통과시킵니다. 환경파일과 Compose manifest도 릴리스별로 보관하므로 이미지뿐 아니라 직전 실행 설정까지 함께 되돌릴 수 있습니다. 공개 smoke test가 실패해도 직전 릴리스로 자동 복구합니다. DB 마이그레이션은 자동으로 되돌리지 않으므로 항상 이전 이미지와 호환되는 expand/contract 방식으로 작성합니다.

DB 백업은 테이블을 스트리밍해 gzip과 SHA-256 checksum을 생성하며 최근 14개를 서버에 보관합니다. GitHub Container Registry 이미지는 안정적인 tag-aware 정리 작업을 도입하기 전까지 자동 삭제하지 않고, 배포 서버에는 현재와 직전 릴리스 이미지만 남깁니다.
