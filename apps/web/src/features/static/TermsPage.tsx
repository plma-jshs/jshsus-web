import { PageScaffold } from '../../components/page/PageScaffold';
import '../../styles/static-pages.css';

export function TermsPage() {
  return (
    <PageScaffold
      breadcrumbs={[{ label: '서비스 이용약관' }]}
      title="서비스 이용약관"
      width="reading"
      variant="document"
    >
      <article className="static-document privacy-document">
        <section>
          <h2>1. 목적</h2>
          <p>
            이 약관은 전남과학고등학교 학생 정보 포털 과구리가 제공하는 통합로그인, 학교생활,
            커뮤니티 및 교내 도구의 이용 조건과 운영 기준을 정하는 것을 목적으로 합니다.
          </p>
        </section>
        <section>
          <h2>2. 계정과 이용 자격</h2>
          <p>
            계정은 학교가 발급한 학번 또는 교사번호와 인증코드로 활성화합니다. 이용자는 자신의
            계정을 다른 사람에게 양도하거나 공유할 수 없으며, 연락처와 비밀번호를 안전하게 관리해야
            합니다.
          </p>
        </section>
        <section>
          <h2>3. 서비스 이용</h2>
          <p>
            이용자는 학교 규정과 관계 법령을 준수해야 합니다. 타인의 권리를 침해하거나 학교 업무를
            방해하는 게시물, 허위 신청, 계정 도용 및 서비스의 정상 운영을 방해하는 행위는 제한될 수
            있습니다.
          </p>
        </section>
        <section>
          <h2>4. 게시물과 자료</h2>
          <p>
            게시물의 책임은 작성자에게 있습니다. 운영자는 개인정보 침해, 명예훼손, 불법 정보 또는
            학교 운영 원칙을 위반한 자료를 필요한 범위에서 숨기거나 삭제할 수 있습니다.
          </p>
        </section>
        <section>
          <h2>5. 서비스 변경과 중단</h2>
          <p>
            보안 점검, 장애 복구, 학년도 전환 또는 학교 운영상 필요한 경우 서비스의 전부나 일부가
            변경 또는 일시 중단될 수 있습니다. 중요한 변경은 가능한 범위에서 사전에 안내합니다.
          </p>
        </section>
        <section>
          <h2>6. 개인정보 보호</h2>
          <p>
            개인정보의 처리 목적, 항목, 보유 기간과 이용자의 권리는 개인정보 처리 방침에 따릅니다.
          </p>
        </section>
        <section>
          <h2>7. 문의와 약관 변경</h2>
          <p>
            이용 중 문제가 있으면 학교 담당 부서 또는 IT부에 문의할 수 있습니다. 약관이 변경되는
            경우 적용일과 주요 내용을 서비스 화면에 안내합니다.
          </p>
        </section>
        <p className="privacy-document__updated">시행일: 2026년 8월 3일</p>
      </article>
    </PageScaffold>
  );
}
