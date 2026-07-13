# JSHSUS Renewal Development Plan

작성일: 2026-06-21

## 1. 목표

기존 과구리/JSHSUS 학생 포털과 `points.jshsus.kr` 관리자 사이트를 NestJS, React, MySQL, Drizzle ORM, TanStack, Docker 기반 모노레포로 재구축한다. 기존 서비스의 핵심 흐름과 운영 secret/비밀번호 해시는 가능한 유지하되, 하드코딩된 비밀값, GET 기반 인증 처리, 레거시 콜백 토큰, 분산된 외부 서비스 연동을 정리해 운영 가능한 학교 포털로 전환한다.

이 문서는 첨부된 기존 Express 코드와 points dump에서 확인한 의존 요소와 환경변수 후보를 반영한 개발 착수 명세다. 실제 비밀값은 문서화하지 않으며, 운영값은 코드가 아니라 환경변수/Secret Manager로 주입한다.

## 2. 기존 코드에서 확인한 핵심 요소

### 2.1 런타임과 라이브러리

- Backend: Express, EJS, express-session, cookie-parser, cors, morgan
- Database: MySQL, express-mysql-session
- Session/Token Store: Redis, connect-redis
- Validation/Security: express-validator, crypto SHA-512 password hash
- External HTTP: request, axios
- Email: nodemailer with Gmail SMTP
- Report: jsreport online client
- Notification: Sendon Kakao AlimTalk API

### 2.2 외부 도메인과 서비스 연동

- `https://jshsus.kr`: 기존 과구리 메인/레거시 PHP 서비스
- `https://iam.jshsus.kr`: 통합 로그인
- `https://oauth.jshsus.kr`: OAuth 관련 도메인으로 추정
- `https://points.jshsus.kr`: 상벌점/휴대폰 시스템
- `https://plma.jshsus.kr`: PLMA 또는 상벌점 관련 신규 서비스
- `https://jshsus.jsreportonline.net`: jsreport 온라인 렌더링
- `https://api.sendon.io/v2/messages/kakao/alim-talk`: 알림톡 발송
- `https://najuredhawk.com`: 나주 레드호크 연동
- `https://jshsusclub.netlify.app`: 신규/클럽 서비스 연동 흔적

### 2.3 기존 인증 흐름

- 로그인 성공 시 Redis에 `iam_token:{token}` 형식으로 SSO 토큰 데이터를 저장한다.
- 토큰 TTL은 24시간이다.
- 쿠키 이름은 `iam_token`이며, 운영 도메인은 `.jshsus.kr` 범위를 사용한다.
- `/check-session`은 `Authorization: Bearer {token}` 또는 `iam_token` 쿠키로 로그인 상태를 확인한다.
- Redis 토큰 payload에는 `iamId`, `permissions`, `expiresAt`이 들어간다.
- 로그인 시 사용자 권한은 `iam_user_permissions`, `iam_permissions`에서 조회한다.
- 기본 권한으로 `viewMyPointsView`, `viewMyDormView`, `viewMyDormRepair`, `viewRemoteSongsView`, `viewRemoteSongsRequest`가 추가된다.

### 2.4 기존 DB 테이블 후보

- `iam`: 통합 로그인 사용자, 학번, 이름, 학년/반/번호, 비밀번호 해시, 이메일, 성별, 서비스별 식별자
- `user`: 기존 과구리 사용자 테이블
- `iam_permissions`: 권한 정의
- `iam_user_permissions`: 사용자별 권한 매핑
- `verify`: 가입 인증 코드
- `pass_code`: 비밀번호 변경 이메일 인증 코드와 요청 횟수
- `dorm_ban`: 기숙사/생활 관련 제한 또는 신청 상태
- `teacher`: 교사 계정으로 보이는 레거시 테이블
- `iam_sessions`: MySQL 세션 테이블 흔적, 현재는 Redis 세션 중심

### 2.5 기존 API/라우트 후보

- `GET /check-session`: SSO 토큰 검증
- `GET /login`: 통합 로그인 처리 및 서비스별 redirect
- `GET /add_account`: 계정 생성 및 기존 PHP 가입 API 호출
- `POST /submit_ban`: `dorm_ban` 등록/수정
- `GET /randomStr`: 랜덤 문자열 생성 도구
- `GET /email`: 비밀번호 변경 이메일 인증 코드 발송
- `GET /logout`: SSO 토큰 제거 및 쿠키 삭제
- `POST /checkphone`: 이름/학번/전화번호 확인 후 알림톡 인증 발송
- `POST /verify-code`: 알림톡 인증 코드 검증
- `POST /change-password`: 비밀번호 변경
- `GET /report`: jsreport 템플릿 렌더링
- `GET /passtest`: 비밀번호 해시 테스트. 신규 서비스에서는 제거해야 한다.

### 2.6 `points.jshsus.kr` 관리자 사이트에서 확인한 요소

