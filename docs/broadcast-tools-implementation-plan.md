# 방송·도구 현행 사양

- 확정일: 2026-07-14
- 범위: JBS, 기상곡 신청, 세특 바이트 계산기
- 상태: MVP 구현 완료, 로컬 검증 대상

## 공통 원칙

- 영상과 음원은 YouTube에 두고 서버는 URL, 검증된 video id, 재생 구간과 업무 상태만 저장한다.
- 임의 iframe HTML이나 제3자 embed URL은 저장하지 않는다.
- 학생 쓰기 요청은 로그인·CSRF·입력 검증·rate limit을 거친다.
- 승인·반려·편성·완료 등 관리자 상태 변경은 permission 검사와 감사 로그를 남긴다.
- 기존 `songs` 약 989건은 자동 이관하지 않는다. 운영 가치와 공개 가능성을 확인한 행만 별도
  일회성 이관 대상으로 선정한다.

## JBS

### 사용자 흐름

1. 누구나 `/jbs`에서 공개 영상을 카드 목록으로 보고 제목·내용을 검색할 수 있다.
2. 상세 화면은 서버가 생성한 YouTube embed와 설명, 작성자, 조회 수, 댓글 수를 표시한다.
3. 로그인 사용자는 자유게시판과 동일한 방식으로 댓글을 작성한다.
4. `broadcast_club` 또는 `jbs.publish` 권한 사용자는 `/jbs/new`에서 제목, 설명, YouTube URL을
   등록한다.

### 저장 구조와 보안

- 제목·설명·작성자·댓글은 공통 `boards/posts/comments` 모델을 사용한다.
- `jbs_videos`에는 post id, 11자리 YouTube video id, canonical URL만 저장한다.
- iframe URL은 저장된 HTML을 출력하지 않고 검증된 video id에서 `youtube-nocookie.com` 주소로
  매번 생성한다.
- 로컬 seed는 공개 JBS 게시글과 영상 metadata를 항상 멱등하게 준비한다.

## 기상곡 신청

### 학생 흐름

1. 로그인 학생이 YouTube URL을 확인하고 시작·종료 시각, 배속, 선택 메모를 입력한다.
2. 배속을 반영한 실제 재생 시간은 `(종료 - 시작) / 배속`이며 최대 180초다.
3. 한 학생이 동시에 보유할 수 있는 `PENDING` 신청은 최대 3건이다.
4. `PENDING` 상태에서만 수정·취소할 수 있고, 내역에서 승인·반려·편성·완료 상태와 반려 사유를
   확인한다.

### 검토와 편성

1. `student_affairs_head` 또는 `wake_songs.review` 권한 사용자가 관리자 앱에서 승인·반려한다.
2. 승인 시 즉시 편성하지 않는다. 담당자가 나중에 날짜와 시각을 지정해 `SCHEDULED`로 바꾼다.
3. 실제 방송 후 `PLAYED`로 기록한다.
4. 상태 전이는 `wake_song_request_events`와 공통 audit log에 함께 기록한다.

### 상태 모델

```text
PENDING ──> APPROVED ──> SCHEDULED ──> PLAYED
   ├──────> REJECTED
   └──────> CANCELED
```

### YouTube 검증

- JBS와 기상곡 모두 영상 존재 여부, 제목, 채널, 길이, 임베드 가능 여부를 YouTube Data API
  v3 `videos.list`로 검증한다.
- `YOUTUBE_API_KEY`가 없거나 외부 API 조회가 실패하면 등록을 중단하고 명확한 오류를 반환한다.
  oEmbed나 URL 기반 metadata fallback은 사용하지 않는다.
- 성공한 metadata는 프로세스 메모리에 6시간, 최대 256건 캐시하고 같은 영상의 동시 조회를
  하나의 외부 요청으로 합친다.
- 지원 URL만 허용하고 userinfo, 임의 port, 알 수 없는 path는 거부한다.

## 세특 바이트 계산기

- `/tools/bytes`에서 완전히 클라이언트 측으로 동작하며 입력한 학생 기록을 서버나 DB로 보내지
  않는다.
- 계산 규칙:

| 문자 종류            |          계산 |
| -------------------- | ------------: |
| 한글 음절·자모       |         3Byte |
| 영문·숫자            |         1Byte |
| 공백                 |         1Byte |
| 줄바꿈               |         2Byte |
| 기타 특수문자·이모지 | UTF-8 byte 수 |

- 실시간 문자 수·byte 수·제한 진행률, 초과 지점, 복사와 전체 지우기를 제공한다.
- 특정 NEIS 항목의 최대 byte 수는 학교 운영 기준이 달라질 수 있으므로 preset과 계산 규칙을
  분리해 유지한다.

## 권한과 운영 확인

| 기능             | 역할/permission                              |
| ---------------- | -------------------------------------------- |
| JBS 공개 조회    | 공개                                         |
| JBS 댓글         | 로그인 사용자                                |
| JBS 등록         | `broadcast_club` / `jbs.publish`             |
| 기상곡 신청      | `student`                                    |
| 기상곡 승인·편성 | `student_affairs_head` / `wake_songs.review` |

운영 반영 전에는 다음만 확인한다.

1. GitHub Environment에 `YOUTUBE_API_KEY`를 필수 Secret으로 등록한다.
2. Nginx와 Cloudflare CSP가 `https://www.youtube-nocookie.com` iframe과 YouTube IFrame API를
   허용하는지 확인한다.
3. `broadcast_club` 학생과 학생관리부장 계정에 기대한 permission이 배정됐는지 확인한다.
4. 공개할 레거시 기상곡 이력이 필요한 경우에만 별도 선별 이관안을 승인한다.
