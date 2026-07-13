# 공개 세부 페이지 개편 범위

이 문서는 구현 범위를 빠르게 확인하기 위한 체크리스트다. 시각 기준과 페이지별 상세 규칙은
`docs/jshsus-design-refresh-plan.md`를 따른다.

## 구조

- route: `apps/web/src/app/router.tsx`
- 공통 page primitive: `apps/web/src/components/page`
- 공통 rich text: `apps/web/src/components/editor`
- 기능 UI/API: `apps/web/src/features/<domain>`
- 공통 스타일: `apps/web/src/styles/page-scaffold.css`, `data-tables.css`, `editor.css`, `content-pages.css`
- 기능 스타일: 각 domain CSS

## 화면 범위

- `/notices`, `/notices/$noticeId`
- `/calendar`
- `/boards/free`, `/boards/free/new`, `/boards/free/$postId`
- `/petitions`, `/petitions/new`, `/petitions/$petitionId`
- `/activity-requests`, `/activity-requests/new`, `/activity-requests/$requestId`
- `/lost-items`, `/lost-items/new`, `/lost-items/$itemId`
- `/my-status`
- `/login`

## 데이터 무결성

- 목록에서 상세를 다시 찾지 않고 각 domain의 전용 상세 endpoint를 호출한다.
- 401/403, 404, 5xx를 UI에서 구분한다.
- 개발 mock은 실제 상세 ID가 생성되는 로컬 seed만 사용하며 화면 전용 fallback 데이터는 만들지 않는다.
- 파일을 먼저 올리는 작성 흐름은 후속 mutation 실패 시 파일과 draft를 rollback한다.
- rich text는 서버 allowlist 검증을 통과한 JSON과 검색용 plain text를 함께 저장한다.

## 검증

- 390, 768, 1440px 브라우저 확인
- keyboard 탐색, focus, Escape, live feedback 확인
- loading, empty, unauthorized, not found, server error 확인
- typecheck, lint, test, format check, production build 통과
- 배포는 별도 승인 전까지 수행하지 않음