`points.jshsus.kr`는 공개 랜딩에서는 로그인 화면만 보이며, 통합 로그인 `service=plma` 경유 후 관리자 메뉴가 로드된다. 로그인 후 화면은 AdminLTE 기반 관리자 UI이며, jQuery DataTables, Select2, daterangepicker, Bootstrap Dual Listbox, SweetAlert2, pdfmake, xlsx, SurveyJS, Pace 등을 사용한다. 신규 리뉴얼에서는 이 관리자 사이트를 학생 포털 `apps/web`에 섞지 않고 `apps/admin` 또는 `apps/points-admin`으로 분리한다.

확인된 관리자 메뉴:

- 상벌점 관리: 상벌점 현황, 상벌점 부여, 퇴사/표창 관리, 상벌점 기록, 사유 관리, 상벌점 복원
- 탐구활동 서비스: 기존 CMS 예약 관리, 통합예약 시스템 외부 링크
- 기숙사 시스템: 기숙사 현황, 기숙사 관리
- 스마트폰 보관함: 보관함 조작, 보관함 시간 설정
- 학교 관리: 전체 학생관리, 교직원 관리
- IAM 관리: 전체 계정관리, 접근권한 설정
- 시스템 운영: 감사 로그, 로그뷰어, 검사 및 보정, 시스템 관리
- 외부 링크: 과구리, 학교 홈페이지
- 전자투표/행사 운영: 전자투표 시스템 인증, 전자투표 서버 모니터링, 전자투표 클라이언트, 향림제 운영

관리자 화면에는 학생별 상벌점 등 민감한 개인정보가 포함되므로, 신규 시스템에서는 기능 조사와 개발 과정에서 개별 학생 데이터를 로그, fixture, 문서, 스크린샷에 남기지 않는다.

## 3. 비밀값과 환경변수 추출 결과

첨부 코드에는 DB 비밀번호, Redis 비밀번호, 세션 secret, jsreport 계정, Gmail 앱 비밀번호, Sendon Basic 인증값, 레거시 콜백 토큰, 외부 CMS 비밀번호가 평문으로 포함되어 있다. 신규 개발에서는 기존 운영값을 가능한 유지하되 코드에 남기지 않고 Secret Manager 또는 서버 환경변수로 이전한다. 변경이 필요하다고 판단되는 secret은 구현 전에 별도 확인한다.

### 3.1 필수 환경변수

