# Legacy data migration plan

## 1. 목적과 적용 범위

이 문서는 기존 `plma` 데이터베이스에서 신규 `jshsus_v26` 데이터베이스로 필요한 데이터만 선별 이관하기 위한 기준을 정의한다.

이관의 목표는 기존 데이터베이스를 복제하는 것이 아니다. 현재 애플리케이션에서 실제로 사용하는 인증, 사용자, 상벌점, 기숙사 방, 보관함 현재 상태만 가져오고, 사용하지 않는 기능·과거 연동 정보·불명확한 데이터는 제외한다.

이 문서의 건수는 2026-07-11 읽기 전용 조사 시점의 기준값이다. 최종 이관 전에 동일한 집계 검사를 다시 실행하고, 값이 달라졌다면 새 기준 manifest를 만든 뒤 승인해야 한다.

## 2. 안전 원칙

- 레거시 데이터베이스에는 읽기 전용 계정으로만 접속한다.
- 이관 작업은 GitHub 자동 배포와 분리된 수동 release 작업으로 실행한다.
- 원본 dump, 사용자 행, 비밀번호 hash, 연락처 등 개인정보를 저장소나 CI artifact에 남기지 않는다.
- 로그에는 테이블별 건수, 검증 결과, 익명화된 checksum만 기록한다.
- 최초 연습은 매번 새 staging 데이터베이스에서 수행한다.
- 운영 데이터베이스에서 `TRUNCATE`, 전체 테이블 초기화 또는 외래키 검사 비활성화를 수행하지 않는다.
- migration과 canonical seed를 먼저 적용한 뒤 allowlist 데이터만 추가한다.
- 역할, permission, 게시판 seed는 레거시 데이터로 덮어쓰지 않는다.
- 원본 시스템은 전환과 검증이 끝날 때까지 변경하지 않고 유지한다.
- 모든 관련 레거시 테이블은 InnoDB이므로 읽기 전용 `REPEATABLE READ` transaction으로 일관된 snapshot을 만든다.

## 3. 기존 importer 사용 금지

현재 `packages/db/scripts/import-legacy-dump.cjs`는 실 운영 데이터 이관에 사용하면 안 된다.

주요 원인은 다음과 같다.

- importer는 `users`, `students`, `points`, `reasons`, `cases`, `case_schedules` 같은 복수형 테이블을 기대하지만, 실 데이터는 `iam`, `user`, `teacher`, `history`, `reason`, `case_status`, `case_schedule`로 구성되어 있다.
- 첫 번째 `INSERT INTO ... VALUES ...;` 문만 정규식으로 읽기 때문에 여러 INSERT 문이나 컬럼 목록이 포함된 dump를 완전하게 처리하지 못한다.
- 기본 동작이 사용자·권한·청원·탐활서 등 광범위한 target 테이블을 `TRUNCATE`한다.
- MySQL의 `TRUNCATE`는 transaction rollback으로 복구되지 않으므로, importer의 rollback 구조가 데이터 삭제를 보호하지 못한다.
- 테이블명이 맞지 않으면 source 건수가 0으로 해석된 상태에서 target만 비울 수 있다.
- source의 서로 다른 `iam.id`, `user.id`, `teacher.id`를 같은 사용자 ID처럼 취급할 수 있다.

대체 importer는 dump 정규식 parser가 아니라 source와 target에 각각 연결하는 allowlist ETL로 새로 작성한다. 기존 importer를 삭제하거나 fail-fast로 비활성화하기 전까지 package script에서도 호출하지 않는다.

## 4. 이관 allowlist

### 4.1 필수 이관

