# 서버 정리 및 Cognito staging 운영 기록

기준 시각: 2026-07-19 KST

이 문서는 기존 `jshsus.kr`과 `points.jshsus.kr`에 영향을 주지 않는 범위에서 수행한 작업, 복구 지점, Cognito staging 구성과 후속 작업을 기록한다. 비밀번호, 클라이언트 시크릿, DB 접속 정보는 기록하지 않는다.

## 보호 대상

다음 서비스는 이번 정리에서 중지하거나 수정하지 않는다.

- `jshsus.kr`: 기존 Bitnami/PHP 서비스
- `points.jshsus.kr`: PLMA 서버의 PM2 `plma`, TCP 3002
- PM2 `iam`, `OAuth`
- `v26.jshsus.kr`, `admin-v26.jshsus.kr`의 현재 Docker 배포
- Nginx Proxy Manager, SpiceDB, Redis, MySQL 데이터

## 작업 전 복구 지점

### Lightsail 수동 스냅샷

- `jshsus-new-pre-cleanup-20260719`
- `plma-pre-cleanup-20260719`

두 스냅샷 모두 생성 완료를 확인한 후 정리를 시작했다. 서버 전체 롤백이 필요하면 동일 리전에서 스냅샷으로 새 인스턴스를 생성하고, 기존 고정 IP를 새 인스턴스로 교체하기 전에 별도 호스트명으로 먼저 검증한다.

### 오프 인스턴스 백업

- 기존 PHP 서버
  - 서버: `/home/bitnami/backups/2026-07-19-prework`
  - Windows: `C:\Users\Newbiedev\Desktop\server-backups\jshsus-new`
- PLMA 서버
  - 서버: `/home/ubuntu/Server/backups/legacy-retirement-20260719`
  - Windows: `C:\Users\Newbiedev\Desktop\server-backups\PLMA\legacy-retirement-20260719`

파일과 DB 논리 덤프는 서버와 Windows 양쪽에서 SHA-256을 대조했다. 백업 디렉터리는 정리 대상에서 제외했다.

## 정리한 항목

### PM2

삭제:

- `newPLMA`
- `plma-backend`
- `plma_python`
- `clubs`
- `qr`

보존:

- `plma`
- `iam`
- `OAuth`

정리 후 `pm2 save`를 실행했다. 삭제 대상 포트 3000, 3008, 3010, 4002, 4008이 닫히고 보호 대상 3002가 계속 수신 중임을 확인했다.

### 애플리케이션 디렉터리

정확한 실제 경로를 검증한 뒤 다음 디렉터리만 삭제했다.

- `/home/ubuntu/Server/newplma`
- `/home/ubuntu/Server/plma_backend_using_nestjs`
- `/home/ubuntu/Server/plma_python`
- `/home/ubuntu/Server/clubs`
- `/home/ubuntu/Server/qrbackend`
- `/home/ubuntu/Server/jsreportapp`

`labs`, `lab`, `plma-python`은 독립 서비스/프록시가 존재하지 않았다. `iam-server` 내부 이름공간은 보호 대상이라 삭제하지 않았다. DB나 테이블은 삭제하지 않았다.

### 정리 후 서버 구조

```text
/home/ubuntu/Server
├── OAuth
├── backups
├── iam
├── iam-server
├── jshsus-web-v26
├── nginx-proxy-manager
└── plma
```

운영 원칙:

- 신규 서비스는 `/home/ubuntu/Server/<service>` 아래에 두되, 소스 체크아웃과 영속 데이터 볼륨을 분리한다.
- Compose 프로젝트는 서비스별 디렉터리 하나와 `.env` 하나를 가진다.
- 백업은 애플리케이션 디렉터리와 섞지 말고 장기적으로 Lightsail 외부 저장소(S3 등)로 이전한다.
- PM2와 Docker를 같은 서비스에 중복 사용하지 않는다. 신규 과구리는 Docker Compose로 통일한다.
- Nginx Proxy Manager DB를 직접 수정하지 않는다.

## Nginx Proxy Manager 후속 정리

삭제 대기 중인 프록시 호스트:

- ID 4: `plma.jshsus.kr` -> 3010
- ID 6: `qr.jshsus.kr` -> 4002
- ID 8: `clubs.jshsus.kr` -> 4008

반드시 보존:

- ID 2: `points.jshsus.kr` -> 3002

Nginx Proxy Manager 2.12.3에는 공식 관리 CLI가 없다. 관리자 자격 증명으로 UI 또는 `DELETE /api/nginx/proxy-hosts/:id` API를 사용해야 한다. SQLite 직접 수정이나 관리자 비밀번호 강제 초기화는 하지 않는다. 프록시 삭제 후 관련 Cloudflare DNS 레코드도 별도로 제거한다.