| 영역          | 환경변수                         | 용도                                     | 비고                                   |
| ------------- | -------------------------------- | ---------------------------------------- | -------------------------------------- |
| App           | `NODE_ENV`                       | `development`, `test`, `production` 구분 | 필수                                   |
| App           | `TZ`                             | 서버 시간대                              | `Asia/Seoul`                           |
| App           | `API_PORT`                       | NestJS API 포트                          | 예: `4000`                             |
| App           | `WEB_PORT`                       | React 개발 서버 포트                     | 예: `5173`                             |
| App           | `APP_ORIGIN`                     | 프론트엔드 origin                        | 예: `https://jshsus.kr`                |
| App           | `API_ORIGIN`                     | API origin                               | 예: `https://api.jshsus.kr`            |
| App           | `CORS_ORIGINS`                   | 허용 origin 목록                         | 쉼표 구분                              |
| DB            | `DATABASE_URL`                   | 신규 MySQL 연결 문자열                   | Drizzle 사용                           |
| DB            | `DB_HOST`                        | 신규 MySQL host                          | `DATABASE_URL` 사용 시 선택            |
| DB            | `DB_PORT`                        | 신규 MySQL port                          | 기본 `3306`                            |
| DB            | `DB_USER`                        | 신규 MySQL user                          | 필수                                   |
| DB            | `DB_PASSWORD`                    | 신규 MySQL password                      | secret                                 |
| DB            | `DB_NAME`                        | 신규 MySQL database                      | 예: `jshsus`                           |
| Legacy DB     | `LEGACY_PLMA_DATABASE_URL`       | 기존 `plma` DB 마이그레이션/연동         | 단계적 제거                            |
| Legacy DB     | `LEGACY_JSHS_DATABASE_URL`       | 기존 `dbjshsus` DB 마이그레이션/연동     | 단계적 제거                            |
| Redis         | `REDIS_URL`                      | Redis 연결 문자열                        | 세션/토큰/캐시                         |
| Redis         | `REDIS_HOST`                     | Redis host                               | `REDIS_URL` 사용 시 선택               |
| Redis         | `REDIS_PORT`                     | Redis port                               | 기본 `6379`                            |
| Redis         | `REDIS_PASSWORD`                 | Redis password                           | 기존 운영값 주입                       |
| Session       | `SESSION_SECRET`                 | 세션 서명 secret                         | 기존 운영값 또는 동등 수준 secret 주입 |
| Session       | `SESSION_COOKIE_NAME`            | 세션 쿠키 이름                           | 예: `jshsus.sid`                       |
| Session       | `SESSION_COOKIE_DOMAIN`          | 쿠키 공유 도메인                         | 예: `.jshsus.kr`                       |
| Session       | `SESSION_COOKIE_SECURE`          | HTTPS only 여부                          | 운영 `true`                            |
| SSO           | `IAM_COOKIE_NAME`                | SSO 쿠키 이름                            | 기존 `iam_token`                       |
| SSO           | `IAM_TOKEN_TTL_SECONDS`          | SSO 토큰 만료 시간                       | 기존 86400                             |
| SSO           | `IAM_BASE_URL`                   | 통합 로그인 URL                          | `https://iam.jshsus.kr`                |
| SSO           | `OAUTH_BASE_URL`                 | OAuth URL                                | `https://oauth.jshsus.kr`              |
| SSO           | `SSO_ALLOWED_SERVICES`           | 허용 서비스 목록                         | open redirect 방지                     |
| SSO           | `LEGACY_CALLBACK_TOKEN`          | points/PHP 콜백 호환 토큰                | secret, 임시                           |
| SSO           | `POINTS_CALLBACK_URL`            | 상벌점 콜백 URL                          | HTTPS로 전환 필요                      |
| SSO           | `JSHSUS_LEGACY_CALLBACK_URL`     | 기존 PHP 로그인 콜백 URL                 | 마이그레이션용                         |
| SSO           | `PLMA_URL`                       | PLMA redirect URL                        | 마이그레이션용                         |
| Mail          | `SMTP_HOST`                      | SMTP host                                | 기존 Gmail                             |
| Mail          | `SMTP_PORT`                      | SMTP port                                | 기존 `587`                             |
| Mail          | `SMTP_USER`                      | SMTP 계정                                | secret                                 |
| Mail          | `SMTP_PASS`                      | SMTP 앱 비밀번호                         | 기존 운영값 주입                       |
| Mail          | `MAIL_FROM`                      | 발신자 주소                              | 학교 공식 계정 권장                    |
| Sendon        | `SENDON_API_BASE_URL`            | Sendon API URL                           | 알림톡                                 |
| Sendon        | `SENDON_BASIC_AUTH`              | Sendon Basic 인증값                      | 기존 운영값 주입                       |
| Sendon        | `SENDON_PROFILE_ID`              | 발신 프로필 ID                           | 기존 `jshs_plma`                       |
| Sendon        | `SENDON_TEMPLATE_PASSWORD_RESET` | 비밀번호 재설정 템플릿 ID                | secret 아님                            |
| Report        | `JSREPORT_URL`                   | jsreport 서버 URL                        | legacy report 호환                     |
| Report        | `JSREPORT_USER`                  | jsreport 계정                            | secret                                 |
| Report        | `JSREPORT_PASSWORD`              | jsreport 비밀번호                        | 기존 운영값 주입                       |
| Report        | `JSREPORT_TEMPLATE_PLMA_HISTORY` | PLMA legacy 템플릿명                     | 기존 `plma_history`                    |
| File          | `FILE_UPLOAD_MAX_MB`             | 업로드 제한                              | 예: `10`                               |
| File          | `FILE_ALLOWED_MIME_TYPES`        | 허용 MIME 목록                           | 이미지/PDF 등                          |
| Security      | `PASSWORD_HASH_MODE`             | `legacy-sha512`, `argon2id` 등           | 전환 전략용                            |
| Security      | `RATE_LIMIT_WINDOW_SECONDS`      | rate limit window                        | 인증/글쓰기                            |
| Security      | `RATE_LIMIT_MAX`                 | rate limit 횟수                          | 인증/글쓰기                            |
| Security      | `CSRF_SECRET`                    | CSRF 토큰 secret                         | 쿠키 인증 사용 시                      |
| Observability | `LOG_LEVEL`                      | 로그 레벨                                | 운영 `info`                            |
| Observability | `SENTRY_DSN`                     | 에러 수집                                | 선택                                   |

### 3.2 AWS/S3 환경변수

첨부 코드 안에서는 AWS 또는 S3 직접 사용 흔적이 확인되지 않았다. 다만 리뉴얼 서비스에는 분실물 사진, 게시판 첨부파일, 공지 첨부, 탐활서 출력/첨부 등 파일 업로드가 필요하므로 S3 호환 스토리지를 기준으로 환경변수를 미리 설계한다.

| 환경변수                       | 용도                             | 비고                        |
| ------------------------------ | -------------------------------- | --------------------------- |
| `AWS_REGION`                   | S3 region                        | 예: `ap-northeast-2`        |
| `AWS_ACCESS_KEY_ID`            | S3 access key                    | secret                      |
| `AWS_SECRET_ACCESS_KEY`        | S3 secret key                    | secret                      |
| `S3_BUCKET`                    | 업로드 버킷명                    | 운영/개발 분리              |
| `S3_PUBLIC_BASE_URL`           | 기존 인라인 이미지 URL 허용 기준 | 신규 파일은 API 프록시 사용 |
| `S3_ENDPOINT`                  | S3 호환 스토리지 endpoint        | AWS S3면 선택               |
| `S3_FORCE_PATH_STYLE`          | path-style 필요 여부             | MinIO 등                    |
| `S3_PRESIGNED_URL_TTL_SECONDS` | presigned URL TTL                | 예: `300`                   |

### 3.3 `.env.example` 초안

