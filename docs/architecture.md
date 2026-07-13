# Architecture

이 문서는 현재 코드의 기준 구조와 기능을 추가할 때 지켜야 할 경계를 설명한다.

## Workspace boundaries

```text
apps/web        학생용 React SPA
apps/admin      관리자용 React SPA
apps/api        NestJS HTTP API와 도메인 정책
packages/db     Drizzle schema, migration, legacy import
packages/types  API 응답과 화면 모델의 공유 TypeScript 타입
packages/ui     두 React 앱이 공유하는 디자인 token과 작은 primitive
docs            설계 결정과 운영 문서
```

- 프런트엔드는 DB 패키지를 직접 참조하지 않고 HTTP API만 사용한다.
- API는 도메인별 controller/service/module로 나누며 DB 접근은 `DatabaseService`를 통한다.
- `packages/types`에는 데이터 접근이나 실행 코드를 넣지 않는다. 입력 검증은 API 경계에서 Zod로 수행한다.
- `packages/ui`에는 앱 고유 페이지 CSS를 넣지 않고 실제 공유되는 token과 primitive만 둔다.

## Web application boundaries

```text
apps/web/src/app          router와 앱 조립
apps/web/src/components  전역 layout과 공통 페이지 primitive
apps/web/src/features    기능별 page, component, API 계약
apps/web/src/shared      HTTP, 파일, 날짜 등 기능 비종속 유틸리티
apps/web/src/styles      base, shell, home, detail-pages, responsive 진입점
```

- 기능 코드는 다른 기능 폴더의 내부 파일을 직접 참조하지 않는다. 공용화가 필요하면 `shared` 또는 전역 component 경계를 사용한다.
- API 호출은 `shared/api/http.ts`를 기반으로 각 기능의 `api.ts`에서 공개한다.
- 페이지 route는 동적 import해 초기 번들에 모든 화면을 포함하지 않는다.
- 전환용 `components/legacy`와 `PortalUi`는 제거되었으며 새 레거시 계층을 만들지 않는다.
- Vite 개발 프록시는 기본적으로 `http://localhost:4000`을 사용하고 필요할 때만 `API_ORIGIN`으로 덮어쓴다.

관리자 앱도 같은 `app / features / shared / styles` 경계를 사용한다. `shared/api/adminApi.ts`는 기존 관리자 API를 보존하는 facade이며, 화면을 수정할 때 해당 기능의 `features/<domain>/api.ts`로 점진적으로 분리한다.

## API boundaries

```text
Browser -> Nginx (/api proxy) -> Nest controller -> guards -> domain service -> Drizzle -> MySQL
                                                        |             |
                                                        |             +-> audit log
                                                        +-> Redis session / CSRF
```

- 공지, 게시판, 신고, 분실물은 각 도메인 module이 소유한다. 범용 `content` module로 다시 합치지 않는다.
- 운영 이미지는 Vite preview가 아니라 Nginx 정적 서버를 사용한다.
- `/health`는 MySQL과 Redis 준비 상태, `/health/live`는 프로세스 생존 상태를 반환한다.

## Authorization

- 학생 본인 기능은 `student` 역할로 제한한다.
- 관리자 행위는 `content.manage`, `petitions.answer`, `activity.review`, `points.manage`, `dorm.manage`, `devices.manage`, `users.manage`, `iam.manage`, `audit.read` permission으로 제한한다.
- 역할은 permission 묶음이다. 사용자에게 직접 부여한 permission도 동일하게 동작해야 한다.
- 역할 또는 permission이 바뀌면 해당 사용자의 Redis 세션을 무효화한다.
- 상태 변경 요청은 세션, 권한, CSRF를 모두 통과해야 한다.

## Persistence rules

- DB 오류를 mock 데이터나 빈 배열로 대체하지 않는다.
- 저장과 상태 전이는 transaction과 필요한 row lock으로 보호한다.
- 중복 방지 규칙은 서비스 검사뿐 아니라 unique index로도 강제한다.
- 공개 조회는 visibility, hidden 상태, 게시 시각을 query에서 제한한다.
- 비공개 파일의 metadata와 download 모두 세션 및 콘텐츠 접근 권한을 확인한다.
- migration 수정 전 실제 생성 SQL을 검토하고 기존 테이블을 의도치 않게 제거하는 SQL을 허용하지 않는다.

### File cleanup outbox

- 외부 저장소 삭제는 MySQL transaction에 포함할 수 없으므로 `file_cleanup_jobs`를 durable outbox로 사용한다. 콘텐츠 삭제 시 파일 `object_key`, `file_id`, 대상 type/id를 부모 삭제 및 audit log와 같은 transaction에서 먼저 기록한다.
- `object_key` unique index와 저장소의 멱등 삭제(S3 `DeleteObject`, 로컬 `ENOENT` 허용)를 함께 사용한다. 삭제 성공 뒤에만 파일 row와 cleanup job을 한 transaction으로 제거한다.
- API 시작 시와 `FILE_CLEANUP_INTERVAL_MS` 간격으로 제한된 batch를 처리한다. 여러 API 인스턴스는 `FOR UPDATE SKIP LOCKED`와 만료 가능한 lease로 중복 claim을 막고, 실패 작업은 `attempts`, `next_attempt_at`, `last_error`에 지수 backoff 상태를 남긴다.
- 운영에서는 pending 수, 가장 오래된 `created_at`, 최대 `attempts`, 최근 `last_error`를 관찰한다. pending이 계속 증가하거나 lease timeout을 넘긴 `locked_at`이 반복되면 저장소 권한·네트워크와 worker 로그를 함께 확인한다. 파일 row만 수동 삭제하면 object reference를 잃으므로 금지한다.
- batch, 실행 간격, lease, 재시도 범위는 `.env.example`의 `FILE_CLEANUP_*` 값으로 조정하며, retry 최대 간격은 base보다 작게 설정할 수 없다.

## Adding a feature

1. DB 변경은 schema와 migration을 함께 추가하고 생성 SQL을 검토한다.
2. API 입력은 Zod로 검증하고 인증 방식과 permission을 명시한다.
3. 여러 행이나 저장 상태를 바꾸면 transaction과 동시성 조건을 먼저 설계한다.
4. 공유 응답 모델은 `packages/types`에 두고 양쪽 앱에서 타입을 복제하지 않는다.
5. 웹 기능은 `features/<domain>`에 page와 API를 함께 두고 route에서 동적 import한다.
6. API client와 formatter는 단위 테스트, 주요 사용자 흐름은 smoke test로 검증한다.
7. `typecheck`, `lint`, `test`, `format:check`, `build`, production audit와 Compose config 검사를 통과시킨다.