| Source table  | 허용 source columns                                                                                                                        | Target                    | 변환 규칙                                                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `iam`         | `id`, `stuid`, `name`, `password`, `restricted`, `jshsus`                                                                                  | `users`, `auth_accounts`  | `stuid`를 identity join key로 사용한다. `id`는 `legacy_iam_id`, `jshsus`는 `legacy_jshsus_id`로 보존한다. 비밀번호는 `legacy-sha512`로 표시하고 로그인 성공 시 Argon2id로 재해시한다. |
| `user`        | `id`, `stuid`, `name`, `grade`, `class`, `num`, `plus`, `minus`, `dpc`                                                                     | `users`, `students`       | `id`는 `legacy_student_id`, `stuid`는 `student_no`로 보존한다. `current_point = plus - minus`로 설정한다.                                                                             |
| `teacher`     | `id`, `stuid`, `name`, `job`, `dpc`                                                                                                        | `users`, `staff_profiles` | `id`는 상벌점 actor 변환에만 사용하고, identity는 `stuid`로 연결한다. `job`의 target 필드는 정책 확정 후 적용한다.                                                                    |
| `reason`      | `id`, `title`, `plus`, `minus`, `dpc`                                                                                                      | `point_reasons`           | `plus > 0`은 `PLUS`와 양수, `minus > 0`은 `MINUS`와 음수, 둘 다 0이면 `ETC`와 0으로 변환한다. `is_active = (dpc = 0)`이다.                                                            |
| `history`     | `id`, `date`, `teacher`, `user`, `beforeplus`, `beforeminus`, `afterplus`, `afterminus`, `reason`, `reason_caption`, `act_date`, `display` | `point_records`           | 학생은 `history.user -> user.stuid`, 교사는 `history.teacher -> teacher.id -> teacher.stuid -> users` 순서로 연결한다. 점수 공식과 날짜 규칙은 6절을 따른다.                          |
| `dorm_rooms`  | `id`, `name`, `capacity`, `grade`, `dorm_name`                                                                                             | `dorm_rooms`              | 두 기숙사 enum, 학년, 정원을 검증한 뒤 그대로 이관한다.                                                                                                                               |
| `case_status` | `id`, `status`, `updatedAt`                                                                                                                | `device_cases`            | `is_open = (status = 1)`, `last_seen_at = updatedAt`로 설정한다. source에는 신뢰할 연결 상태가 없으므로 `is_connected = false`로 시작한다.                                            |

### 4.2 정책 승인 시에만 이관

| Source             | Columns                                                  | 조건                                                                                                                           |
| ------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `iam` 연락처       | `phone`, `email`                                         | 실제 계정 관리 또는 연락 기능에 필요하다고 확인된 경우에만 이관한다. 기본안은 제외다.                                          |
| `case_history`     | `id`, `operatedBy`, `operatedAt`, `affected`, `statusTo` | 현재 target schema로는 broadcast와 actor 누락을 표현할 수 없다. 별도 `legacy_device_events` schema가 승인된 경우에만 이관한다. |
| 별도 콘텐츠 source | 별도 조사 필요                                           | 공지·게시판·청원·분실물의 원본과 보존 범위를 별도로 확정한 경우에만 별도 작업으로 이관한다.                                    |

### 4.3 명시적으로 사용하지 않는 source columns

다음 값은 현재 기능에 필요하지 않거나 의미가 불명확하거나 보안상 복제하면 안 되므로 가져오지 않는다.

- `iam.code`
- `iam.plma`: 140건이 채워져 있지만 `user.id`와 일치하는 건이 0건이므로 의미를 추정해 연결하지 않는다.
- `iam.cms_id`, `iam.cms_password`
- `iam.pass`
- `iam.naju_id`
- `iam.phone_verified`
- `iam.newID`
- `iam.gender`: 현재 구현 기능에서 사용하지 않는다.
- `user.code`, `user.maeso`, `user.gisu`, `user.gender`, `user.phone_number`
- `teacher.password`: 인증 정보는 `iam.password`를 source of truth로 사용한다.
- `teacher.level`, `teacher.manage`, `teacher.permission`: 신규 역할·permission 정책으로 대체한다.
- `history.sum`, `history.aftersum`: 검증 보조값으로만 읽고 target에는 복사하지 않는다.
- `case_status.name`, `case_status.updatedBy`: 현재 target 도메인에 대응 필드가 없다.

## 5. 제외 대상