```dotenv
NODE_ENV=development
TZ=Asia/Seoul
API_PORT=4000
WEB_PORT=5173
APP_ORIGIN=http://localhost:5173
ADMIN_ORIGIN=http://localhost:5174
API_ORIGIN=http://localhost:4000
CORS_ORIGINS=http://localhost:5173,http://localhost:5174,https://jshsus.kr,https://admin.jshsus.kr,https://api.jshsus.kr,https://iam.jshsus.kr,https://oauth.jshsus.kr,https://points.jshsus.kr

DATABASE_URL=mysql://jshsus:CHANGE_ME@mysql:3306/jshsus
LEGACY_PLMA_DATABASE_URL=mysql://legacy_user:USE_EXISTING_SECRET@legacy-host:3306/plma
LEGACY_JSHS_DATABASE_URL=mysql://legacy_user:USE_EXISTING_SECRET@legacy-host:3306/dbjshsus

REDIS_URL=redis://:USE_EXISTING_SECRET@redis:6379/0
REDIS_PASSWORD=USE_EXISTING_SECRET
SESSION_SECRET=USE_EXISTING_SECRET
SESSION_COOKIE_NAME=jshsus.sid
SESSION_COOKIE_DOMAIN=.jshsus.kr
SESSION_COOKIE_SECURE=false
CSRF_SECRET=USE_EXISTING_SECRET
CSRF_COOKIE_NAME=jshsus.csrf
ALLOW_DEV_AUTH=false
DEV_AUTH_PASSWORD=

IAM_COOKIE_NAME=iam_token
IAM_TOKEN_TTL_SECONDS=86400
IAM_BASE_URL=https://iam.jshsus.kr
OAUTH_BASE_URL=https://oauth.jshsus.kr
SSO_ALLOWED_SERVICES=jshsus,points,plma,oauth
ADMIN_BASE_URL=https://admin.jshsus.kr
LEGACY_CALLBACK_TOKEN=USE_EXISTING_SECRET
POINTS_CALLBACK_URL=https://points.jshsus.kr/iam_callback
JSHSUS_LEGACY_CALLBACK_URL=https://jshsus.kr/contents/login/iam_callback.php
PLMA_URL=https://plma.jshsus.kr

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=USE_EXISTING_SECRET
SMTP_PASS=USE_EXISTING_SECRET
MAIL_FROM=JSHSUS <no-reply@jshsus.kr>

SENDON_API_BASE_URL=https://api.sendon.io/v2
SENDON_BASIC_AUTH=USE_EXISTING_SECRET
SENDON_PROFILE_ID=jshs_plma
SENDON_TEMPLATE_PASSWORD_RESET=USE_EXISTING_SECRET

JSREPORT_URL=https://jshsus.jsreportonline.net
JSREPORT_USER=USE_EXISTING_SECRET
JSREPORT_PASSWORD=USE_EXISTING_SECRET
JSREPORT_TEMPLATE_PLMA_HISTORY=plma_history

AWS_REGION=ap-northeast-2
AWS_ACCESS_KEY_ID=USE_EXISTING_SECRET
AWS_SECRET_ACCESS_KEY=USE_EXISTING_SECRET
S3_BUCKET=jshsus-dev
# 기존 문서에 직접 CDN URL이 저장된 경우에만 설정합니다.
S3_PUBLIC_BASE_URL=https://cdn.jshsus.kr
S3_ENDPOINT=
S3_FORCE_PATH_STYLE=false
S3_PRESIGNED_URL_TTL_SECONDS=300

FILE_UPLOAD_MAX_MB=10
FILE_ALLOWED_MIME_TYPES=image/jpeg,image/png,image/webp,application/pdf

PASSWORD_HASH_MODE=legacy-compatible
PASSWORD_REHASH_ON_LOGIN=false
RATE_LIMIT_WINDOW_SECONDS=60
RATE_LIMIT_MAX=60
LOG_LEVEL=debug
SENTRY_DSN=
```

## 4. 보안 이전 과제

- 첨부 코드에 노출된 모든 비밀값은 코드에서 제거하고 환경변수/Secret Manager로 이전한다. 운영값 변경이 필요하면 구현 전에 확인한다.
- 기존 `GET /login`, `GET /add_account`, `GET /email`처럼 민감 정보가 query string에 들어가는 API는 모두 `POST`로 변경한다.
- 기존 SHA-512 base64 비밀번호 해시는 그대로 검증한다. `argon2id` 재해시나 일괄 전환이 필요하면 구현 전에 별도로 확인한다.
- `LEGACY_CALLBACK_TOKEN` 방식의 고정 토큰 콜백은 단기 호환만 제공하고, HMAC 서명 또는 OIDC/OAuth authorization code flow로 교체한다.
- `points.jshsus.kr` 콜백은 HTTP가 아닌 HTTPS만 허용한다.
- `service`, `successURL` 등 redirect 관련 파라미터는 allowlist 검증을 강제한다.
- `/passtest`, 공개 랜덤 생성 도구 등 운영에 필요 없는 라우트는 제거한다.
- `iam_token` 쿠키는 운영에서 `secure=true`, `httpOnly=true`, `sameSite=None`, domain `.jshsus.kr`로 유지하되 CSRF 방어를 별도로 둔다.
- 인증/비밀번호 변경/알림톡 발송 API에는 rate limit, audit log, 재시도 제한을 적용한다.
- 관리자 기능은 RBAC와 감사 로그를 필수로 한다.

