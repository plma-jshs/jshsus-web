# 계정 생명주기와 개인정보 보존·파기 운영

정책 확정일: 2026-07-31
승인 참조: `owner-confirmed-2026-07-31`

## 운영 원칙

- 학생 상태는 `active`(재학)와 `graduated`(졸업·학적 종료)만 운영한다.
- 교직원 상태는 `active`(재직·휴직)와 `deleted`(전근·퇴직)만 운영한다.
- 비활성 상태로 바뀌는 즉시 로그인과 세션을 차단하고 연락처, 선택 프로필,
  프로필 파일, 로컬 인증정보를 파기한다.
- Cognito 사용자는 즉시 Disable한다. User Pool에서 `email`이 필수 속성이므로 실제
  이메일은 복구할 수 없는 subject 해시 기반 `@jshsus.invalid` 주소로 대체하고
  `email_verified=false`로 바꾸며 `name`은 삭제한다.
- Cognito 사용자는 30일 유예 후 Hard Delete하고 `auth_accounts` 연결도 삭제한다.
- 게시글·댓글은 작성자 FK를 `NULL`로 바꾸고 표시 이름은 `탈퇴한 사용자`로
  마스킹하되 본문은 유지한다.
- 감사챌린지는 학번을 `익명`으로 바꾸고 본문은 유지한다.
- 개인정보 파기 감사 로그에는 원문, 학번, 이름, Cognito subject를 기록하지 않는다.
  정책 키, 처리 건수, 실행 시각, 비식별 오류 코드만 기록한다.

## 보존기간

| 범주                         | 기산점                                       | 보존기간 | 만료 처리                       |
| ---------------------------- | -------------------------------------------- | -------: | ------------------------------- |
| 상벌점                       | 각 행 `point_records.base_date`              |    365일 | 학적 종료 학생 원본 Hard Delete |
| 상벌점 처리 사건             | 각 행 `point_award_cases.created_at`         |    365일 | 학적 종료 학생 원본 Hard Delete |
| 연결된 탐구활동서            | 각 행 `activity_requests.starts_at`의 활동일 |    365일 | 학적 종료 학생 원본 Hard Delete |
| 미연결 레거시 탐구활동서     | 각 행 `activity_date`                        |    365일 | 원본 행 Hard Delete             |
| 학생 최소 식별 껍데기        | `users.status_changed_at`                    |    365일 | 이름·학번 마스킹                |
| Cognito 계정                 | `users.deactivated_at`                       |     30일 | Cognito 및 연결 Hard Delete     |
| 접속·보안 감사 로그          | `audit_logs.created_at`                      |     90일 | Hard Delete                     |
| 암호화 DB 백업               | S3 객체 생성일                               |     30일 | S3 Lifecycle Hard Delete        |
| 게시글·댓글 작성자 정보      | 비활성화 시점                                |      0일 | FK·이름 비식별화, 본문 유지     |
| 감사챌린지 작성자 정보       | 비활성화 시점                                |      0일 | 학번·이름 비식별화, 본문 유지   |
| 연락처·선택 프로필·인증 토큰 | 비활성화 시점                                |      0일 | 즉시 파기                       |

학적 종료 학생의 각 기록은 계정 상태 변경일이 아니라 그 기록의 실제 활동일을
기준으로 365일을 계산한다. 활성 학생의 기록은 이 자동 파기 대상에서 제외한다.
만료한 기록은 익명 통계나 별도 아카이브로 복제하지 않고 다음 원본을 실제
`DELETE`한다.

- `point_records`, 그 레코드의 `point_adjustments`, `point_award_cases`
- 대표 학생의 `activity_requests`, 연결된 `activity_request_events`와
  `activity_request_participants`
- 다른 학생의 탐구활동서에 참여자로만 연결된 경우 해당 participant 연결

참조 무결성을 위한 `users.id`와 `students.id` 최소 껍데기는 학적 종료 후 365일에
이름을 `탈퇴한 사용자`로 바꾸고 학번을 충돌하지 않는 음수 내부 식별자로
치환한다. 학년·반·번호·연락처·프로필 필드는 제거하고, 원래 학번이나 이름을
복원할 수 있는 매핑은 남기지 않는다.

## 비활성화 처리

관리자 페이지의 `학적 종료` 또는 `전근·퇴직 처리`, 그리고 명단 반영에 따른 졸업
처리는 모두 `AccountLifecycleService`를 통과해야 한다. 직접 SQL로 상태만 바꾸지
않는다.

