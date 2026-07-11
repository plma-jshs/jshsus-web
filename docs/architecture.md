# Architecture

이 문서는 현재 코드의 기준 구조와 기능 추가 시 지켜야 할 경계를 설명한다. 초기 개발 계획 문서는 조사 기록으로 남기고, 실제 구현 판단은 이 문서를 우선한다.

## Workspace boundaries

```text
apps/web        학생용 React SPA
apps/admin      관리자용 React SPA
apps/api        NestJS HTTP API와 도메인 정책
packages/db     Drizzle schema, migration, legacy import
packages/types  API 응답과 화면 모델의 공유 TypeScript 타입
docs            설계 결정과 조사 기록
```

- 웹 앱은 DB 패키지를 직접 참조하지 않고 HTTP API만 사용한다.
- API 모듈은 도메인별 controller/service로 나누며 DB 접근은 `DatabaseService`를 통해 수행한다.
- `packages/types`에는 실행 코드나 데이터 접근 코드를 넣지 않는다. 입력 검증은 데이터를 신뢰하는 API 경계에서 Zod로 수행한다.
- 새로운 공용 UI 패키지는 실제로 두 앱에서 재사용할 컴포넌트가 생기기 전에는 만들지 않는다.

## Request and data flow

```text
Browser -> Nginx (/api proxy) -> Nest controller -> guards -> domain service -> Drizzle -> MySQL
                                                        |             |
                                                        |             +-> audit log
                                                        +-> Redis session / CSRF
```

운영 웹 이미지는 Vite preview 서버가 아니라 Nginx 정적 서버를 사용한다. API의 `/health`는 MySQL과 Redis 준비 상태를, `/health/live`는 프로세스 생존 상태를 나타낸다.

## Authorization

- 학생 본인 기능은 역할(`student`)로 제한한다.
- 관리자 행위는 `content.manage`, `petitions.answer`, `activity.review`, `points.manage`, `dorm.manage`, `devices.manage`, `users.manage`, `iam.manage`, `audit.read` permission으로 제한한다.
- 역할은 permission 묶음이다. 사용자에게 직접 부여한 permission도 동일하게 동작해야 한다.
- 역할이나 역할 permission이 변경되면 해당 사용자의 Redis 세션을 무효화한다.
- 상태 변경 요청은 세션, permission/role, CSRF를 모두 통과해야 한다.

## Persistence rules

- DB 오류를 mock 데이터나 빈 배열로 대체하지 않는다.
- 원장과 상태 전이는 트랜잭션 및 row lock으로 보호한다.
- 중복을 막는 규칙은 서비스 검사만 두지 않고 unique index로도 강제한다.
- 공개 조회는 visibility, hidden 상태, 게시 시각을 쿼리에서 제한한다.
- 비공개 파일은 메타데이터와 다운로드 모두 세션 및 대상 콘텐츠 접근권한을 확인한다.
- migration은 수정 전에 실제 생성 SQL을 검토하고, 기존 테이블을 의도치 않게 삭제하는 SQL을 허용하지 않는다.

## Deliberate exclusions

- 장치 게이트웨이가 없는 보관함 명령/예약 생성 기능은 제공하지 않는다. 현재는 상태와 기존 명령 이력만 조회한다.
- SMTP, 알림톡, 리포트 등 사용되지 않는 외부 연동은 placeholder service를 두지 않는다. 실제 요구와 계약이 확정될 때 별도 adapter로 추가한다.
- 운영 실패 시 샘플 데이터로 보이는 fallback은 두지 않는다.

## Adding a feature

1. DB 변경이 필요하면 schema와 migration을 함께 추가하고 생성 SQL을 검토한다.
2. API 입력은 Zod로 검증하고, 인증 방식과 permission을 명시한다.
3. 여러 행이나 원장 상태를 바꾸면 트랜잭션과 동시성 조건을 먼저 설계한다.
4. 공유 응답 모델은 `packages/types`에 두고 양쪽 앱의 임의 타입 복제를 피한다.
5. 서비스 정책은 단위 테스트, 주요 사용자 흐름은 smoke test로 검증한다.
6. `typecheck`, `lint`, `test`, `format:check`, `build`, `audit --prod`, Compose config 검사를 통과시킨다.