## 5. 신규 모노레포 구조

```txt
apps/
  api/
    src/
      auth/
      users/
      notices/
      boards/
      petitions/
      lost-items/
      reports/
      files/
      notifications/
      admin/
      points/
      dorm/
      device-cases/
      vote/
      system/
  web/
    src/
      routes/
      features/
      components/
      hooks/
      lib/
  admin/
    src/
      routes/
      features/
        points/
        dorm/
        device-cases/
        school/
        iam/
        vote/
        system/
      components/
      lib/
packages/
  db/
    src/schema/
    drizzle.config.ts
    migrations/
  types/
  ui/
  config/
docker/
  mysql/
  redis/
docs/
```

## 6. 기술 스택 상세

- Monorepo: pnpm workspace 또는 Turborepo
- API: NestJS, TypeScript, class-validator 또는 Zod, Passport 전략은 필요 시 사용
- Frontend: React, Vite, TypeScript, TanStack Router, TanStack Query, TanStack Table
- Admin Frontend: `apps/admin`을 별도 React 앱으로 구성한다. 기존 AdminLTE/DataTables 화면은 그대로 복제하지 않고, TanStack Table과 공용 UI 컴포넌트로 재설계한다.
- DB: MySQL 8, Drizzle ORM, drizzle-kit migration
- Cache/Session: Redis 7
- File Storage: AWS S3 또는 S3 호환 스토리지
- Infra: Docker Compose for local, 운영은 Nginx 또는 reverse proxy 뒤에 배치
- Test: Vitest, Nest testing module, Testcontainers 선택

## 7. 핵심 기능 명세

### 7.1 인증/계정

- 통합 로그인 유지 또는 신규 API에서 SSO 토큰 검증을 제공한다.
- 로그인 성공 시 Redis에 SSO 토큰을 저장하고 `iam_token` 쿠키를 발급한다.
- `/auth/session`에서 현재 로그인 사용자, 권한, 서비스별 ID를 반환한다.
- 비밀번호 변경은 이메일 인증 또는 알림톡 인증을 지원한다.
- 기존 계정 마이그레이션 중에는 SHA-512 legacy hash를 그대로 검증한다. `argon2id` 재해시나 일괄 전환은 운영 정책 확인 후 별도 단계로 진행한다.

### 7.2 홈 대시보드

- 최근 공지, 학사일정, 최근 자유게시글, 진행 중 청원, 분실물, 빠른 서비스 링크를 표시한다.
- 학생 로그인 시 내 권한에 맞는 바로가기와 읽지 않은 알림을 표시한다.

### 7.3 공지사항

- 중요 공지 고정, 부서/카테고리 필터, 검색, 첨부파일, 예약 발행, 공개 범위를 지원한다.
- 관리자는 공지 작성/수정/삭제/고정/예약을 수행한다.

### 7.4 게시판

- 자유게시판, 댓글, 대댓글, 추천/반응, 신고, 블라인드, 관리자 숨김 처리를 지원한다.
- 실명/닉네임 정책은 게시판별로 설정 가능하게 한다.

### 7.5 청원·제안

- 청원 등록, 참여, 댓글, 상태 변경을 제공한다.
- 기존 정책을 반영해 20일 동안 50명 이상 참여 시 답변 대기 상태로 전환한다.
- 관리자/학생회는 공식 답변을 작성할 수 있다.

### 7.6 분실물

- 분실/습득 구분, 사진 업로드, 장소, 시간, 상태, 해결 완료 처리를 지원한다.
- 실명제 정책을 유지하되 연락처 등 민감 정보는 직접 노출하지 않는다.

### 7.7 탐활서(탐구활동서)

- 학생은 면학 시간에 면학실이 아닌 다른 장소에서 탐구활동을 하기 위해 탐활서를 신청한다.
- 신청 항목은 활동 장소, 시작/종료 시간, 활동 목적/내용, 담당 또는 승인 교사를 포함한다.
- 교사는 관리자 포털에서 신청을 승인 또는 반려하고, 승인된 신청은 발급번호와 출력용 화면을 제공한다.
- 발급 이력, 취소/반려 이력, 인쇄 이력, 접근 권한을 관리한다.

### 7.8 상벌점/PLMA/휴대폰 연동

- 기존 `points.jshsus.kr`, `plma.jshsus.kr` redirect는 호환 레이어로 유지한다.
- 장기적으로는 SSO 토큰 기반 API 연동으로 전환한다.
- 기존 `dorm_ban` 기능은 도메인 의미를 재확인한 뒤 `dorm` 또는 `phone` 모듈로 편입한다.

### 7.9 알림

- 이메일 인증: SMTP 환경변수 사용
- 휴대폰 인증: Sendon 알림톡 API 사용
- 앱 내부 알림: 공지, 청원 답변, 댓글, 분실물 상태 변경

### 7.10 파일 업로드

- S3 presigned URL 방식 또는 API multipart 업로드 방식을 선택한다.
- 이미지 업로드는 MIME 검증, 용량 제한, 리사이징, 바이러스 검사 옵션을 둔다.
- 첨부파일은 owner, targetType, targetId, visibility를 DB에 기록한다.

