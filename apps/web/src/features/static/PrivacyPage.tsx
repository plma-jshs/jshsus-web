import { PageScaffold } from '../../components/page/PageScaffold';
import '../../styles/static-pages.css';

export function PrivacyPage() {
  return (
    <PageScaffold
      breadcrumbs={[{ label: '개인정보처리방침' }]}
      title="개인정보처리방침"
      description="개인정보 처리 기준을 확인하세요."
      width="reading"
      variant="document"
    >
      <article className="static-document privacy-document">
        <aside className="privacy-document__notice">
          이 문서는 현재 구현된 기능을 기준으로 작성한 운영 안내입니다. 학교의 공식 개인정보
          처리방침과 보존 기준이 확정되면 그 내용에 맞춰 갱신되어야 합니다.
        </aside>

        <section>
          <h2>1. 처리할 수 있는 정보</h2>
          <ul>
            <li>통합로그인과 권한 확인을 위한 학번 또는 교사번호, 이름, 역할·권한, 인증 정보</li>
            <li>계정에 선택적으로 등록하는 이메일 주소와 전화번호</li>
            <li>상벌점, 기숙사 배정, 탐구활동서 등 학생생활 기능의 신청·처리 기록</li>
            <li>
              게시글, 댓글, 좋아요, 신고, 첨부파일, 분실물, 기상곡과 JBS 등록 내용 등 사용자가 직접
              작성한 정보
            </li>
            <li>
              서비스 보안과 오류 대응 과정에서 생성될 수 있는 접속 일시, IP 주소, 브라우저 정보와
              관리자 작업 기록
            </li>
          </ul>
        </section>

        <section>
          <h2>2. 이용 목적</h2>
          <p>
            본인 확인, 학교생활 서비스 제공, 신청과 승인 업무 처리, 학생 간 소통, 서비스 보안, 장애
            대응과 운영 기록 확인을 위해 필요한 범위에서 정보를 이용합니다.
          </p>
        </section>

        <section>
          <h2>3. 보관과 삭제</h2>
          <p>
            정보는 해당 기능의 운영 목적과 학교의 기록 관리에 필요한 기간 동안만 보관하는 것을
            원칙으로 합니다. 기능별 구체적인 보존 기간과 학기·졸업 시점의 정리 기준은 학교 정책에
            맞춰 별도로 확정해야 하며, 목적이 끝난 정보는 복구하기 어려운 방식으로 삭제하도록 운영할
            예정입니다.
          </p>
        </section>

        <section>
          <h2>4. 외부 서비스</h2>
          <p>
            식단·학사일정 확인에는 공공 교육정보 API를, JBS와 기상곡의 영상 정보 확인에는 YouTube
            API를 이용할 수 있습니다. 호스팅과 네트워크 운영 과정에서는 서버·DNS·보안 서비스
            제공자가 기술적 정보를 처리할 수 있으므로, 실제 운영 전 계약과 설정에 따른 처리 범위를
            다시 확인해야 합니다.
          </p>
        </section>

        <section>
          <h2>5. 안전한 관리</h2>
          <p>
            계정 인증 정보의 원문 노출을 피하고, 역할별 접근 권한, 관리자 감사 기록, 전송 구간 보호,
            비밀값 분리 관리와 정기적인 백업·점검을 적용하는 방향으로 운영합니다.
          </p>
        </section>

        <section>
          <h2>6. 확인과 정정</h2>
          <p>
            자신의 계정이나 학생생활 정보가 실제와 다를 경우 해당 업무 담당 부서 또는 사이트 운영
            담당자에게 확인과 정정을 요청할 수 있습니다. 공식 문의 창구와 처리 절차는 운영 정책이
            확정된 뒤 이 페이지에 추가해야 합니다.
          </p>
        </section>

        <p className="privacy-document__updated">현재 구현 기준 안내 · 2026년 7월 16일</p>
      </article>
    </PageScaffold>
  );
}
