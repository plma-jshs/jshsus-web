# Cognito 외부 OIDC와 학생 계정 provisioning 운영 가이드

이 문서는 과구리 계정을 외부 서비스의 OIDC 로그인에 제공하고, 새학기 학생
명단을 Cognito 및 `auth_accounts`와 안전하게 동기화하는 운영 절차를 설명한다.
비밀번호, Cognito app client secret, 데이터베이스 접속 문자열은 이 문서나
workflow 로그에 기록하지 않는다.

## 1. 2026-07-30 확인 및 적용 결과

| 항목                 | 현재 값 또는 상태                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------ |
| AWS account          | `050314037822`                                                                                               |
| Region               | `ap-northeast-2`                                                                                             |
| User Pool            | `jshsus-v26-oidc`                                                                                            |
| User Pool ID         | `ap-northeast-2_tfhhioJZI`                                                                                   |
| Issuer               | `https://cognito-idp.ap-northeast-2.amazonaws.com/ap-northeast-2_tfhhioJZI`                                  |
| Discovery            | `https://cognito-idp.ap-northeast-2.amazonaws.com/ap-northeast-2_tfhhioJZI/.well-known/openid-configuration` |
| Managed login domain | `https://jshsus-auth-v26-050314037822.auth.ap-northeast-2.amazoncognito.com`                                 |
| 학생 속성            | mutable String `custom:studentNo`, 길이 1~20                                                                 |
| Labs OIDC client ID  | `2q66nkvov766fulfgm1f6g3ohh`                                                                                 |
| Labs redirect URI    | `https://labs.jshsus.kr/`                                                                                    |
| GitHub OIDC provider | `token.actions.githubusercontent.com`, audience `sts.amazonaws.com`                                          |
| GitHub Actions role  | `arn:aws:iam::050314037822:role/jshsus-github-cognito-provisioning`                                          |
| GitHub environment   | `cognito-provisioning`, 배포 branch `main`만 허용                                                            |

기존 `jshsus-v26` pool(`ap-northeast-2_hqOzDeD5R`)에는 테스트 사용자 `9999`와
내부 app client 하나만 남아 있었다. 새 pool 전환, `9999` 비밀번호 재설정,
실제 로그인 E2E를 확인한 뒤 2026-07-30에 기존 pool과 할당 도메인을 삭제했다.
새 pool의 과구리 Web·Admin 내부 BFF client와 Labs 외부 OIDC client는 서로
분리되어 있으며, 외부 OIDC 설정은 Labs client에만 적용한다.
운영 API의 `jshsus-cognito-backend-policy`도 새 pool ARN에 대해서만
`AdminCreateUser`, `AdminGetUser`, `AdminSetUserPassword`,
`AdminUpdateUserAttributes`를 허용하도록 축소했다. 교체 과정에서 만든 구
액세스 키는 삭제하고 운영에 배포된 키 하나만 남겼다.

전체 active 학생 212명에 대한 apply 후 같은 입력으로 dry-run한 결과는
`Already complete: 212`였으며 추가 AWS/DB 변경은 없었다. 테스트 계정 `9999`는
`include_test_account=true`를 명시한 단일 apply로만 생성·연결했고, 새 pool에서
상태가 `확인됨`인 것과 과구리 학생 포털 로그인까지 확인했다.

### 학번 변경 대응 적용 결과

새 pool은 다음 권장 구성을 적용했다.

1. canonical username은 최초 provisioning 시점의 학번 문자열로 생성한다.
2. `preferred_username`을 로그인 alias로 활성화한다.
3. `preferred_username`과 `custom:studentNo`에는 현재 학번을 저장한다.
4. 학번 변경 시 두 속성만 갱신하고 DB 연결은 기존 Cognito `sub`를 유지한다.

스크립트는 pool schema를 실행 전에 검사한다. alias가 없는 구 pool에서 이미 연결된
학생의 학번 변경을 발견하면 새 사용자를 만들지 않고 안전하게 실패한다. 신규
provisioning은 새 pool만 사용한다.

## 2. 외부 서비스용 OIDC

### 친구 서비스에 전달할 연결 정보

서비스 담당자에게 다음 연결표를 제공한다. client secret은 비밀 관리 도구나
별도 보안 채널로만 전달한다.

