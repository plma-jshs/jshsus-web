# 콘텐츠 목록·편집기 가이드

- 확정일: 2026-07-13
- 적용 범위: 공지사항, 자유게시판 및 이후 추가되는 텍스트 콘텐츠 화면

## 목록 화면

- 공개 목록은 별도의 `중요 공지` 카드나 `중요/일반` 분류 탭을 두지 않는다.
- 검색 조건과 페이지 정보는 테이블 바로 위의 한 줄 toolbar에 작게 배치한다.
- 목록은 실제 `table` 요소를 사용하며 기본 열은 `번호 / 제목 / 작성자 / 등록일 / 조회` 순서로 둔다.
- 댓글 수는 별도 반응 열로 합산하지 않고 제목 바로 뒤에 `[n]` 형식으로 표시한다.
- 테이블 상단에는 브랜드 색의 3px 선을, 헤더에는 옅은 중립 배경과 굵은 중앙 정렬 문자를 사용한다.
- 행 끝 꺾쇠는 사용하지 않는다. hover 시 행 배경만 옅은 회색으로 바꾸고 제목에만 밑줄을 표시한다.
- 번호는 서버의 `total`, `page`, `pageSize`를 기준으로 역순 계산한다.
- 작은 화면에서는 번호를 제거하고 제목을 첫 줄, 작성자·등록일·조회를 둘째 줄로 재배치한다.

## 검색과 페이지네이션

- URL query를 단일 상태 원본으로 사용한다: `page`, `pageSize`, `field`, `q`.
- `pageSize`는 10, 20, 30, 50 중 하나이며 서버 최대값도 50으로 제한한다.
- 검색 범위는 `제목+내용`, `제목`, `작성자`를 제공한다.
- 검색 조건이 바뀌면 첫 페이지로 이동하고, 이전 응답은 다음 응답을 받는 동안 유지한다.
- 공지와 게시글 상세는 목록을 다시 받아 `find`하지 않고 전용 상세 endpoint를 호출한다.

## 리치 텍스트 본문

- 편집기는 Tiptap JSON을 본문 원본으로 저장하고, 검색·요약용 plain text projection을 함께 저장한다.
- 허용 서식은 제목 2/3, 굵게, 기울임, 밑줄, 취소선, 글머리·번호 목록, 인용, 링크, 줄바꿈, 이미지로 제한한다.
- 저장 문서는 서버 allowlist와 크기·노드 수·중첩 깊이 제한을 통과해야 한다.
- 상세 화면은 HTML 문자열을 주입하지 않고 동일한 JSON을 읽기 전용 Tiptap으로 렌더링한다.
- 기존 plain text 게시글은 JSON이 없어도 문단 단위로 변환해 동일한 렌더러에서 표시한다.

## 인라인 이미지 수명주기

1. 파일을 선택하면 브라우저의 `blob:` URL로 즉시 미리보기한다.
2. 이미지 또는 첨부가 있는 글은 먼저 비공개 draft를 생성한다.
3. 파일은 draft 작성자 소유의 private 파일로 업로드한다.
4. 업로드 응답의 안정 URL `/api/files/:id/content`로 임시 이미지 노드를 치환한다.
5. 서버가 이미지가 같은 게시글에 첨부된 파일인지 검증한 뒤 본문 JSON을 저장한다.
6. 게시 시 파일 공개 전환과 게시글 상태 변경을 한 DB transaction에서 처리한다.
7. 중간 실패 시 draft, 파일 레코드, 로컬/S3 객체를 정리한다.

JPEG, PNG, WebP만 본문 이미지로 허용하며 확장자나 클라이언트 MIME만 믿지 않고 파일 signature를 검사한다. SVG와 `data:`, 외부 임의 URL은 허용하지 않는다. private 파일은 소유자 또는 콘텐츠 관리자만 읽을 수 있다.

## 작성 화면

- 제목, 본문 편집기, 일반 첨부, 작성자 표시 옵션, 하단 행동 영역을 각각 분리한다.
- toolbar 아이콘에는 accessible name과 tooltip을 제공한다.
- 익명 작성은 기본 native checkbox를 사용하며 입력 크기는 16×16px, focus ring은 checkbox 자체를 감싼다.
- 본문 이미지는 일반 첨부 목록에 중복 표시하지 않는다.
- 청원 편집기는 같은 rich text 기반을 사용하되 인라인 이미지를 허용하지 않는다.
- 등록 중에는 중복 제출을 막고 `업로드 및 등록 중…` 상태를 명시한다.

## 구현 위치

- 공통 목록 제어: `apps/web/src/components/page/DataTableControls.tsx`
- 리치 텍스트: `apps/web/src/components/editor/RichTextEditor.tsx`
- 공통 표 CSS: `apps/web/src/styles/data-tables.css`
- 공통 편집기 CSS: `apps/web/src/styles/editor.css`
- 서버 본문 검증: `apps/api/src/modules/boards/post-content.ts`
- 파일 접근·저장: `apps/api/src/modules/files`
- DB migration: `packages/db/migrations/0004_flimsy_justice.sql`