### 7.11 학생생활안전부 관리자 앱

관리자 앱은 `apps/admin`으로 분리하고, 같은 NestJS API를 사용한다. 권한은 일반 학생 포털보다 더 엄격하게 분리하며 모든 변경 작업은 감사 로그에 기록한다.

관리자 앱 공통 요구사항:

- SSO 세션을 공유하되 관리자 권한이 없으면 접근을 차단한다.
- 모든 목록은 TanStack Table 기반으로 정렬, 필터, 검색, 페이지네이션, CSV/XLSX 내보내기를 지원한다.
- 학생 개인정보와 상벌점 데이터는 화면 권한에 따라 마스킹한다.
- 대량 변경, 복원, 삭제, 보관함 조작, 투표 인증 등 위험 작업은 확인 모달과 사유 입력을 요구한다.
- 관리자 API는 `actorId`, 대상, 변경 전/후 값, IP, User-Agent를 `audit_logs`에 남긴다.

관리자 앱 주요 기능:

- 상벌점 현황: 학년/반/번호, 이름, 상점, 벌점, 합계 조건으로 조회한다.
- 상벌점 부여: 학생 선택, 사유 선택, 점수 유형, 일자, 메모, 첨부 또는 근거 입력을 지원한다.
- 퇴사/표창 관리: 기준 점수 도달 학생 필터링, 처리 상태, 담당자 메모를 관리한다.
- 상벌점 기록: 학생별 상세 이력, 사유, 부여자, 취소/복원 이력을 조회한다.
- 사유 관리: 상벌점 사유, 점수, 사용 여부, 표시 순서를 관리한다.
- 상벌점 복원: 잘못 취소되거나 삭제된 기록을 권한자 승인 후 복원한다.
- 기숙사 현황/관리: 기숙사 관련 상태, 제한, 이력, 대상 학생을 관리한다.
- 스마트폰 보관함: 보관함 조작, 시간 설정, 조작 로그, 장애 상태를 관리한다.
- 학교 관리: 전체 학생, 교직원 계정, 학년/반/번호, 재학/졸업/제한 상태를 관리한다.
- IAM 관리: 전체 계정, 권한, 역할, 서비스 접근 가능 여부를 관리한다.
- 시스템 관리: 감사 로그, 로그뷰어, 검사 및 보정 도구, 시스템 상태를 제공한다.
- 전자투표/행사: 인증, 서버 모니터링, 클라이언트 상태, 향림제 운영 화면을 제공한다.

## 8. 신규 DB 스키마 초안

- `users`: 사용자 기본 정보, 학번, 이름, 학년/반/번호, 이메일, 전화번호, 상태
- `auth_accounts`: legacy iam id, provider id, password hash, hash algorithm
- `roles`: 역할 정의
- `permissions`: 권한 정의
- `user_roles`: 사용자 역할 매핑
- `user_permissions`: 사용자별 예외 권한
- `sessions`: 필요 시 서버 세션 메타데이터
- `notices`: 공지
- `notice_attachments`: 공지 첨부
- `boards`: 게시판 정의
- `posts`: 게시글
- `comments`: 댓글/대댓글
- `reactions`: 반응
- `reports`: 신고
- `petitions`: 청원
- `petition_participants`: 청원 참여
- `petition_answers`: 공식 답변
- `lost_items`: 분실물/습득물
- `files`: 업로드 파일 메타데이터
- `activity_requests`: 탐활서 신청
- `activity_request_events`: 탐활서 상태 변경/출력 이력
- `notifications`: 앱 내부 알림
- `audit_logs`: 관리자/보안 감사 로그
- `point_records`: 상벌점 부여/차감 원장
- `point_reasons`: 상벌점 사유와 기본 점수
- `point_adjustments`: 상벌점 취소, 복원, 보정 이력
- `point_award_cases`: 표창/퇴사 등 기준 도달 처리 상태
- `dorm_records`: 기숙사 상태/제한/관리 이력
- `device_cases`: 스마트폰 보관함 장치 정의
- `device_case_commands`: 보관함 조작 명령과 결과 로그
- `device_case_schedules`: 보관함 시간 설정
- `staff_profiles`: 교직원 상세 정보
- `school_classes`: 학년도별 학년/반/번호 편성
- `elections`: 전자투표/행사 투표 정의
- `election_voters`: 투표권자와 인증 상태
- `election_votes`: 투표 기록 또는 익명 투표 영수증
- `system_checks`: 검사 및 보정 작업 결과

## 9. API 설계 초안