| 설정           | 값                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| Issuer         | `https://cognito-idp.ap-northeast-2.amazonaws.com/ap-northeast-2_tfhhioJZI`                                  |
| Discovery URL  | `https://cognito-idp.ap-northeast-2.amazonaws.com/ap-northeast-2_tfhhioJZI/.well-known/openid-configuration` |
| Response type  | `code`                                                                                                       |
| Grant          | Authorization Code                                                                                           |
| Scopes         | `openid email profile`                                                                                       |
| PKCE           | `S256` 권장                                                                                                  |
| Client ID      | `2q66nkvov766fulfgm1f6g3ohh`                                                                                 |
| Client secret  | 서버 측 confidential client에만 저장                                                                         |
| Redirect URI   | `https://labs.jshsus.kr/`                                                                                    |
| 사용자 연결 키 | `(issuer, sub)`                                                                                              |

authorization, token, JWKS, userinfo endpoint는 문자열을 하드코딩하지 말고
Discovery 문서에서 읽는다. redirect URI는 scheme, host, path, trailing slash까지
완전히 일치해야 한다.

### 외부 app client 생성 체크리스트

친구 서비스의 정확한 redirect URI를 받은 뒤 Cognito 콘솔에서 별도 app client를
만든다.

1. 이름은 `external-<service-name>`처럼 소유자가 드러나게 정한다.
2. traditional web application/confidential client와 client secret을 사용한다.
3. Authorization Code grant만 활성화하고 implicit grant는 끈다.
4. scope는 `openid`, `email`, `profile`만 허용한다.
5. callback URL은 전달받은 정확한 HTTPS URI만 등록한다.
6. read attributes는 `email`, `name`, `custom:studentNo`만 허용한다.
7. 외부 client의 write attributes는 허용하지 않는다.
8. 기존 내부 Web/Admin client secret을 재사용하거나 공유하지 않는다.
9. 서비스 종료 또는 secret 노출 시 해당 client secret을 회전하거나 client를
   폐기한다.

OIDC/JWT 동작에 필요한 `iss`, `aud`, `exp`, `iat`, `token_use` 및 Cognito의
프로토콜 claim은 남을 수 있다. 애플리케이션 사용자 속성으로 제공하는 값은
`sub`, `email`, `name`, `custom:studentNo`로 제한한다. Cognito group을
roles/permissions 저장소로 사용하지 않고 provisioning role에도 group 변경
권한을 주지 않는다. 외부 서비스의 권한은 외부 서비스 자체 DB에서 `(issuer,
sub)`를 기준으로 관리한다.

현재 과구리 계정 활성화 코드는 입력된 이메일을 Cognito에 기록하되
`email_verified=true`를 임의로 설정하지 않는다. 외부 서비스는 별도 검증 정책이
완료되기 전까지 `email` claim이 있다는 이유만으로 이메일 소유권을 가정하면 안 된다.

### `custom:studentNo`와 app client read attributes

새 pool에는 다음 조건으로 속성을 생성했다.

- Name: `studentNo` (API/JWT 이름은 `custom:studentNo`)
- Type: String
- Mutable: true
- Minimum length: 1
- Maximum length: 20

`email`은 mutable이지만 필수 속성은 아니다. 2026-07-29 active 재학생 212명 중
55명은 아직 이메일이 없으므로, 명단 provisioning 단계에는 이름과 학번만 넣고
계정 활성화에서 학생이 입력한 이메일을 추가한다.

새 pool을 만들 때도 같은 조건을 사용한다. custom attribute는 삭제하거나 이름을
바꾸기 어렵기 때문에 대소문자를 포함해 `studentNo`를 그대로 사용한다.

App integration에서 해당 외부 app client를 열고 attribute permissions의 read
목록을 `email`, `name`, `custom:studentNo`로 제한한다. 설정 후 테스트 로그인의
ID token을 검증하여 값이 보이는지, `cognito:groups`나 내부 권한 claim이 없는지
확인한다. token 원문이나 client secret은 이슈, 채팅, 로그에 붙이지 않는다.

## 3. GitHub Actions OIDC

workflow는 [`.github/workflows/provision-cognito-students.yml`](../../.github/workflows/provision-cognito-students.yml)을
사용한다. `AWS_ACCESS_KEY_ID`와 `AWS_SECRET_ACCESS_KEY`는 사용하지 않는다.
job의 `id-token: write` 권한으로 GitHub OIDC token을 받고 AWS role을 짧게
assume한다.

### IAM OIDC provider

- Provider URL: `https://token.actions.githubusercontent.com`
- Audience: `sts.amazonaws.com`