| Source table/domain               |   조사 건수 | 처리           | 근거                                                                                                                     |
| --------------------------------- | ----------: | -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `case_history`                    |       8,481 | 기본 이관 제외 | 4,183건이 broadcast이고 518건은 actor를 연결할 수 없다. 현재 `device_case_commands`는 단일 장치와 필수 actor를 요구한다. |
| `case_schedule`                   |           4 | 제외           | source는 반복 cron이고 target은 단일 실행 시각이어서 의미가 다르다. 장치 gateway가 확정된 뒤 수동 재설정한다.            |
| `dorm_users`                      |           0 | 제외           | 이관할 배정이 없다.                                                                                                      |
| `dorm_reports`                    |           0 | 제외           | 이관할 민원이 없다.                                                                                                      |
| `songs`                           |         989 | 제외           | 현재 API와 화면에 활성화된 기상곡 신청 기능이 없다.                                                                      |
| `tamhwal`                         |           0 | 제외           | 이관할 탐활서가 없다.                                                                                                    |
| `tamhwal_avail`                   |           0 | 제외           | 이관할 가용 시간 데이터가 없다.                                                                                          |
| `tamhwal_category`                |           0 | 제외           | 이관할 분류 데이터가 없다.                                                                                               |
| `tamhwal_notice`                  |           0 | 제외           | 이관할 안내 데이터가 없다.                                                                                               |
| `tamhwal_room`                    |           0 | 제외           | 이관할 장소 데이터가 없다.                                                                                               |
| `audit_log`                       |           0 | 제외           | 신규 시스템의 감사 로그는 전환 이후부터 새로 기록한다.                                                                   |
| `iam_permission`                  |           2 | 제외           | 의미와 구조가 신규 permission model과 다르다.                                                                            |
| `iam_permissions`                 |          37 | 제외           | 신규 canonical permission seed를 사용한다.                                                                               |
| `iam_user_permissions`            |           0 | 제외           | 사용자별 이관 대상 permission이 없다.                                                                                    |
| `rx_*`                            |      비대상 | 제외           | 현재 구현 도메인이 아니며 이관 근거가 없다.                                                                              |
| 동아리·장비·투표·행사 관련 테이블 |      비대상 | 제외           | 현재 출시 범위가 아니며 target schema와 API가 없다.                                                                      |
| 공지·게시판·댓글·청원·분실물      | source 없음 | 별도 이관      | `plma`에 대응 source table이 없다. 신규 서비스에서는 seed된 게시판 외 콘텐츠를 빈 상태로 시작한다.                       |

제외는 레거시 DB에서 행이나 테이블을 삭제한다는 뜻이 아니다. 신규 DB로 복제하지 않고, 보존 기간 동안 기존 DB를 읽기 전용 archive로 유지한다는 뜻이다.

## 6. 상세 변환 규칙

### 6.1 사용자와 인증

identity는 source table의 자체 ID가 아니라 `stuid`로 결합한다. `iam.id`, `user.id`, `teacher.id`는 서로 같은 ID 공간이 아니다.

현재 snapshot의 관계는 다음과 같다.

- `iam`: 256명
- 학생 profile: 212명
- 교직원 profile: 22명
- 학생 또는 교직원 profile의 고유 identity: 230명
- 학생과 교직원 profile을 모두 가진 identity: 4명
- profile과 연결되지 않는 IAM identity: 27명
- IAM과 연결되지 않는 교직원 profile: 1명
- IAM과 연결되지 않는 학생 profile: 0명

기본 이관 정책은 다음과 같다.

1. 학생 또는 교직원 profile이 있는 230명만 `users`에 만든다.
2. IAM과 연결되는 229명만 `auth_accounts`를 만든다.
3. IAM이 없는 교직원 1명은 profile만 만들고 password account를 만들지 않는다.
4. profile이 없는 IAM 27명은 가져오지 않는다.
5. 학생·교직원 양쪽에 해당하는 4명에게는 두 역할을 모두 부여한다.
6. 학생 profile에는 `student`, 교직원 profile에는 `teacher` 역할을 부여한다.
7. 시스템 관리자, 학생부장, 학생회 역할은 ETL이 추정하지 않고 승인된 운영 allowlist로 별도 부여한다.
8. `restricted != 0`, `user.dpc != 0`, `teacher.dpc != 0`이 최종 snapshot에서 발견되면 상태 변환 정책에 따라 `restricted` 또는 비로그인 상태로 처리한다. 현재 snapshot에는 해당 건이 없다.