처리 순서는 다음과 같다.

1. 대상 신원과 허용 상태를 검증한다.
2. DB 트랜잭션에서 상태와 기준 시각을 저장하고 연락처·로컬 인증·권한을 제거한다.
3. 게시글·댓글과 감사챌린지 작성자 정보를 비식별화한다.
4. Redis 세션을 무효화하고 프로필 파일 삭제 outbox를 실행한다.
5. Cognito를 Disable하고 실제 이메일 및 이름을 제거한다.
6. 외부 저장소 또는 Cognito 처리가 실패하면 계정은 계속 차단된 상태로 두고
   정기 파기 작업이 재시도한다.

관리자 API에서 `active`로 직접 되돌리는 것은 금지한다. 잘못 종료한 계정의 복구는
확정 명단 재반영과 Cognito 계정 재발급 절차로 처리한다.

## 자동 파기 작업

기본 실행은 조회만 하는 dry-run이다.

```bash
node packages/db/scripts/privacy-retention.cjs
```

승인된 정책을 실제 적용하려면 정확한 승인 참조가 필요하다.

```bash
node packages/db/scripts/privacy-retention.cjs \
  --apply \
  --confirm-policy owner-confirmed-2026-07-31
```

실행기는 MySQL advisory lock을 사용해 중복 실행을 막고,
`privacy_retention_policies`의 기간·처리방식·승인 참조가 코드의 기대값과 정확히
같을 때만 적용한다. 결과는 `privacy_erasure_jobs`에 건수와 시각만 남는다.

GitHub Actions의 `Privacy retention`은 매일 04:30 KST 실행한다. 운영 전환 첫날에는
반드시 수동 dry-run, DB 백업 성공 및 대상 건수 검토, 수동 apply 순으로 확인한다.

## 레거시 탐구활동서

연결할 수 없는 레거시 탐구활동서는 새 DB의 `legacy_activity_archives`에 읽기
전용으로 격리한다. `legacy_activity_requests`는 과거 이관 과정에서 사용된 호환용
복제 테이블이며, 현 PHP 서비스의 원본 DB 테이블이 아니다. 신규 코드는 새 테이블만
사용한다. v26 운영 DB에서는 2026-08-14 백업·행 대조 후 squashed baseline에 반영된
정리 작업으로 제거했으며, 현 PHP 원본 DB는 이 작업의 대상이 아니다.

레거시 행에는 학생 상태 변경일이 없으므로 각 행의 `activity_date`를 365일
기산점으로 사용한다. 만료 시 **새 DB 안의** `legacy_activity_archives` 원문을
삭제한다.
파기 스크립트는 `jshsus-php.jshsus.kr`을 대상으로 실행하려 하면 즉시 실패한다.
현 PHP 서비스의 원본 데이터는 이 정책 자동화의 대상이 아니다.

## 레거시 서비스 보호

- `jshsus.kr`의 기존 PHP 서비스와 데이터베이스는 변경하거나 폐쇄하지 않는다.
- `v26.jshsus.kr`을 약 1개월 관찰한다.
- 2026-08-31은 폐쇄일이 아니라 상태 검토 체크포인트다.
- 그날 이후에도 별도 명시 승인 없이 서버, DNS, 데이터베이스, 백업을 삭제하거나
  종료하지 않는다.

## 근거와 검토

개인정보의 수집 최소화와 목적 달성 후 파기 원칙을 구현 기준으로 삼았다.

- [개인정보 보호법 제16조](https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1029335671)
- [개인정보 보호법 제21조](https://www.law.go.kr/LSW/lsLawLinkInfo.do?chrClsCd=010202&lsJoLnkSeq=900078981)
- [개인정보 보호법 시행령 제16조](https://www.law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=00&joNo=0016&lsiSeq=286175&urlMode=lsScJoRltInfoR)
- [개인정보보호위원회 개인정보 파기 안내](https://www.pipc.go.kr/np/default/contents.do?cIdx=223&isBlank=true)

학교에 별도 적용되는 기록물 보존 의무가 확인되면 해당 근거, 대상 범위, 기간을
정책 테이블에 별도로 승인한 뒤 적용한다. 근거가 확인되지 않은 데이터는 임의로
영구 보관하지 않는다.
