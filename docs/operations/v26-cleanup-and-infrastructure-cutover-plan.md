# v26 정리·마이그레이션·인프라 전환 계획

기준일: 2026-08-14 KST

이 문서는 `v26.jshsus.kr` 공개 전후에 수행할 운영 정리 계획이다. 이번 코드
변경에서는 서버 디렉터리 삭제, 운영 DB `DROP`, Cloudflare/Nginx Proxy Manager
설정 변경을 실행하지 않는다. 각 단계는 백업과 복구 검증을 통과한 뒤 별도 유지보수
창에서 승인받아 진행한다.

## 1. 현재 코드 기준 변경 요약

- 휴대폰 보관함 원격 API의 별도 Guard 설정은 제거하고 기존 원격 엔드포인트 동작을
  복원했다.
- 일반 사용자 파일 누적 quota 기본값을 100MB에서 1GB(1024MB)로 올렸다.
- GA4의 공개 경로 allowlist는 제거했다. 측정 ID가 설정된 경우 웹과 관리자 앱의
  라우트 이동을 모두 수집하고, 측정 ID가 비어 있으면 수집하지 않는다.
- 비밀번호 찾기는 DB에 저장된 이메일·전화번호를 대상으로 하는 기존 정책으로
  복원했다. Cognito의 `email_verified`/`phone_number_verified`만을 강제하는
  복구 정책은 적용하지 않는다.
- Cognito 필수 이메일 속성 처리에서 학번 기반 가짜 이메일을 자동 생성하는 폴백을
  다시 사용하도록 복원했다. 실제 운영 정책을 바꿀 때는 계정 생성·마이그레이션과
  함께 별도 설계한다.
- 조회수는 IP를 제한 키로 사용하지 않는다. 비로그인 조회는 제한 없이 기록하고,
  로그인 사용자는 계정 단위 중복 기록 방지만 유지한다.
- 기존 작업에는 S3 첨부파일 정규화와 보호 파일의 presigned redirect, 인증/계정
  활성화·비밀번호 재설정, 학생 명단 업로드 검증, 관리자·모바일 UI, GA4 환경변수,
  데이터 인덱스와 테스트 보강이 포함되어 있다.

## 2. 운영 변경 전 공통 절차

1. 변경 ticket에 대상 서버, 담당자, 시작·종료 시각, 영향 범위, 롤백 담당자를 기록한다.
2. 운영 쓰기를 중지하거나 점검 모드로 전환하고 현재 트래픽, 컨테이너, PM2,
   systemd, cron, 포트, 볼륨, 프록시 라우팅을 스냅샷한다.
3. `jshsus_v26` DB 논리 백업을 `--single-transaction --routines --triggers`로
   생성하고 별도 저장소에 복사한 뒤 SHA-256과 격리 복원을 확인한다.
4. S3 객체 목록·메타데이터·DB `files` 참조를 함께 보존한다. 참조 수를 확인하지 않은
   객체 삭제는 금지한다.
5. 변경 전후의 `/api/health`, 로그인, 게시글·첨부파일, 관리자 접근성, S3 접근,
   메일 발송 smoke test를 기록한다.
6. 모든 파괴적 변경은 최소 한 번의 dry-run과 복구 리허설 후 실행한다.

## 3. v26 서버 디렉터리 정리

### 3.1 인벤토리

현재 문서에 기록된 주요 경로는 `/home/ubuntu/Server/jshsus-web-v26`,
`/home/ubuntu/Server/nginx-proxy-manager`, `/home/ubuntu/Server/iam`,
`/home/ubuntu/Server/plma` 및 `/home/ubuntu/Server/backups`다. 실제 실행 전 다음
명령으로 현재 상태를 다시 확정한다.

```bash
sudo find /home/ubuntu/Server -maxdepth 2 -type d -print
docker compose ls
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Labels}}'
systemctl list-units --type=service --state=running
pm2 list
ss -lntup
```

`v26`이라는 이름만 보고 삭제하지 않는다. Compose project label, 컨테이너 mount,
포트와 NPM upstream을 실제로 대조한다.