```txt
GET    /api/health
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/session
POST   /api/auth/password/email-code
POST   /api/auth/password/phone-code
POST   /api/auth/password/verify-code
POST   /api/auth/password/change

GET    /api/home
GET    /api/notices
POST   /api/notices
GET    /api/notices/:id
PATCH  /api/notices/:id
DELETE /api/notices/:id

GET    /api/boards/:boardSlug/posts
POST   /api/boards/:boardSlug/posts
GET    /api/posts/:id
PATCH  /api/posts/:id
DELETE /api/posts/:id
POST   /api/posts/:id/comments
POST   /api/posts/:id/reactions
POST   /api/posts/:id/reports

GET    /api/petitions
POST   /api/petitions
GET    /api/petitions/:id
POST   /api/petitions/:id/participate
POST   /api/petitions/:id/answer

GET    /api/lost-items
POST   /api/lost-items
PATCH  /api/lost-items/:id
PATCH  /api/lost-items/:id/status

POST   /api/files/presigned-upload
POST   /api/reports/activity
GET    /api/admin/audit-logs

GET    /api/admin/points/summary
POST   /api/admin/points/records
GET    /api/admin/points/records
POST   /api/admin/points/records/:id/cancel
POST   /api/admin/points/records/:id/restore
GET    /api/admin/points/reasons
POST   /api/admin/points/reasons
PATCH  /api/admin/points/reasons/:id

GET    /api/admin/dorm/records
POST   /api/admin/dorm/records
PATCH  /api/admin/dorm/records/:id

GET    /api/admin/device-cases
POST   /api/admin/device-cases/:id/commands
GET    /api/admin/device-cases/:id/commands
PUT    /api/admin/device-cases/:id/schedules

GET    /api/admin/school/students
PATCH  /api/admin/school/students/:id
GET    /api/admin/school/staff
PATCH  /api/admin/school/staff/:id

GET    /api/admin/iam/accounts
PATCH  /api/admin/iam/accounts/:id
GET    /api/admin/iam/permissions
PUT    /api/admin/iam/accounts/:id/permissions

GET    /api/admin/vote/elections
POST   /api/admin/vote/elections
GET    /api/admin/vote/elections/:id/status
POST   /api/admin/vote/elections/:id/verify

GET    /api/admin/system/logs
POST   /api/admin/system/checks
GET    /api/admin/system/checks
```

## 10. 디자인 명세

- 기존 브랜드 컬러인 청록 계열을 유지하되, 포털/업무 도구에 맞는 절제된 톤으로 재정리한다.
- 메인 화면은 랜딩 페이지가 아니라 학생이 바로 쓰는 대시보드로 구성한다.
- 모바일 우선으로 설계하고, 데스크톱에서는 좌측 또는 상단 내비게이션과 고밀도 정보 레이아웃을 제공한다.
- 버튼에는 의미 있는 아이콘을 함께 사용하고, 게시판/관리자 테이블은 TanStack Table 기반 정렬/필터/페이지네이션을 제공한다.
- 반복 카드의 border radius는 8px 이하로 유지한다.
- 텍스트가 버튼/카드 밖으로 넘치지 않도록 반응형 줄바꿈과 고정 레이아웃을 정의한다.
- 접근성 기준은 WCAG AA를 목표로 하며, focus ring, 키보드 이동, alt text, form error message를 필수로 한다.
- 관리자 앱은 대시보드/운영 도구 성격이므로 장식적인 랜딩 구성을 피하고, 좌측 내비게이션, 상단 검색/사용자 메뉴, 고밀도 테이블, 필터 패널, 일괄 작업 툴바 중심으로 설계한다.
- 관리자 앱의 위험 작업은 일반 버튼과 시각적으로 구분하고, destructive action은 확인 모달과 사유 입력을 요구한다.

## 11. Docker 개발 환경

```yaml
services:
  mysql:
    image: mysql:8.4
    environment:
      MYSQL_DATABASE: jshsus
      MYSQL_USER: jshsus
      MYSQL_PASSWORD: local_password
      MYSQL_ROOT_PASSWORD: local_root_password
    ports:
      - '3306:3306'
    volumes:
      - mysql-data:/var/lib/mysql

  redis:
    image: redis:7
    command: ['redis-server', '--requirepass', 'local_redis_password']
    ports:
      - '6379:6379'

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    env_file:
      - .env
    depends_on:
      - mysql
      - redis

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    env_file:
      - .env
    depends_on:
      - api

  admin:
    build:
      context: .
      dockerfile: apps/admin/Dockerfile
    env_file:
      - .env
    depends_on:
      - api

volumes:
  mysql-data:
```

## 12. 마이그레이션 계획

1. 기존 DB 스키마와 실제 데이터 덤프를 확보한다.
2. `iam`, `user`, `teacher`, `iam_permissions`, `iam_user_permissions`, `verify`, `pass_code`, `dorm_ban`과 points 관리자 DB의 상벌점/사유/기숙사/보관함/투표 관련 테이블 컬럼을 분석한다.
3. 신규 Drizzle schema와 legacy map 테이블을 만든다.
4. `pnpm db:migrate`로 신규 Drizzle schema를 적용한다.
5. `pnpm db:legacy:import -- --dump <dump.sql> --yes`로 points dump의 사용자, legacy 비밀번호 해시, 학생, 상벌점, 사유, 보관함, 기숙사, 노래 신청 데이터를 이관한다. dump 파일 자체는 repo에 커밋하지 않는다.
6. 사용자/권한 데이터를 운영 정책에 맞게 보정한다. 기본 import는 학생 연결 계정에 `student`, 그 외 계정에 `teacher` 역할을 부여한다.
7. 공지, 게시판, 청원, 분실물, 파일 등 별도 소스 데이터가 있는 도메인을 추가 이관한다.
8. 운영 도메인 redirect 규칙을 만든다.
9. 스테이징에서 로그인, 글쓰기, 청원 참여, 알림톡, 이메일, 파일 업로드를 검증한다.
10. 운영 전환 전 비밀값 변경이 필요한 항목은 별도 확인 후 처리하고, 기존 콜백 토큰 폐기 시점을 확정한다.

