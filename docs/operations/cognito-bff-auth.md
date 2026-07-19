# Cognito BFF 인증 운영 가이드

이 문서는 과구리와 학생부 전산망의 기존 로그인 UI를 유지하면서 Amazon Cognito를 인증 제공자로 사용하는 방법을 설명한다. React는 Cognito 토큰이나 app client secret을 받지 않는다. NestJS API가 Cognito와 통신한 뒤 기존 Redis opaque session을 발급한다.

## 인증 모드

| `AUTH_MODE` | 동작                                                     | 용도                 |
| ----------- | -------------------------------------------------------- | -------------------- |
| `local`     | 기존 `auth_accounts` 비밀번호만 사용                     | 로컬 개발, 즉시 롤백 |
| `hybrid`    | Cognito 연결 계정은 Cognito만, 미연결 계정은 로컬만 사용 | 단계적 이관          |
| `cognito`   | Cognito 인증과 연결된 `sub`가 모두 필요                  | 이관 완료 후         |

`hybrid`에서 Cognito 인증에 실패한 연결 계정은 로컬 비밀번호로 재시도하지 않는다. 그렇지 않으면 비밀번호 재설정이나 계정 잠금을 기존 비밀번호로 우회할 수 있다.

## 서버 환경 변수

다음 값은 API 컨테이너에만 주입한다. `VITE_` 환경 변수, React 코드, Git 저장소에 client secret을 넣으면 안 된다.

```dotenv
AUTH_MODE=hybrid
COGNITO_REGION=ap-northeast-2
COGNITO_USER_POOL_ID=...
COGNITO_CLIENT_ID=...
COGNITO_CLIENT_SECRET=...
COGNITO_FLOW_TTL_SECONDS=300
COGNITO_REQUEST_TIMEOUT_MS=5000
CORS_ORIGINS=https://v26.jshsus.kr,https://admin-v26.jshsus.kr
```

Web/Admin app client를 별도로 나누는 경우에는 `COGNITO_WEB_CLIENT_ID`,
`COGNITO_WEB_CLIENT_SECRET`, `COGNITO_ADMIN_CLIENT_ID`,
`COGNITO_ADMIN_CLIENT_SECRET`을 넣으면 단일 client 값보다 우선한다.

공개 스테이징에서는 기존 서비스의 부모 도메인 쿠키와 충돌하지 않도록 별도 이름을 권장한다.

```dotenv
IAM_COOKIE_NAME=__Host-jshsus-v26.sid
CSRF_COOKIE_NAME=__Host-jshsus-v26.csrf
SESSION_COOKIE_HOST_ONLY=true
SESSION_COOKIE_SECURE=true
```

`SESSION_COOKIE_HOST_ONLY=true`이면 API가 쿠키의 `Domain` 속성을 쓰지 않고 `SameSite=Lax`로 설정한다. 따라서 web과 admin은 각각 host-only 세션을 갖는다.

release compose의 `SESSION_COOKIE_DOMAIN` 기본값은 기존 local 모드를 위해 `.jshsus.kr`로 유지되지만, host-only 모드에서는 이 값이 쿠키에 사용되지 않는다.

운영 환경에서는 Cognito 모드를 켤 때 두 쿠키 이름이 `__Host-`로 시작하지 않으면 API가 시작되지 않는다. 이는 기존 `jshsus.kr`과 `points.jshsus.kr`의 부모 도메인 쿠키를 잘못 덮어쓰는 배포를 실패 처리하기 위한 안전장치다.

## 서버 IAM 정책

학생 계정 프로비저닝과 운영자용 계정 관리를 실행하는 AWS IAM user/role에는 최소한 다음 액션이 필요하다. `DescribeUserPool`은 프로비저닝 전에 User Pool이 일반 username 로그인 또는 `preferred_username` 별칭 로그인을 지원하는지 확인하는 읽기 전용 검증에 사용한다.

```json
[
  "cognito-idp:DescribeUserPool",
  "cognito-idp:AdminInitiateAuth",
  "cognito-idp:AdminRespondToAuthChallenge",
  "cognito-idp:AdminGetUser",
  "cognito-idp:AdminCreateUser",
  "cognito-idp:AdminSetUserPassword",
  "cognito-idp:AdminUpdateUserAttributes",
  "cognito-idp:ListUsers",
  "cognito-idp:AdminListGroupsForUser",
  "cognito-idp:AdminAddUserToGroup",
  "cognito-idp:AdminRemoveUserFromGroup"
]
```

## Cognito app client 설정

Web과 Admin app client를 분리하고 두 client 모두 다음 explicit auth flow를 활성화한다.

- `ALLOW_USER_PASSWORD_AUTH`
- `ALLOW_REFRESH_TOKEN_AUTH` (추후 토큰 갱신 도입 대비)

현재 구현은 `USER_PASSWORD_AUTH`, `NEW_PASSWORD_REQUIRED`, `ForgotPassword`, `ConfirmForgotPassword`를 사용한다. Hosted UI callback URL은 이 로그인 경로에서 사용하지 않지만 남겨 두어도 무방하다.