현재 256개 IAM 비밀번호는 모두 SHA-512 Base64 형식 검사를 통과했다. importer는 hash 문자열을 로그에 출력하지 않으며, 형식이 맞지 않는 행이 하나라도 발견되면 적용을 중단한다.

### 6.2 상벌점 사유

source 사유 86건의 현재 분류는 다음과 같다.

- 활성 사유: 55건
- 상점 전용: 9건
- 벌점 전용: 75건
- 0점 또는 기타: 2건
- 상점과 벌점이 동시에 지정된 사유: 0건

source 사유 86건 외에 다음 5개 synthetic 사유를 target에 만든다.

- 레거시 사유 누락 상점
- 레거시 사유 누락 벌점
- 레거시 사유 누락 0점
- 레거시 상점 기초 잔액
- 레거시 벌점 기초 잔액

synthetic 사유는 과거 기록 연결 전용이므로 모두 비활성으로 만든다. 관리자 화면에서 신규 상벌점 사유로 선택할 수 없어야 한다.

### 6.3 상벌점 기록

각 history의 실제 점수는 다음 공식으로 계산한다.

```text
point = (afterplus - beforeplus) - (afterminus - beforeminus)
```

source `history.reason`이 현재 `reason.id`를 참조하면 변환된 해당 사유를 연결한다. 참조가 없거나 삭제된 사유이면 점수 부호에 맞는 synthetic 누락 사유를 연결하고, `reason_caption`을 `point_records.comment`에 보존한다.

현재 source 기록은 다음과 같다.

- 전체: 6,467건
- 양수: 4,282건
- 음수: 2,107건
- 0점: 78건
- 현재 reason과 연결되지 않는 기록: 5,619건
  - 양수: 4,136건
  - 음수: 1,481건
  - 0점: 2건
- 학생 참조 오류: 0건
- 교직원 참조 오류: 0건
- 숨김 또는 취소를 의미할 수 있는 `display = 0`: 0건
- 빈 `reason_caption`: 0건

`act_date`는 모든 행이 연도로 시작하며 다음 두 형태로 구성되어 있다.

- 날짜만 있는 형식: 212건
- 날짜와 시간이 함께 있는 형식: 6,255건

`base_date`는 `act_date`의 앞 10자리 날짜를 사용한다. `created_at`과 `updated_at`은 source `history.date`를 사용한다. `history.date`가 없는 행은 현재 없으며, 최종 snapshot에서 발견되면 import를 중단한다.

`history.aftersum`은 123건이 source의 `afterplus - afterminus`와 일치하지 않으므로 이관 값으로 사용하지 않는다.

### 6.4 기초 잔액

모든 학생의 최신 history 잔액은 현재 `user.plus`, `user.minus`와 일치한다. 다만 history delta를 처음부터 합산하면 과거 이력 누락으로 인해 다음 기초 잔액 차이가 존재한다.

- 상점 기초 잔액 필요: 31건
- 벌점 기초 잔액 필요: 6건
- 음수 방향의 비정상 기초 잔액: 0건

각 차이에 대해 해당 학생의 첫 기록보다 하루 앞선 날짜로 synthetic 기초 잔액 기록을 만든다. 이렇게 해야 신규 시스템의 기록 합계가 source의 상점·벌점 합계와 각각 일치한다.

### 6.5 기숙사

현재 이관 대상은 유효한 방 44개뿐이다.

- 허용되지 않은 기숙사명: 0건
- 유효 범위를 벗어난 학년: 0건
- 0 이하 정원: 0건
- 학생 배정: 0건
- 민원: 0건

배정과 민원은 빈 상태로 시작한다.

### 6.6 보관함

현재 상태 24건만 이관한다.

- 모든 ID는 유효하다.
- 현재 `status`는 모두 boolean 범위다.
- `updatedAt` 누락은 없다.
- source 상태는 연결 여부가 아니라 개폐 상태만 나타낸다.

따라서 `is_open`만 source에서 변환하고 `is_connected`는 false로 초기화한다. 실제 장치 gateway가 heartbeat를 보낸 이후에만 연결 상태를 true로 바꿔야 한다.

