# 데이터베이스 구조 점검 (2026-08)

이 문서는 현재 Drizzle 스키마와 API의 실제 읽기·쓰기 쿼리를 함께 대조한 결과다. 운영 중인 PHP 서비스와 그 원본 DB는 변경·삭제 범위에 포함하지 않는다.

## 이번에 바로 반영한 항목

- `activity_requests(status, starts_at, id)` 복합 인덱스를 추가했다. 관리자 상태 필터, 활동일 범위 조회, 최신순 정렬이 같은 인덱스를 사용할 수 있다.
- `activity_request_events(activity_request_id, created_at)` 복합 인덱스를 추가했다. 기존 단일 인덱스는 운영 중인 마이그레이션 정책에 맞춰 유지하고, 요청별 시간순 이력 조회와 파기 대상 정리를 보강한다.
- `audit_logs(created_at, id)` 인덱스를 추가했다. 3개월 보존 조회와 자동 파기의 전체 테이블 스캔을 피한다.

## `activity_requests` 판정

| 컬럼/구조                                      | 판정           | 근거                                                                                                                                                                                                                                                      |
| ---------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `starts_at`, `ends_at`                         | 유지           | 활동일 필터, 시간 표시, 오늘자 문서 출력, 겹치는 활동 조회, 최신순 정렬 및 `activity_date` 기준 보존기간 계산의 정규 기준이다.                                                                                                                            |
| `issued_number`, `issued_at`                   | 유지           | 승인 시 발급번호를 생성하고 관리자 검색·정렬·상세·인쇄 문서에 사용한다. 레거시 잔여 컬럼이 아니다.                                                                                                                                                        |
| `activity_slot_ids` JSON                       | 현 구조 유지   | 조회 조건으로 사용하지 않는 최대 7개 내외의 작은 선택 스냅샷이다. `starts_at`/`ends_at`만으로는 1면학+3면학처럼 중간 공백이 있는 구간을 복원할 수 없다. 별도 연결 테이블은 조인·쓰기 비용만 늘어난다. API에서 허용된 슬롯 ID와 시간 일치 여부를 검증한다. |
| `student_id`                                   | 이름 개선 후보 | 실제 의미는 대표 학생이므로 코드에서는 `representativeStudentId`로 사용한다. DB 컬럼명 변경은 운영 쿼리·레거시 이관 스크립트에 미치는 영향이 커서 호환 마이그레이션 시점까지 보류한다.                                                                    |
| `created_by_id`                                | 유지           | 신청자와 대표 학생이 다를 수 있으므로 신청 권한·수정 권한을 판정하는 데 필요하다.                                                                                                                                                                         |
| `teacher_id` + `advisor_teacher_name_snapshot` | 둘 다 유지     | 활성 교사 계정 연결과 전근·탈퇴 이후 표시할 이름 스냅샷의 목적이 다르다.                                                                                                                                                                                  |
| `activity_request_participants`                | 유지           | 검색, 권한, 알림, 개인정보 파기의 대상 관계다. JSON으로 합치면 학생 기준 조회와 참조 무결성이 나빠진다.                                                                                                                                                   |
| `activity_request_events`                      | 유지           | 승인·반려·취소·출력의 감사 이력이다. 보존기간 만료 시 원문 이벤트를 함께 완전 삭제한다.                                                                                                                                                                   |

`activity_date`는 별도 중복 컬럼을 만들지 않고 `starts_at`의 한국 시간대 날짜를 기준으로 사용한다. 날짜와 시간이 항상 함께 생성·검증되므로 별도 날짜 컬럼은 불일치 위험만 추가한다.

## 전체 스키마에서 확인한 후속 정리 후보

### 사용자 호환 미러 컬럼

`users.student_no`, `grade`, `class_no`, `number`, `gender`는 `students`와 `student_enrollments`로 옮겨 가는 중인 호환 컬럼이다. 현재도 계정 활성화, 기상곡, 상벌점, 기숙사 쿼리에서 직접 읽고 있어 즉시 제거하면 기능이 깨진다.

후속 순서는 다음과 같다.

1. 각 조회를 `students`/현재 active `student_enrollments`/`staff_profiles` 기준으로 전환한다.
2. 한 달 병행 기간 동안 미러 값과 정규 테이블 값의 불일치를 점검한다.
3. 읽기 사용처가 0건이 된 뒤 신규 DB에서만 컬럼을 제거한다. PHP 원본 DB는 건드리지 않는다.

### 인증 호환 컬럼