## 정리 후 무중단 검증

정리 전후에 다음 응답이 모두 HTTP 200임을 확인했다.

- `https://jshsus.kr/`
- `https://points.jshsus.kr/`
- `https://v26.jshsus.kr/api/health`
- `https://admin-v26.jshsus.kr/`

## Cognito staging

기존 로그인과 DNS에는 연결하지 않은 별도 리소스다.

- 리전: `ap-northeast-2`
- User Pool: `jshsus-auth-staging`
- User Pool ID: `ap-northeast-2_BdyF70k5q`
- 삭제 보호: 활성화
- 플랜: Essentials
- MFA: 비활성화
- 셀프 가입: 비활성화
- 로그인 별칭: `preferred_username`
- 내부 불변 식별자: Cognito `sub`
- 이메일 자동 검증 및 verified email 복구
- username 대소문자 구분 안 함
- 관리형 로그인 도메인: `jshsus-auth-staging-050314037822.auth.ap-northeast-2.amazoncognito.com`

앱 클라이언트:

- Web: `jshsus-web-staging` / `73h68fhtcvcedshsq8qml3iccr`
- Admin: `jshsus-admin-staging` / `61thg46lu8a6jpve0bd9e26bhg`

두 클라이언트 모두 다음 원칙을 적용했다.

- Authorization Code flow만 허용
- scope: `openid email profile`
- client secret 생성
- token revocation 활성화
- user-existence error 은닉
- Cognito 기본 관리형 로그인 스타일 할당

콜백:

- Web: `https://v26.jshsus.kr/api/auth/oidc/web/callback`
- Admin: `https://admin-v26.jshsus.kr/api/auth/oidc/admin/callback`

로그아웃:

- Web: `https://v26.jshsus.kr/`
- Admin: `https://admin-v26.jshsus.kr/`

클라이언트 시크릿은 저장소나 브라우저 번들에 넣지 않는다. 배포 시 GitHub Actions secret 또는 서버의 권한 제한 환경 파일로 주입한다.

## 애플리케이션 연결 원칙

현재 서비스에 바로 연결하지 않는다. 다음 순서로 진행한다.

1. API에 `AUTH_MODE=local|hybrid|oidc` 기능 플래그를 추가하고 기본값을 `local`로 유지한다.
2. 서버 BFF가 `state`, `nonce`, PKCE S256과 confidential client token 교환을 처리한다.
3. 브라우저에는 Cognito 토큰을 주지 않고 `HttpOnly`, `Secure`, host-only 세션 쿠키만 발급한다.
4. 외부 계정 연결은 `(issuer, sub, user_id)`로 저장하고 역할과 권한은 기존 MySQL을 원본으로 유지한다.
5. Web/Admin 쿠키 이름과 app client를 분리한다.
6. 소수의 검증된 테스트 계정으로 비밀번호 변경, 이메일 검증, 로그아웃, 권한 거부를 검증한다.
7. staging 검증 이후에만 별도 인증 서브도메인과 전체 계정 이관을 검토한다.

## 계정 이관 차단 사항

기존 `dbjshsus.jshsus_user` 학생 257명은 이메일이 모두 비어 있다. 따라서 이메일 인증을 전제로 한 전원 비밀번호 재설정을 지금 실행하면 안 된다.

필요한 선행 작업:

- 학생 이메일 수집 및 소유 검증
- 졸업/비활성 계정 판정 기준 확정
- 학번 재사용과 변경에 독립적인 내부 사용자 ID 부여
- 교직원 6자리 번호와 사용자 연결 확정
- 2년 보존 후 삭제할 개인정보와 영구 보존할 감사 이력 구분

검증되지 않은 기존 이메일에 `email_verified=true`를 임의로 설정하지 않는다.

## 기존 PHP 서버의 별도 보안 작업

이번 정리에서는 기존 서비스 영향 방지를 위해 변경하지 않았다. 별도 유지보수 창에서 다음을 우선 처리한다.

- Lightsail 방화벽과 서버 방화벽에서 공개 3306 차단
- dotfile, 디렉터리 목록과 테스트 바이너리의 웹 공개 차단
- 웹루트의 DB 비밀값을 외부 환경 파일로 이동
- 세션 쿠키에 `Secure`, `HttpOnly`, `SameSite` 적용
- 코드와 업로드 디렉터리 분리

이 작업은 현재 `jshsus.kr`의 PHP 호환성에 영향을 줄 수 있으므로 신규 서비스 배포와 분리하여 진행한다.