`case_history`를 현재 `device_case_commands`로 억지로 변환하지 않는다. 특히 broadcast 한 건을 24개의 개별 명령으로 복제하면 source와 다른 가짜 이력이 된다.

## 7. 현재 snapshot 기준 기대 건수

### 7.1 Source preflight

| 항목                      | 기대 건수 |
| ------------------------- | --------: |
| IAM identity              |       256 |
| 학생 profile              |       212 |
| 교직원 profile            |        22 |
| profile identity 합집합   |       230 |
| 학생·교직원 중복 identity |         4 |
| profile 없는 IAM identity |        27 |
| IAM 없는 교직원 profile   |         1 |
| 상벌점 사유               |        86 |
| 상벌점 history            |     6,467 |
| 기숙사 방                 |        44 |
| 보관함 현재 상태          |        24 |

### 7.2 Target post-import

canonical seed가 생성하는 행은 아래 ETL 건수와 별도로 유지한다.

| Target                                 | 기대 건수 또는 증가량 |
| -------------------------------------- | --------------------: |
| `users`                                |                   230 |
| `auth_accounts`                        |                   229 |
| `students`                             |                   212 |
| `staff_profiles`                       |                    22 |
| profile 기반 `user_roles`              |                   234 |
| source 기반 `point_reasons`            |                    86 |
| synthetic `point_reasons`              |                     5 |
| 전체 `point_reasons`                   |                    91 |
| source 기반 `point_records`            |                 6,467 |
| 기초 잔액 `point_records`              |                    37 |
| 전체 `point_records`                   |                 6,504 |
| 전체 양수 `point_records`              |                 4,313 |
| 전체 음수 `point_records`              |                 2,113 |
| 전체 0점 `point_records`               |                    78 |
| `dorm_rooms`                           |                    44 |
| `dorm_assignments`                     |                     0 |
| `dorm_reports`                         |                     0 |
| `device_cases`                         |                    24 |
| ETL이 생성하는 `device_case_commands`  |                     0 |
| ETL이 생성하는 `device_case_schedules` |                     0 |
| ETL이 생성하는 `activity_requests`     |                     0 |
| ETL이 생성하는 공지·글·청원·분실물     |                     0 |
| ETL이 생성하는 `song_requests`         |                     0 |

시스템 관리자·학생부장·학생회 등 profile 이외의 역할을 추가하면 최종 `user_roles` 총합은 234보다 증가할 수 있다. ETL 결과 보고서는 profile 기반 역할 234건과 운영 정책 기반 추가 역할을 구분해서 보여줘야 한다.

## 8. 필수 불변조건

### 8.1 Source preflight 불변조건

- `iam.stuid`는 중복되지 않는다.
- `user.stuid`는 중복되지 않는다.
- 모든 학생은 IAM identity와 연결된다.
- 모든 history는 정확히 한 학생과 연결된다.
- 모든 history는 정확히 한 교직원과 연결된다.
- 모든 IAM password hash가 허용된 legacy 형식과 일치한다.
- 모든 history에 사용할 수 있는 `act_date`와 `history.date`가 있다.
- `afterplus`, `beforeplus`, `afterminus`, `beforeminus`가 점수 계산 가능한 정수다.
- 모든 기숙사 방의 이름, 학년, 정원이 target enum과 제약을 통과한다.
- 모든 보관함 상태 ID가 유일하고 `status`가 boolean 범위다.
- final snapshot의 건수가 승인된 manifest와 다르면 자동 적용하지 않는다.

### 8.2 Target post-import 불변조건

