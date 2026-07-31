# DB 백업·개인정보 파기 자동화 운영

## 구성

- CloudFormation: `infra/aws/backup-and-privacy-operations.yml`
- 백업 workflow: `.github/workflows/database-backup.yml`
- 파기 workflow: `.github/workflows/privacy-retention.yml`
- 기본 리전: `ap-northeast-2`
- 백업 버킷: `jshsus-v26-db-backups-050314037822`
- GitHub OIDC role: `JshsusGitHubPrivacyOperationsRole`

AWS 장기 Access Key는 workflow에서 사용하지 않는다. GitHub가 발급한 단기 OIDC
토큰으로 role을 Assume하며 trust policy는
`plma-jshs/jshsus-web`의 `database-backup` 및 `privacy-operations`
environment subject만 허용한다.

## AWS 선행 조건

AWS 계정에 GitHub Actions OIDC provider가 한 번만 등록되어 있어야 한다.

- Provider URL: `https://token.actions.githubusercontent.com`
- Audience: `sts.amazonaws.com`

스택 배포 예시:

```bash
aws cloudformation deploy \
  --region ap-northeast-2 \
  --stack-name jshsus-backup-privacy-operations \
  --template-file infra/aws/backup-and-privacy-operations.yml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    CognitoUserPoolId=ap-northeast-2_tfhhioJZI
```

스택은 다음을 만든다.

- Public Access Block과 `aws/s3` KMS 기본 암호화가 적용된 전용 S3 버킷
- 생성 후 30일에 객체를 삭제하는 Lifecycle
- 두 GitHub environment만 Assume할 수 있는 최소 권한 IAM role
- 백업 경로에 대한 S3 쓰기, 확정 User Pool에 대한 계정 파기, CloudWatch/ECR
  보존정책 적용 권한

백업 파일명은 매번 달라 version history가 필요하지 않다. 버킷 versioning은
Suspended 상태로 두고, 과거 noncurrent version이 있다면 1일 후 제거한다.

## DB 전용 계정

서버의 `root` 계정을 GitHub Secret에 저장하지 않는다. 아래 예시에서 비밀번호는
각각 충분히 긴 무작위 값으로 생성해 Secret에만 저장한다.

```sql
CREATE USER 'jshsus_backup'@'%' IDENTIFIED BY '<random-backup-password>' REQUIRE SSL;
GRANT SELECT ON jshsus.* TO 'jshsus_backup'@'%';

CREATE USER 'jshsus_privacy'@'%' IDENTIFIED BY '<random-privacy-password>' REQUIRE SSL;
GRANT SELECT, INSERT, UPDATE, DELETE ON jshsus.* TO 'jshsus_privacy'@'%';
```

두 계정에는 `CREATE`, `ALTER`, `DROP`, `GRANT OPTION`을 부여하지 않는다. 가능한
경우 DB 방화벽에서 GitHub-hosted runner 대신 고정 egress를 가진 self-hosted
runner 또는 별도 실행 호스트만 허용한다.

## GitHub environments

`database-backup`:

| 종류     | 이름                      | 값                              |
| -------- | ------------------------- | ------------------------------- |
| Secret   | `BACKUP_DATABASE_URL`     | backup 전용 MySQL URL           |
| Variable | `AWS_OPERATIONS_ROLE_ARN` | 스택 output `OperationsRoleArn` |
| Variable | `AWS_REGION`              | `ap-northeast-2`                |
| Variable | `DATABASE_BACKUP_BUCKET`  | 스택 output `BackupBucketName`  |
| Variable | `DATABASE_SSL_MODE`       | `required`                      |

`privacy-operations`:

| 종류     | 이름                      | 값                              |
| -------- | ------------------------- | ------------------------------- |
| Secret   | `PRIVACY_DATABASE_URL`    | privacy 전용 MySQL URL          |
| Variable | `AWS_OPERATIONS_ROLE_ARN` | 스택 output `OperationsRoleArn` |
| Variable | `AWS_REGION`              | `ap-northeast-2`                |
| Variable | `COGNITO_USER_POOL_ID`    | 운영 User Pool ID               |
| Variable | `DATABASE_SSL_MODE`       | `required`                      |

두 environment의 deployment branch는 `main`만 허용한다. 정책 승인은
`privacy_retention_policies.approval_reference`에 기록되므로 매일 실행되는
schedule에 수동 승인을 걸지 않는다. 정책 변경이나 수동 apply는 시스템 관리자 또는
정보보호 담당 교사 1인이 검토한다.

## 최초 전환 순서

1. CloudFormation 스택과 DB 전용 계정을 만든다.
2. GitHub environment 변수·Secret을 저장한다.
3. `Database backup`을 수동 실행한다.
4. S3 객체의 KMS 암호화, SHA-256 metadata, 크기와 생성 시각을 확인한다.
5. 새 빈 DB에 백업 복구 검증을 수행한다.
6. `Privacy retention`을 `apply=false`로 수동 실행해 대상 건수를 확인한다.
7. 예상 건수와 일치할 때만 `apply=true`를 한 번 수동 실행한다.
8. 이후 daily schedule을 운영한다.

백업 복구 검증은 운영 DB에 덮어쓰지 않는다. 새 격리 DB에만 복원하고 테이블 수,
핵심 행 수, 마이그레이션 timeline, 애플리케이션 read-only smoke test를 확인한 뒤
검증 DB를 폐기한다.

## 장애 대응

- 백업 실패: 파기 workflow를 수동 중단하고 먼저 백업을 복구한다.
- Cognito 처리 실패: DB 계정은 차단 상태를 유지하며 다음 daily run이 재시도한다.
- 일부 DB 파기 실패: 성공한 범주는 되돌리지 않고 `failed` job의 비식별 오류 코드로
  원인을 수정한 뒤 idempotent하게 재실행한다.
- 대상 건수가 예상보다 크면 apply하지 말고 학적 상태, 각 기록의 활동일과 정책
  테이블부터 확인한다.

레거시 PHP 서버의 중지·삭제는 이 자동화의 범위가 아니다.
`PRIVACY_DATABASE_URL`에는 새 DB만 허용하며, 파기 스크립트는
`jshsus-php.jshsus.kr` 대상 연결을 명시적으로 거부한다.