`auth_accounts.password_hash`와 `password_algorithm`은 런타임 로그인에서는 사용하지 않고 Cognito 계정은 해시를 저장하지 않는다. 현재 스키마 기본값 때문에 비밀번호가 없는 Cognito·시스템 계정에도 `legacy-sha512`가 기록될 수 있다. 기존 값을 바로 `MODIFY COLUMN`하는 방식은 롤백 불가능한 운영 마이그레이션 정책에 어긋나므로 이번 배포에서는 변경하지 않는다. 후속 expand/contract 단계에서 nullable 신규 컬럼 추가 → 호환 계정만 이관 → 읽기 전환 → 구 컬럼 제거 순으로 처리한다. 레거시 비밀번호 해시는 Cognito로 이관하지 않는다.

### 사용되지 않는 `reactions` 테이블

게시글·댓글 좋아요는 FK가 있는 `post_likes`, `comment_likes`를 사용하고 현재 API에서 `reactions`를 읽거나 쓰지 않는다. 2026-08-14 v26 운영 DB에서 행 0건·참조 0건·백업 성공을 확인한 뒤 `legacy_activity_requests`와 함께 제거했다. 새 환경에서도 같은 상태가 유지되도록 현재 squashed baseline에 `DROP TABLE IF EXISTS`를 포함했다.

### 의도적으로 유지하는 중복·비정규화

- `posts.content`/`content_json`, `petitions.content`/`content_json`: HTML 렌더링 결과와 에디터 구조의 목적이 다르다. 저장 시 함께 갱신해야 한다.
- `petitions.participant_count`: 홈·목록의 빈번한 집계를 줄이는 캐시 컬럼이다. 참여 등록 트랜잭션에서 원자적으로 증가한다. 정기 무결성 점검에서 실제 참여자 수와 대조하는 것이 안전하다.
- `reports(target_type, target_id)`: 여러 콘텐츠를 받는 다형 관계라 DB FK를 직접 걸 수 없다. 대상 콘텐츠를 완전 삭제하는 작업은 신고 레코드 정리까지 같은 트랜잭션에서 수행해야 한다.
- 알림 `metadata` JSON과 교직원 `managed_classes` JSON은 조회 조인 대상이 아닌 작은 부가 정보이므로 현재 사용 방식이 적절하다.

## 파기 정책과의 정합성

- 상벌점·탐구활동서는 `activity_date` 기준 1년 후 원본·조정/이벤트 이력을 완전 삭제한다.
- 게시글·댓글은 작성자를 `탈퇴한 사용자` 플레이스홀더로 비식별화하고 본문을 유지한다.
- 감사챌린지는 학번·이름을 익명화하고 본문을 유지한다.
- `users.id`, `students.id`는 참조 무결성용 최소 플레이스홀더만 유지한다.
- 구 PHP DB 및 `legacy_activity_archives` 원문은 이번 신규 DB 파기 작업의 대상이 아니다.

## 게시 콘텐츠와 기상곡 삭제 방식

일반 운영 삭제는 hard delete로 바꾸지 않고 현재의 soft delete/상태 전이를 유지한다.

- 게시글·댓글은 `is_hidden = false`, 청원은 `status != 'hidden'`, 분실물은
  `status != 'hidden'` 조건이 공개 목록과 상세 조회에 모두 적용된다. 숨긴 콘텐츠가 공개
  화면에 다시 노출되는 읽기 경로는 확인되지 않았다.
- JBS는 게시글과 같은 숨김 규칙을 사용한다. 본문·댓글 맥락, 신고 및 관리자 처리 이력을
  보존해야 하므로 운영자 삭제를 즉시 물리 삭제로 바꾸지 않는다.
- 기상곡의 `CANCELED`는 삭제 표시가 아니라 신청자와 관리자가 확인하는 처리 이력이다.
  후보·승인 대상에서는 제외하되 본인 신청 내역에는 남긴다.
- hard delete는 개인정보 보존기간 만료에 따른 법정 파기, 승인된 중복·오염 데이터 정리,
  연결이 끊긴 업로드 파일 정리에만 사용한다. 이때 관련 신고·좋아요·첨부·감사 관계를 같은
  승인 작업에서 정리하고 건수와 시각만 비식별 감사 로그에 기록한다.

## 배포 후 확인할 운영 지표

- `EXPLAIN`으로 활동 현황 조회가 `activity_requests_status_date_idx`를 사용하는지 확인한다.
- 감사 로그 파기 쿼리가 `audit_logs_created_idx`를 사용하는지 확인한다.
- `auth_accounts`에서 `password_hash IS NULL AND password_algorithm IS NOT NULL` 건수가 0인지 확인한다.
- `legacy_activity_archives` 행 수와 최근 쓰기 시각을 점검한다. `reactions`는 squashed baseline에서 제거되어 존재하지 않는 것이 정상이다.
- `petitions.participant_count`와 `COUNT(petition_participants)` 불일치 건수를 정기 점검한다.