- 모든 `students.user_id`가 존재하는 `users.id`를 참조한다.
- 모든 `staff_profiles.user_id`가 존재하는 `users.id`를 참조한다.
- 학생·교직원 중복 identity 4명은 사용자 행 하나와 profile 두 개를 가진다.
- profile 없는 IAM identity 27명은 target에 생성되지 않는다.
- IAM 없는 교직원 1명에게 password hash를 추정하거나 임의 생성하지 않는다.
- `auth_accounts`의 legacy hash는 로그나 report에 출력되지 않는다.
- 모든 `point_records.student_id`, `teacher_id`, `reason_id`가 유효하다.
- 학생별 양수 point 합계가 source `user.plus`와 일치한다.
- 학생별 음수 point 절댓값 합계가 source `user.minus`와 일치한다.
- 학생별 전체 point 합계가 `students.current_point`와 일치한다.
- `students.current_point = source plus - source minus`가 성립한다.
- source 6,467개 history가 각각 한 개의 source 기반 point record로 대응된다.
- 37개의 기초 잔액 record 외에 ETL이 임의 record를 만들지 않는다.
- source reason이 없는 5,619개 기록은 부호별 synthetic reason과 non-empty comment를 가진다.
- synthetic reason은 모두 비활성이다.
- canonical 역할, permission, role-permission 관계의 건수와 내용이 import 전후 동일하다.
- `device_cases.is_connected`는 모두 false로 시작한다.
- 제외 대상으로 지정한 target 도메인에 ETL이 행을 만들지 않는다.
- 외래키 오류, 중복 key, 잘린 문자열, enum 변환 실패가 0건이다.

## 9. 실행 단계

### Stage 0. 정책 확정

10절의 사용자 확인 항목을 확정한다. 확정되지 않은 항목은 importer가 임의로 추정하지 않는다.

### Stage 1. 대체 ETL 구현

- source와 target connection을 분리한다.
- source connection은 read-only transaction을 사용한다.
- source query에는 4절의 명시적 테이블명과 컬럼명만 사용한다.
- 기본 실행은 dry-run이며, 별도 apply flag가 없으면 target에 쓰지 않는다.
- dry-run은 기대 건수, join 누락, 형식 오류, 변환 결과 건수만 출력한다.
- 개인정보와 hash는 stdout, 파일, CI log에 출력하지 않는다.
- insert는 bounded batch로 실행한다.
- source ID와 target ID 연결은 명시적 map으로 관리하고 table 간 ID가 같다고 가정하지 않는다.
- target은 이미 migration과 seed가 적용된 새 staging 데이터베이스여야 한다.
- 실행 시작 시 target 핵심 테이블이 기대한 초기 상태가 아니면 중단한다.
- importer는 seed 테이블을 삭제하거나 다시 만들지 않는다.

### Stage 2. 첫 staging rehearsal

1. 새 staging 데이터베이스를 만든다.
2. 전체 Drizzle migration과 canonical seed를 적용한다.
3. source preflight와 dry-run을 실행한다.
4. 검증이 통과하면 staging에 apply한다.
5. 7.2의 기대 건수와 8.2의 불변조건을 전부 검사한다.
6. 시스템 관리자, 학생, 교직원 유형별 승인된 테스트 계정으로 로그인을 검증한다.
7. 첫 로그인 후 legacy hash가 Argon2id로 재해시되는지 검사한다.
8. 상벌점 개인 조회, 관리자 조회, 합계, 기초 잔액을 표본 검증한다.
9. 기숙사 방과 보관함 상태 화면을 검증한다.
10. report에는 aggregate와 익명 checksum만 남긴다.

### Stage 3. 반복 rehearsal

최소 한 번 더 새 staging 데이터베이스에서 처음부터 반복한다. 두 실행의 source snapshot이 같다면 기대 건수와 checksum도 같아야 한다.

오류 수정 후 기존 staging 데이터를 부분 수정하지 않는다. staging 데이터베이스를 다시 만들고 migration부터 재실행한다.

### Stage 4. 최종 cutover import

`iam`, `user` 등 일부 source table에는 신뢰할 수 있는 `updated_at`이 없으므로 증분 동기화에 의존하지 않는다.

1. 기존 PLMA의 데이터 쓰기를 짧은 maintenance window 동안 중단한다.
2. 최종 source preflight manifest를 생성한다.
3. 기존 rehearsal과 비교해 변경 건수와 정책 위반 여부를 확인한다.
4. 새 운영 target에 migration과 seed를 적용한다.
5. 동일 ETL을 전체 clean import로 실행한다.
6. 모든 post-import 불변조건을 검사한다.
7. API health, 로그인, 권한, 상벌점 합계 smoke test를 수행한다.
8. 테스트가 통과한 뒤에만 신규 서비스로 트래픽을 전환한다.