### 3.2 통합 순서

1. 현재 활성 release가 가리키는 `deploy/.env`, compose manifest, image digest를
   별도 보존한다.
2. 중복된 v26 checkout·실패 release·사용하지 않는 로그만 먼저 보존 기간을 두고
   archive 디렉터리로 이동한다.
3. `jshsus-v26` Compose 서비스가 정상이고, NPM과 공유 네트워크가 그것만 가리키는지
   확인한 뒤 이전 v26 프로세스만 중지한다.
4. 최소 한 번의 관찰 기간 동안 문제가 없을 때 archive를 삭제한다. 백업·볼륨·NPM
   디렉터리는 애플리케이션 소스 정리와 분리한다.

기존 `jshsus.kr`, `points.jshsus.kr`, PM2 `plma`·`iam`·`OAuth`, NPM,
SpiceDB, Redis, MySQL은 v26 정리의 부수 대상이 아니다.

## 4. 마이그레이션 squash

1. 현재 production DB의 Drizzle journal, 적용 migration 목록, 실제
   `information_schema`를 비교해 drift를 먼저 고친다.
2. 현행 스키마에서 재현 가능한 baseline SQL과 checksum을 만들고, 빈 DB와 운영
   clone에 각각 적용한다.
3. 새 baseline은 기존 운영 DB에 바로 덮어쓰지 않는다. 운영에서는 현재 journal을
   유지하고, 새 baseline은 다음 major release 또는 신규 설치용으로 사용한다.
4. 전환이 필요하면 maintenance window에서 journal 기준점, 배포 이미지, 롤백
   baseline을 함께 고정한다.
5. squash 전 migration 파일과 snapshot/journal은 archive tag로 보존한다. 이미
   적용된 migration 파일을 조용히 수정하거나 삭제하지 않는다.

검증 기준은 빈 DB와 production clone의 테이블·인덱스·FK·기본값·행 수가 일치하고,
API smoke test 및 `pnpm db:migrations:check`가 통과하는 것이다.

## 5. 레거시 테이블·컬럼 제거

즉시 `DROP`할 목록을 추측하지 않는다. 다음 순서로 후보를 확정한다.

1. `rg`로 애플리케이션·스크립트·workflow의 읽기/쓰기 사용처를 찾고,
   `information_schema`에서 실제 행 수·최종 변경 시각·FK를 조회한다.
2. 후보를 `사용 중`, `호환 미러`, `읽기 전용 보존`, `미사용`으로 분류한다.
3. `users.student_no/grade/class_no/number/gender`, `auth_accounts`의 인증 호환
   컬럼처럼 아직 런타임에서 읽는 필드는 정규 테이블로 읽기를 전환한 뒤 최소 한 달
   불일치 감시를 거친다.
4. `reactions`처럼 사용처가 없는 후보도 행 수 0, 참조 0, 백업 복구 성공을 확인한
   별도 파괴 migration에서 제거한다.
5. 레거시 활동 보존 테이블과 기존 PHP 원본 DB는 신규 v26 정리 대상과 분리하고,
   보존기간·개인정보 파기 승인을 받은 뒤 별도 처리한다.

각 삭제는 expand/contract 방식으로 진행한다. 먼저 새 경로를 추가하고, 읽기 전환과
관찰을 끝낸 뒤에만 구 테이블·컬럼을 제거한다.

## 6. `deploy.sh` 정리

`deploy/deploy.sh`의 `cleanup_old_images`에 있는 전역
`docker image prune -f --filter 'until=168h'`는 제거한다. 이 명령은 v26과 무관한
이미지까지 지울 수 있다.

대신 다음 범위만 정리한다.

- 현재·이전 release digest는 보존한다.
- `ghcr.io/<namespace>/jshsus-{api,web,admin,migrate}`의 오래된 digest만
  명시적으로 삭제한다.
- 삭제 대상은 태그·Compose label·현재/이전 링크를 모두 확인한다.
- 디스크 부족 시 자동 전역 prune을 하지 말고 경고 후 운영자가 승인한다.
- 롤백이 가능한지 확인한 뒤 release별 보존 개수를 환경변수로 설정한다.

