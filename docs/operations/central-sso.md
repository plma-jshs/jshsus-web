# 과구리 중앙 통합로그인 운영 가이드

`auth.jshsus.kr`는 별도의 Cognito Managed Login 화면이 아니다. 과구리 Web 이미지를
같이 사용해 기존 로그인 디자인을 그대로 제공하고, NestJS가 Cognito와 통신하는
중앙 인증 브로커 역할을 한다. Cognito 토큰과 app client secret은 브라우저에
노출하지 않는다.

## 인증 흐름

1. 과구리 또는 학생부 전산망이 `POST /api/auth/sso/start`를 호출한다.
2. API는 요청 서비스의 Origin을 정확히 대조하고 Redis에 요청을 5분간 저장한다.
   서비스 호스트에는 동일 수명의 HttpOnly 브라우저 바인딩 쿠키만 남긴다.
3. 브라우저는 `auth.jshsus.kr/login?sso=<request-id>`로 이동한다.
4. 중앙 로그인 성공 후 API가 60초짜리 일회용 코드를 만들고 서비스의 고정된
   `/auth/callback`으로 보낸다. Redis에는 코드 원문이 아닌 SHA-256 키만 저장한다.
5. 서비스는 코드, state, 시작할 때 받은 브라우저 바인딩을 함께 검증한다. 성공 시
   코드를 원자적으로 소비하고 해당 서비스 호스트 전용 opaque session을 발급한다.

`returnTo`는 서버에 내부 경로로 저장한다. 클라이언트가 보낸 외부 URL이나 `//`로
시작하는 경로는 사용할 수 없다. Web과 Admin callback Origin도 환경 변수의 정확한
Origin 목록에 있는 값만 허용한다.

## 쿠키와 세션 경계

- 중앙 로그인, 과구리, 학생부 전산망은 각각 별도의 host-only session cookie를 쓴다.
- `.jshsus.kr` Domain cookie는 사용하지 않는다.
- 운영 쿠키 이름은 모두 `__Host-`로 시작하고 `Secure`, `Path=/`, `SameSite=Lax`를 쓴다.
- 서비스 로그아웃은 해당 사용자의 Redis session을 전부 무효화한 뒤 중앙 로그인
  도메인으로 이동해 중앙 쿠키도 지운다.
- 역할과 permission은 Cognito 그룹이 아니라 MySQL의 현재 값을 기준으로 API에서
  다시 검사한다. Admin 코드 교환도 관리자 역할 또는 permission이 없으면 거부한다.

## 운영 환경 변수

```dotenv
SSO_PUBLIC_ORIGIN=https://auth.jshsus.kr
SSO_WEB_ORIGINS=https://v26.jshsus.kr
SSO_ADMIN_ORIGINS=https://admin-v26.jshsus.kr
SSO_REQUEST_TTL_SECONDS=300
SSO_CODE_TTL_SECONDS=60
SSO_ATTEMPT_COOKIE_NAME=__Host-jshsus-v26.sso_attempt

SESSION_COOKIE_HOST_ONLY=true
SESSION_COOKIE_SECURE=true
IAM_COOKIE_NAME=__Host-jshsus-v26.sid
CSRF_COOKIE_NAME=__Host-jshsus-v26.csrf
```

Origin에는 경로를 넣지 않는다. 실제로 서비스하지 않는 Origin은 목록에서 제거한다.
운영 전환 시점에만 `https://jshsus.kr`과 `https://admin.jshsus.kr`을 각각의 목록에
추가한다. Secret은 GitHub production environment와 서버의 배포 `.env`에만 둔다.

## DNS와 Nginx Proxy Manager

코드를 먼저 배포하더라도 아래 호스트가 준비되기 전에는 중앙 로그인 강제 버전을
서비스에 노출하지 않는다.

1. Cloudflare에 `auth.jshsus.kr` DNS 레코드를 현재 v26 서버로 추가한다.
2. NPM에 `auth.jshsus.kr` Proxy Host를 추가한다.
3. upstream은 과구리 Web 컨테이너와 동일하게 지정한다. 별도 프런트엔드 컨테이너를
   만들지 않는다.
4. Let's Encrypt 인증서를 발급하고 Force SSL, HTTP/2를 켠다.
5. `/api` 프록시도 기존 Web 호스트와 동일한 NestJS API로 연결되는지 확인한다.

Cloudflare와 NPM 모두 TLS를 사용하는 경우 Cloudflare SSL/TLS 모드는 Full (strict)를
권장한다. 이 작업은 기존 `jshsus.kr` 또는 `points.jshsus.kr` Proxy Host를 수정하지
않고 새 호스트를 추가하는 방식으로 진행한다.

## 공개 전 점검

다음 순서로 `v26`과 `admin-v26`만 먼저 검증한다.

1. 로그아웃 상태의 과구리 보호 페이지가 중앙 로그인으로 이동한다.
2. 로그인 후 원래 내부 경로로 돌아온다.
3. 과구리에서 로그인한 사용자가 Admin에 들어갈 때 비밀번호를 다시 묻지 않는다.
4. 관리자 권한이 없는 학생은 Admin callback에서 거부된다.
5. callback 코드를 새 탭이나 다른 브라우저에서 교환할 수 없다.
6. 같은 코드를 두 번 교환하면 두 번째 요청이 거부된다.
7. 코드 발급 60초 후 교환이 거부된다.
8. 한 서비스에서 로그아웃한 뒤 Web, Admin, 중앙 로그인 세션이 모두 만료된다.
9. 비밀번호 찾기와 계정 활성화 후 기존 SSO 요청으로 정상 복귀한다.
10. 브라우저 저장소에 Cognito access/id/refresh token이 없는지 확인한다.

검증이 끝난 뒤에만 `jshsus.kr`과 `admin.jshsus.kr`을 Origin 목록과 실제 서비스 전환에
포함한다. 기존 PHP 서비스의 DNS·NPM 설정은 그 전까지 변경하지 않는다.

## 장애와 롤백

- Cognito 장애 시 이미 발급된 Redis session은 만료 전까지 계속 사용할 수 있다.
- 신규 로그인 장애 시 `auth.jshsus.kr`, API, Redis, Cognito 순서로 상태를 확인한다.
- 긴급 롤백은 직전 애플리케이션 이미지로 되돌린다. DB migration은 이 SSO 변경에
  포함되지 않으므로 DB 롤백은 필요 없다.
- Redis를 비우면 모든 로그인 세션과 진행 중인 SSO 요청이 함께 만료된다.