### Stage 5. 롤백

- 이관 실패 시 신규 서비스 트래픽을 열지 않는다.
- 전환 후 중대 오류가 발견되면 트래픽을 기존 서비스로 되돌린다.
- 원본 DB는 rollback을 위해 수정하거나 삭제하지 않는다.
- 실패한 target을 수동 보정해서 다시 사용하지 않고 새 target에서 재실행한다.
- 실패 report에는 개인정보 없이 단계, aggregate, 오류 코드만 남긴다.

### Stage 6. 전환 후

- legacy 서비스는 합의된 보존 기간 동안 읽기 전용으로 유지한다.
- 사용자 로그인에 따라 legacy password hash를 Argon2id로 점진 전환한다.
- 이관 manifest와 검증 report를 비밀값 없는 운영 문서로 보관한다.
- 보존 기간 종료 후 별도 승인으로 legacy DB와 credential 폐기 절차를 진행한다.
- 데이터 이관 importer는 일반 deploy workflow에서 계속 제외한다.

## 10. 사용자 확인이 필요한 정책

다음 항목은 구현 전에 명시적으로 결정해야 한다.

1. **Profile 없는 IAM 27명**: 기본안대로 제외할지, 졸업생·서비스 계정 등 보존 대상이 있는지 확인한다.
2. **IAM 없는 교직원 1명**: 로그인 없이 profile만 유지할지, 별도 초기 비밀번호 발급 절차를 진행할지 확인한다.
3. **학생·교직원 중복 identity 4명**: 두 profile과 두 역할을 동시에 부여하는 것이 실제 운영 의도인지 확인한다.
4. **특권 역할**: 시스템 관리자, 학생부장, 학생회의 실제 대상과 역할 범위를 확정한다.
5. **교직원 `job`**: `staff_profiles.department`와 `title` 중 어디에 매핑할지 확인한다.
6. **연락처 최소화**: 기존 전화번호와 이메일을 가져올지, 신규 시스템에서 다시 수집할지 결정한다. 성별은 기본 제외다.
7. **기초 잔액**: 31개 상점 및 6개 벌점 synthetic record를 추가하는 방식을 승인한다.
8. **0점 history 78건**: 감사 이력으로 보존할지, 실질 점수가 없으므로 제외할지 결정한다. 현재 계획의 기대 건수는 보존을 전제로 한다.
9. **사유가 사라진 history**: 부호별 synthetic reason과 원래 caption 보존 방식을 승인한다.
10. **장치 history**: 기본안대로 제외할지, 별도 legacy event schema를 만들어 보존할지 결정한다.
11. **장치 schedule**: 기존 cron 4건을 폐기하고 장치 gateway 도입 후 수동 재설정하는 방식을 승인한다.
12. **콘텐츠 시작 상태**: 공지·게시판 글·청원·분실물을 빈 상태로 시작할지, 다른 source를 별도 조사할지 결정한다.
13. **기숙사 시작 상태**: 방 44개만 가져오고 배정과 민원을 빈 상태로 시작할지 확인한다.
14. **Maintenance window**: 최종 full import 동안 기존 PLMA 쓰기를 중단할 시간과 공지 방법을 확정한다.
15. **Legacy 보존 기간**: 전환 후 기존 DB를 읽기 전용으로 유지할 기간과 최종 폐기 승인자를 정한다.

## 11. 완료 기준

다음 조건이 모두 충족되어야 이관을 완료로 판단한다.

- 승인된 allowlist 이외 source table과 column을 읽지 않았다.
- 저장소, CI artifact, 로그에 개인정보·hash·credential이 남지 않았다.
- target 기대 건수와 모든 불변조건이 통과했다.
- 역할과 permission seed가 변경되지 않았다.
- 승인된 테스트 계정의 로그인과 hash 재해시가 정상 동작했다.
- 학생별 상점·벌점·현재 점수가 source와 일치했다.
- staging에서 동일 snapshot의 반복 실행 결과가 재현되었다.
- 실패 시 기존 서비스로 되돌릴 수 있는 상태가 유지되었다.
- 사용자 확인이 필요한 정책 결정이 운영 기록으로 남았다.