## 7. 외부 인프라 설정 변경

### Cloudflare

- `jshsus.kr`, `v26.jshsus.kr`, `admin-v26.jshsus.kr`, `auth.jshsus.kr` DNS와
  proxy 상태를 export한다.
- origin 인증서, SSL mode, 캐시·페이지 규칙, `/api` 캐시 우회, WebSocket/SSE,
  업로드 request size와 rate limit을 검토한다.
- 전환 전 낮은 TTL로 내리고, 전환 후 health check와 캐시 purge를 단계적으로 한다.

### Nginx Proxy Manager

- proxy host, upstream port, SSL 인증서, force SSL, custom locations,
  websocket/header 설정을 백업한다.
- UI/API 또는 공식 API로만 변경하고 NPM DB를 직접 수정하지 않는다.
- `v26`과 `admin-v26`만 새 upstream으로 바꾸고 기존 `jshsus.kr`·`points`는
  별도 change로 유지한다.

### AWS

- S3 `jshsus-uploads`의 region, block public access, bucket policy, CORS,
  lifecycle, versioning, server-side encryption을 확인한다.
- 게시글 첨부파일은 API의 권한 확인 후 presigned redirect로만 제공하고,
  UI 자산·프로필처럼 공개 가능한 자산과 prefix를 분리한다.
- API 실행 IAM은 필요한 S3 prefix의 `GetObject/PutObject/DeleteObject`만 허용하고,
  Cognito·SES·S3 자격 증명을 서로 재사용하지 않는다.
- SES 발신자/도메인 검증, sandbox 탈출, bounce/complaint 처리와 Sendon fallback을
  staging에서 검증한다.

### GitHub Actions

- Production environment secret/variable을 표로 export하고 만료·중복·미사용 값을
  제거한다.
- `S3_BUCKET=jshsus-uploads`, `AWS_REGION`, `VITE_GA_MEASUREMENT_ID`, Cognito,
  SES, Sendon, deploy SSH secret을 용도별로 분리한다.
- secret은 로그에 출력하지 않고, repository variable과 environment secret의
  우선순위를 workflow에서 명시한다.
- main 보호 규칙, required checks, production environment approval,
  concurrency와 rollback workflow를 확인한다.

## 8. 기존 서비스·프로세스·DB 변경 순서

1. 기존 PHP/PM2 서비스의 health, 포트, cron, 로그, DB 연결을 baseline으로 기록한다.
2. v26은 Compose project와 volume/network를 명시해 공유 서비스와 분리한다.
3. DB는 TLS/CA, 최소 권한 계정, 백업·복원, timezone/collation, connection pool,
   Redis persistence와 eviction을 확인한다.
4. S3·메일·Cognito 외부 연동을 staging에서 실제 왕복 검증한다.
5. Cloudflare → NPM → v26 web/admin/API 순서로 한 단계씩 전환하고 단계마다
   smoke test한다.
6. 문제가 있으면 DNS를 되돌리는 것이 아니라 먼저 NPM upstream과 release link를
   직전 digest로 되돌리고, 필요할 때만 DB 복원을 승인한다.

## 9. 완료 기준과 롤백

- 웹·관리자·인증 로그인, 계정 생성/비밀번호 재설정, 이메일·전화번호 인증,
  게시글·댓글·첨부파일, 기숙사·휴대폰 보관함, 관리자 주요 CRUD가 통과한다.
- 모바일/PC의 가로 overflow, 권한 없는 메뉴 노출, S3 공개 접근, GA4 측정 범위를
  확인한다.
- DB backup restore, S3 object restore, release rollback을 실제로 한 번 수행한다.
- 배포 후 24~72시간 동안 API 오류율, Redis/DB latency, S3/SES 실패, quota 초과,
  조회수 급증과 audit log를 관찰한다.
- 장애 시 v26 트래픽을 차단하고 직전 image digest·release env·compose manifest로
  복구한다. 레거시 DB와 서비스는 승인 전까지 보존한다.