## 13. 개발 단계

### Phase 0. 프로젝트 부트스트랩

- pnpm workspace/Turborepo 구성
- NestJS API 앱 생성
- React/Vite 앱 생성
- Drizzle/MySQL 패키지 생성
- Docker Compose 구성
- ESLint, Prettier, TypeScript 설정
- `.env.example` 추가

### Phase 1. 인증과 사용자

- 환경변수 로더와 Zod 검증
- MySQL/Drizzle 연결
- Redis 연결
- SSO token 저장/검증
- `/api/auth/session`
- 로그인/로그아웃/비밀번호 변경 API
- legacy SHA-512 검증 유지, 재해시는 운영 정책 확인 후 별도 진행

### Phase 2. 핵심 포털

- 홈 대시보드
- 공지사항
- 자유게시판
- 청원·제안
- 분실물
- 파일 업로드

### Phase 3. 관리자 앱 1차

- `apps/admin` 생성
- 관리자 RBAC
- 감사 로그
- 상벌점 현황
- 상벌점 부여
- 상벌점 기록
- 사유 관리
- 학생/교직원 관리

### Phase 4. 운영 기능 확장

- 신고/블라인드 처리
- 알림 센터
- jsreport 또는 PDF 렌더링
- 기존 PLMA/points 연동
- 기숙사 현황/관리
- 스마트폰 보관함 조작/시간 설정
- IAM 권한 설정
- 전자투표/행사 운영
- 시스템 검사 및 보정
- 로그뷰어

### Phase 5. 이전과 출시

- 데이터 마이그레이션 스크립트와 import 검증
- 운영 도메인 redirect
- 스테이징 QA
- 보안 점검
- 백업/복구 리허설
- 운영 배포

## 14. 바로 시작할 작업 목록

- [x] 모노레포 scaffold 생성: `apps/web`, `apps/admin`, `apps/api`, `packages/db`, `packages/types`, `packages/ui`
- [x] `packages/db` Drizzle schema와 migration 초안 작성
- [x] `.env.example` 생성 및 legacy secret/AWS/S3/Redis/MySQL 환경변수 반영
- [x] Docker Compose로 MySQL/Redis/API/Web/Admin 실행 구조 구성
- [x] NestJS 환경변수 검증 구현
- [x] Redis SSO token service와 HTTP-only cookie 기반 auth session API 구현
- [x] React 라우터와 학생/관리자 기본 레이아웃 구현
- [x] 레거시 DB dump import mapping 및 dry-run/실행 스크립트 작성
- [x] `apps/admin` scaffold, 좌측 메뉴, 권한 guard 구현
- [x] points 관리자 DB 테이블 dump 기반 상벌점/보관함/기숙사 데이터 매핑
- [x] 상벌점 현황, 사유 관리, 부여, 취소, 감사 로그 API/UI 1차 연결
- [x] 스마트폰 보관함 상태, 개폐/동기화 명령, 시간 설정, 명령 로그 API/UI 1차 연결
- [x] 기숙사 방 현황, 배정 등록, 민원/보고 상태 관리 API/UI 1차 연결
- [x] 탐활서 학생 신청/취소, 교사 승인/반려, 발급번호, 출력 화면 API/UI 1차 연결
- [x] 청원 학생 작성/참여, 중복 참여 방지, 답변 대기 전환, 관리자 답변 API/UI 1차 연결
- [x] 학생 내 상벌점/기숙사/보관함/최근 탐활서 조회 화면 연결
- [x] 학생 포털 공지사항 목록, 자유게시판 작성/목록, 분실물 작성/목록 API/UI 1차 연결
- [x] 관리자 학생/교직원 조회, IAM 역할 요약, 감사 로그 API/UI 1차 연결
- [x] 공지사항 관리자 CRUD, 게시판 댓글/신고/숨김, 분실물 상태 변경, 파일 업로드 API/UI 구현
- [x] 학생/교직원/IAM 권한의 생성/수정/권한 부여 상세 관리 구현
- [x] 운영용 rate limit, S3 파일 저장 adapter, 이메일/알림톡 adapter 구현
- [x] Ubuntu 서버 대상 GitHub Actions 배포 파이프라인 구성
- [x] 기존 과구리 감각을 반영한 디자인 개편 계획 문서 작성
- [x] `pnpm typecheck`, `pnpm build`, Docker image build/runtime smoke 검증

### 14.1 남은 후속 작업

- [ ] `docs/jshsus-design-refresh-plan.md` 기준 학생 포털/관리자 포털 실제 디자인 개편
- [ ] 운영 도메인 redirect 구성
- [ ] 운영 서버 `.env`, S3 bucket policy, SMTP/Sendon 실 secret 주입 및 실발송 점검