### Role trust policy

GitHub environment를 사용하는 job의 OIDC `sub`는 branch 형식이 아니라 environment
형식이다. 그래서 IAM trust는 정확한 repo와 environment를 고정하고, branch는
GitHub environment 배포 정책과 workflow의 `GITHUB_REF` 검사로 이중 제한한다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::050314037822:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:plma-jshs/platform:environment:cognito-provisioning"
        }
      }
    }
  ]
}
```

### Role permissions policy

권한은 지정한 한 User Pool에만 적용된다. 사용자 삭제, 비밀번호 설정, group 관리,
다른 AWS 서비스 권한은 포함하지 않는다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ProvisionStudentsInOnePool",
      "Effect": "Allow",
      "Action": [
        "cognito-idp:AdminCreateUser",
        "cognito-idp:AdminGetUser",
        "cognito-idp:AdminUpdateUserAttributes",
        "cognito-idp:DescribeUserPool",
        "cognito-idp:ListUsers"
      ],
      "Resource": "arn:aws:cognito-idp:ap-northeast-2:050314037822:userpool/ap-northeast-2_tfhhioJZI"
    }
  ]
}
```

### GitHub environment 값

`cognito-provisioning` 환경에는 다음 값이 필요하다.

| 종류     | 이름                                | 값 또는 처리                    |
| -------- | ----------------------------------- | ------------------------------- |
| variable | `AWS_REGION`                        | `ap-northeast-2`                |
| variable | `COGNITO_USER_POOL_ID`              | `ap-northeast-2_tfhhioJZI`      |
| variable | `AWS_COGNITO_PROVISIONING_ROLE_ARN` | 위 role ARN                     |
| variable | `DATABASE_SSL_MODE`                 | `required`                      |
| secret   | `COGNITO_PROVISIONING_DATABASE_URL` | provisioning 전용 DB 사용자 URL |

앞의 네 variable과 `main` branch 제한을 설정했고
`COGNITO_PROVISIONING_DATABASE_URL`도 `jshsus_v26` schema로 등록했다. 등록된
전용 계정 `jshsus_cognito_provisioner`와 TLS 연결로 필수 테이블, locking read,
advisory lock, active 재학생 212명 조회를 검증했다. 계정에는 다음 권한만 부여했다.

- roster와 사용자 조회: `users`, `students`, `student_enrollments`, `school_years`
- Cognito 연결 조회/추가: `auth_accounts`
- transaction locking read용 `LOCK TABLES`와 MySQL advisory lock 사용

스키마 metadata 조회가 필요하므로 해당 DB schema의 `information_schema` metadata를
조회할 수 있어야 한다. 일반 애플리케이션 DB 계정을 그대로 재사용하지 않는다.

## 4. 새학기 학생 provisioning

### 데이터 선택 규칙

현재 스키마에서는 다음 조건을 모두 만족하는 학생만 선택한다.

- `school_years.is_active = 1`
- `student_enrollments.student_enrollment_status = 'active'`
- 연결된 `users.user_status = 'active'`
- `students.user_id`로 실제 사용자와 연결됨

현재 학적 스키마가 존재하면 활성 학생이 0명이어도 더 느슨한
`students`/`users` fallback을 사용하지 않는다. fallback은 구형 스키마 호환을 위해
학적 테이블 또는 필수 column이 아예 없을 때만 사용한다.

### 보호 규칙

- Cognito login username은 현재 학번 문자열이다.
- Cognito에는 `email`(DB에 있을 때), `name`, `custom:studentNo`만 관리한다.
- Cognito의 불변 `sub`를 `auth_accounts(provider='cognito')`의
  `provider_account_id`에 저장한다.
- legacy password hash와 password algorithm은 읽거나 복사하거나 갱신하지 않는다.
- `9999`는 active enrollment가 없어도 `include_test_account=true`를 명시한
  실행에서만 `users`에서 별도로 읽어 포함한다.
- `9988`은 항상 거부하고 `강재환` legacy bridge 후보는 bulk 대상에서 제외한다.
- provisioning workflow는 사용자 삭제, legacy 계정 보존용 갱신, group/role 변경을
  하지 않는다.

### 실행 순서