User Pool이 `email`을 required attribute로 갖는 경우에도 로그인 UI에는 이메일 입력칸을 추가하지 않는다. 최초 비밀번호 변경 시 API가 DB의 사용자 이메일을 Cognito challenge 응답에 넣고, 이메일이 없으면 `학번@jshsus.kr` 형식의 보조값으로 흐름을 완료한다. 이 보조값은 비밀번호 재설정 메일 수신을 보장하지 않으므로 실제 이메일 인증 정책을 켜기 전에는 사용자 이메일 수집·검증 절차를 별도로 준비한다.

## MySQL 계정 연결

이번 단계에서는 진행 중인 DB 마이그레이션과 충돌하지 않도록 기존 `auth_accounts` 테이블을 재사용한다. 한 User Pool만 인증 원본으로 사용하며 `provider_account_id`에는 변경되지 않는 Cognito `sub`를 저장한다.

먼저 Cognito 사용자의 `sub`를 확인한다. 현재 신규 User Pool은 학생의 학번을 Cognito username으로 사용하지만, 과구리 DB와의 불변 연결값은 username이 아니라 `sub`다.

```bash
aws cognito-idp admin-get-user \
  --region ap-northeast-2 \
  --user-pool-id "$COGNITO_USER_POOL_ID" \
  --username 9999 \
  --query "UserAttributes[?Name=='sub'].Value | [0]" \
  --output text
```

그 뒤 해당 로컬 사용자와 연결한다. 아래 값은 반드시 실제 조회 결과로 바꾼다.

```sql
INSERT INTO auth_accounts (user_id, provider, provider_account_id, created_at, updated_at)
VALUES (:user_id, 'cognito', :cognito_sub, NOW(3), NOW(3));
```

연결 규칙:

- `(provider, provider_account_id)`는 고유해야 한다.
- DB의 `auth_accounts.provider_account_id`에는 학번이나 이메일이 아니라 Cognito `sub`를 저장한다.
- 권한, 이름, 학생·교직원 상태는 계속 MySQL을 원본으로 사용한다.
- `sub`가 연결되지 않은 Cognito 사용자는 인증에 성공해도 과구리 세션을 받지 못한다.

향후 별도 external identity 테이블을 도입할 때 `(issuer, sub)`와 `user_id`를 분리해 이 데이터를 옮긴다.

## 스테이징 전환 순서

1. 배포 환경은 계속 `AUTH_MODE=local`로 둔 채 코드를 배포한다.
2. Cognito Web/Admin client에 `ALLOW_USER_PASSWORD_AUTH`를 활성화한다.
3. 테스트 사용자 한 명을 Cognito에 만들고 MySQL에 `sub`를 연결한다.
4. 공개 스테이징만 `AUTH_MODE=hybrid`로 변경해 API 컨테이너를 재시작한다.
5. Web과 Admin에서 각각 다음을 확인한다.
   - 기존 미연결 로컬 계정 로그인
   - 연결 계정 Cognito 로그인
   - 임시 비밀번호의 최초 비밀번호 변경
   - 비밀번호 찾기, 이메일 코드 확인, 새 비밀번호 로그인
   - 잘못된 Cognito 비밀번호가 로컬 비밀번호로 우회되지 않음
   - 로그아웃 후 opaque session cookie 제거
6. 감사 로그에서 `auth.login`과 사용자 ID를 확인한다.
7. 최소 하루 관찰 후 다음 계정 묶음을 연결한다.

## 즉시 롤백

애플리케이션 또는 Cognito 장애 시 스테이징 환경의 값만 되돌린다.

```dotenv
AUTH_MODE=local
```

API 컨테이너를 재시작하면 기존 로컬 인증으로 즉시 돌아간다. Cognito 연결 행을 삭제할 필요는 없다. 이 변경은 기존 `jshsus.kr` 및 `points.jshsus.kr`의 DNS, nginx, PHP 코드나 데이터베이스를 수정하지 않는다.

롤백할 때도 `IAM_COOKIE_NAME`, `CSRF_COOKIE_NAME`, `SESSION_COOKIE_HOST_ONLY=true`는 그대로 유지하고 `AUTH_MODE`만 `local`로 되돌린다.

## 이메일 관련 제한

- 비밀번호 찾기는 Cognito에 검증된 이메일이 있는 계정만 실제 코드를 받을 수 있다.
- 기존 DB 이메일을 검증 없이 `email_verified=true`로 이관하지 않는다.
- 이메일이 없거나 검증되지 않은 사용자는 별도의 이메일 등록·OTP 검증 절차가 필요하다.
- 전교생 초대 전에는 Cognito 기본 이메일 한도를 사용하지 말고 SES 발신 도메인 검증과 sandbox 해제를 완료한다.

## 보안 경계

- 브라우저에는 Cognito access/id/refresh token과 Cognito challenge `Session`을 노출하지 않는다.
- 최초 비밀번호 변경용 challenge는 Redis에 5분간 저장하고 브라우저에는 임의 `flowId`만 준다.
- 성공한 Cognito 토큰은 `GetUser`로 검증해 불변 `sub`를 얻은 뒤 폐기한다.
- 로그인·재설정 엔드포인트에는 별도 rate limit을 적용한다.
- 비밀번호 찾기 요청은 존재하지 않는 계정도 같은 성공 응답을 반환해 계정 열거를 방지한다.