1. 관리자 화면에서 새학기 명단을 preview한 뒤 적용한다.
2. 활성 학년도와 업로드 결과의 생성/변경/졸업 수를 확인한다.
3. GitHub Actions의 **Provision Cognito students**를 `main`에서 실행한다.
4. 먼저 `apply=false`, `scope=student`, `student_no=<파일럿 학번>`으로 dry-run한다.
5. 파일럿 결과가 `create_and_link`, `sync_and_link`, `sync_attributes`,
   `no_op` 중 예상한 상태인지 확인한다.
6. `apply=true`로 같은 파일럿을 실행하고 Cognito `sub`와 DB 연결을 확인한다.
7. `scope=all-active`, `apply=false`로 전체 건수와 제외 건수를 확인한다.
8. 결과가 명단과 일치할 때만 `scope=all-active`, `apply=true`를 실행한다.
9. 같은 입력으로 다시 dry-run해 모든 정상 대상이 `no_op`인지 확인한다.

CLI에서도 같은 스크립트를 사용할 수 있다.

```bash
# 단일 학생 dry-run
pnpm --filter @jshsus/db db:provision-cognito-students -- --student-no 1101

# 전체 active 학생 dry-run
pnpm --filter @jshsus/db db:provision-cognito-students

# 확인한 pool에 전체 적용
pnpm --filter @jshsus/db db:provision-cognito-students -- \
  --apply \
  --confirm-pool-id "$COGNITO_USER_POOL_ID"
```

`--apply`로 새 사용자를 만들 때마다 서로 다른 24자 임시 비밀번호를 메모리에서
생성하고 `MessageAction=SUPPRESS`로 초대 메시지를 보내지 않는다. 임시 비밀번호는
출력하거나 저장하지 않으며 운영자도 복구할 수 없다. 학생은 기존 계정 활성화
코드 흐름에서 본인 이메일, 이름, 새 비밀번호를 입력한다. API는 이미 생성된
Cognito 사용자를 찾아 영구 비밀번호와 관리 속성을 갱신한다.

파일럿에서 Cognito 자체 `NEW_PASSWORD_REQUIRED` 동작을 시험해야 할 때만 단일
학생 실행에 `--temporary-password-env <ENV_NAME>`을 사용할 수 있다. 전체 실행에는
고정 임시 비밀번호를 사용할 수 없다.

### DB 확인 쿼리

활성 명단과 Cognito 연결 상태:

```sql
SELECT
  sy.year AS school_year,
  se.student_no,
  s.name,
  u.id AS user_id,
  aa.provider_account_id AS cognito_sub
FROM student_enrollments se
JOIN school_years sy
  ON sy.year = se.school_year
 AND sy.is_active = 1
JOIN students s ON s.id = se.student_id
JOIN users u
  ON u.id = s.user_id
 AND u.user_status = 'active'
LEFT JOIN auth_accounts aa
  ON aa.user_id = u.id
 AND aa.provider = 'cognito'
WHERE se.student_enrollment_status = 'active'
ORDER BY se.student_no;
```

연결 누락 또는 중복 확인:

```sql
SELECT
  u.id AS user_id,
  se.student_no,
  COUNT(aa.id) AS cognito_link_count
FROM student_enrollments se
JOIN school_years sy
  ON sy.year = se.school_year
 AND sy.is_active = 1
JOIN students s ON s.id = se.student_id
JOIN users u
  ON u.id = s.user_id
 AND u.user_status = 'active'
LEFT JOIN auth_accounts aa
  ON aa.user_id = u.id
 AND aa.provider = 'cognito'
WHERE se.student_enrollment_status = 'active'
GROUP BY u.id, se.student_no
HAVING COUNT(aa.id) <> 1;
```

`provider_account_id`에는 학번이 아니라 Cognito `sub`가 있어야 한다.

## 5. 장애와 재실행

스크립트는 기본 dry-run이고 `--apply`에는 정확한 User Pool ID 재확인이 필요하다.
한 번에 하나만 실행되도록 GitHub concurrency와 MySQL advisory lock을 함께 사용한다.
각 DB link는 transaction 안에서 충돌을 재검사한다.

중간에 실패하면 이미 생성된 Cognito 사용자나 완료된 DB link를 자동 삭제하지
않는다. 원인을 해결한 뒤 같은 명령을 다시 실행하면 기존 사용자를 조회하고
부족한 속성 또는 DB link만 보완한다. 자동 rollback 목적으로 사용자를 삭제하면
학생이 이미 설정한 비밀번호나 외부 서비스의 `(issuer, sub)` 연결을 잃을 수 있으므로
삭제는 별도 승인된 복구 절차로만 수행한다.
