import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { BookOpen, PenLine, X } from 'lucide-react';
import {
  DataTablePagination,
  type DataTablePageSize,
  type DataTableSearchField,
  DataTableToolbar,
} from '../../components/page/DataTableControls';
import { ContentBadges } from '../../components/page/ContentBadges';
import { PageScaffold, PageState } from '../../components/page/PageScaffold';
import { listBreadcrumbs } from '../../components/page/pageHierarchy';
import { formatKoreanRelativeTime } from '../../shared/lib/date';
import { getBoardPosts } from './api';

export function BoardPage() {
  const [rulesOpen, setRulesOpen] = useState(false);
  const rawSearch = useSearch({ from: '/boards/free' });
  const search = {
    page: rawSearch.page ?? 1,
    pageSize: rawSearch.pageSize ?? 20,
    field: rawSearch.field ?? 'title_content',
    q: rawSearch.q ?? '',
  } as const;
  const navigate = useNavigate({ from: '/boards/free' });
  const postsQuery = useQuery({
    queryKey: ['board-posts', 'free', search.page, search.pageSize, search.field, search.q],
    queryFn: () => getBoardPosts('free', search),
    placeholderData: keepPreviousData,
  });
  const result = postsQuery.data;
  const posts = result?.items ?? [];

  const updateSearch = (
    next: Partial<{
      page: number;
      pageSize: DataTablePageSize;
      field: DataTableSearchField;
      q: string;
    }>,
  ) => {
    void navigate({
      search: (current) => ({ ...current, ...next }),
      replace: true,
    });
  };

  return (
    <PageScaffold
      breadcrumbs={listBreadcrumbs('board')}
      title="자유게시판"
      action={
        <div className="board-page-actions">
          <button
            className="detail-secondary-button"
            type="button"
            onClick={() => setRulesOpen(true)}
          >
            <BookOpen size={16} aria-hidden="true" /> 규정 보기
          </button>
          <Link className="detail-primary-button" to="/boards/free/new">
            <PenLine size={16} aria-hidden="true" /> 글쓰기
          </Link>
        </div>
      }
    >
      <section className="data-table-section" aria-label="자유게시판 목록">
        <DataTableToolbar
          key={`${search.field}:${search.q}`}
          total={result?.total ?? 0}
          page={result?.page ?? search.page}
          totalPages={result?.totalPages ?? 0}
          pageSize={search.pageSize}
          field={search.field}
          query={search.q}
          onPageSizeChange={(pageSize) => updateSearch({ page: 1, pageSize })}
          onSearch={(field, q) => updateSearch({ page: 1, field, q })}
        />

        {postsQuery.isLoading ? (
          <PageState kind="loading" variant="table" title="게시글을 불러오는 중입니다." />
        ) : null}
        {postsQuery.isError ? (
          <PageState
            kind="error"
            variant="table"
            title="게시글을 불러오지 못했습니다."
            description="네트워크 상태를 확인한 뒤 다시 시도해 주세요."
            action={
              <button
                className="detail-secondary-button"
                type="button"
                onClick={() => postsQuery.refetch()}
              >
                다시 시도
              </button>
            }
          />
        ) : null}
        {postsQuery.isSuccess && posts.length === 0 ? (
          <PageState
            kind="empty"
            variant="table"
            title={search.q ? '검색 결과가 없습니다.' : '등록된 게시글이 없습니다.'}
          />
        ) : null}

        {result && posts.length > 0 ? (
          <>
            <div className="data-table-viewport">
              <table className="data-table">
                <colgroup>
                  <col className="data-table__number-column" style={{ width: 76 }} />
                  <col />
                  <col className="data-table__author-column" style={{ width: 130 }} />
                  <col className="data-table__date-column" style={{ width: 140 }} />
                  <col className="data-table__views-column" style={{ width: 86 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="data-table__number" scope="col">
                      번호
                    </th>
                    <th scope="col">제목</th>
                    <th className="data-table__author" scope="col">
                      작성자
                    </th>
                    <th scope="col">등록일</th>
                    <th className="data-table__views" scope="col">
                      조회
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {posts.map((post, index) => (
                    <tr key={post.id}>
                      <td className="data-table__number">
                        {post.publicNumber ??
                          Math.max(result.total - (result.page - 1) * result.pageSize - index, 1)}
                      </td>
                      <td className="data-table__title-cell">
                        <Link
                          className="data-table__title-link"
                          to="/boards/free/$postId"
                          params={{ postId: String(post.id) }}
                        >
                          <span className="data-table__title-text">{post.title}</span>
                          {post.commentCount > 0 ? (
                            <span className="data-table__comment-count">
                              [{post.commentCount.toLocaleString('ko-KR')}]
                            </span>
                          ) : null}
                          <ContentBadges createdAt={post.createdAt} />
                        </Link>
                      </td>
                      <td className="data-table__author">
                        {post.isAnonymous ? '익명' : (post.authorName ?? '작성자')}
                      </td>
                      <td className="data-table__date">
                        <time dateTime={post.createdAt}>
                          {formatKoreanRelativeTime(post.createdAt)}
                        </time>
                      </td>
                      <td className="data-table__views">
                        {post.viewCount.toLocaleString('ko-KR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <DataTablePagination
              page={result.page}
              totalPages={result.totalPages}
              onChange={(page) => updateSearch({ page })}
            />
          </>
        ) : null}
      </section>
      {rulesOpen ? <BoardRulesModal onClose={() => setRulesOpen(false)} /> : null}
    </PageScaffold>
  );
}

function BoardRulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="board-rules-modal" role="presentation" onMouseDown={onClose}>
      <article
        aria-labelledby="board-rules-title"
        aria-modal="true"
        className="board-rules-modal__dialog"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <h2 id="board-rules-title">이용 규정</h2>
          </div>
          <button type="button" aria-label="규정 닫기" onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <div className="board-rules-modal__body">
          <section>
            <h3>1. 정의 및 목적</h3>
            <ul>
              <li>
                과구리 자유게시판은 사용자 간의 자유롭고 건전한 소통 및 정보 공유를 촉진하는 것을
                목적으로 합니다.
              </li>
              <li>
                관리자는 자유게시판의 원활한 운영을 책임지며, 규정에 따라 사용자 활동을 감독하고
                제재할 권한과 의무를 가진 자를 의미합니다.
              </li>
              <li>
                사용자는 과구리 자유게시판을 이용하는 모든 과구리 회원을 의미하며, 본 규정을 준수할
                의무가 있습니다.
              </li>
            </ul>
          </section>

          <section>
            <h3>2. 주의사항</h3>
            <ul>
              <li>이 규정을 읽지 않아 발생하는 모든 불이익은 사용자의 책임입니다.</li>
              <li>
                사용자는 규정에 동의하지 않을 수 있으나, 동의하지 않을 경우 자유게시판 이용이
                제한됩니다.
              </li>
              <li>과구리 자유게시판은 전남과학고등학교 재학생 또는 교직원만 이용할 수 있습니다.</li>
              <li>
                자유게시판 규정은 개정 이후 발생한 행위에 대해서만 적용됩니다. 개정 이전에 발생한
                사건이나 행위에는 개정된 규정이 소급 적용되지 않습니다. 단, IT부 회의를 거쳐 특정
                규정을 소급 적용할 수 있습니다.
              </li>
            </ul>
          </section>

          <section>
            <h3>3. 운영</h3>
            <h4>관리자</h4>
            <ul>
              <li>
                관리자는 IT부 전체 인원 및 자유게시판 운영 권한을 부여받은 담당자로 구성됩니다.
              </li>
              <li>
                관리자는 게시글 및 댓글 삭제, 답글 삭제, 게시글 이동, 닉네임 및 프로필 사진 변경
                등의 권한을 가집니다.
              </li>
            </ul>
            <h4>규정 개정</h4>
            <ul>
              <li>
                규정은 IT부의 재량에 따라 개정될 수 있으며, 개정된 규정은 공지된 즉시 효력을
                발휘합니다.
              </li>
              <li>
                개정 내역은 모든 사용자가 확인할 수 있는 방법으로 공지되어야 하며, 이를 어긴 개정은
                효력을 가지지 않습니다.
              </li>
            </ul>
          </section>

          <section>
            <h3>4. 제재</h3>
            <h4>제재의 종류</h4>
            <ul>
              <li>닉네임 및 프로필 사진 변경</li>
              <li>게시글 및 댓글 삭제</li>
              <li>게시글 작성 제한: 기한 한정 또는 무기한</li>
              <li>
                사용자에 대한 경고: 경고는 3개월간 유효하며, 유효한 경고가 남아있을 경우 가중 제재를
                적용할 수 있습니다.
              </li>
            </ul>
            <h4>닉네임 및 프로필 사진 규정</h4>
            <ul>
              <li>
                계정 주인의 이름이 아닌 인명, 관리자로 오인될 수 있는 내용, 폭력적이거나 선정적인
                내용, 욕설·비하·비방 표현, 청소년에게 유해한 내용이 포함된 닉네임은 사용할 수
                없습니다.
              </li>
              <li>
                음란 또는 선정적인 사진, 욕설·비하·비방 표현이 포함된 사진, 타인의 개인정보를
                노출하거나 타인의 사진을 이용해 모욕을 줄 수 있는 사진, 폭력 또는 신체 훼손을 묘사한
                사진, 저작권을 침해한 사진은 프로필 사진으로 사용할 수 없습니다.
              </li>
              <li>
                문제가 되는 닉네임은 최대 3회까지 무작위 닉네임으로 변경되며, 4회 이상 위반 시
                본인의 이름으로 변경되고 이후 수정이 제한됩니다.
              </li>
              <li>
                문제가 되는 프로필 사진은 최대 3회까지 기본 프로필 사진으로 변경되며, 4회 이상 위반
                시 기본 프로필 사진으로 고정되고 이후 수정이 제한됩니다.
              </li>
              <li>
                규정에 명시되지 않았더라도 IT부 판단에 따라 문제가 될 수 있는 닉네임이나 프로필
                사진은 제재 대상이 될 수 있습니다.
              </li>
            </ul>
            <h4>게시글 및 댓글 규정</h4>
            <ul>
              <li>작성 제한을 동반하는 항목은 게시글 또는 댓글을 삭제 처리할 수 있습니다.</li>
              <li>
                규정 위반에 해당하나 관리자가 사안이 경미하다고 판단하는 경우 경고 처리할 수
                있습니다.
              </li>
              <li>
                욕설 및 비속어 사용, 당사자의 삭제 요청이 있는 게시글 또는 댓글은 삭제 처리됩니다.
              </li>
              <li>
                동일 목적의 반복 게시 또는 정치적 내용은 문제가 되는 경우 1일 작성 제한 처리됩니다.
              </li>
              <li>
                타인의 저작물을 허락 없이 게시하는 행위는 문제가 되는 경우 7일 작성 제한 처리됩니다.
              </li>
              <li>
                폭력적이거나 선정적인 내용, 청소년에게 유해한 내용, 허위 사실이나 타인의 명예를
                훼손하는 내용, 특정 집단이나 개인의 사회적 명예를 비하하는 내용은 문제가 되는 경우
                30일 작성 제한 처리됩니다.
              </li>
              <li>
                자유게시판이나 댓글을 통한 보안 공격 시도 또는 의심 행위는 무기한 작성 제한
                처리됩니다.
              </li>
            </ul>
            <h4>가중 제재</h4>
            <ul>
              <li>
                동일하거나 유사한 항목을 반복해서 위반하는 경우, 또는 관리자가 가중 제재가
                필요하다고 판단하는 경우 이전 제재 내역에 따라 가중 제재할 수 있습니다.
              </li>
              <li>6개월 이상 경과된 제재 내역은 가중 제재의 근거가 될 수 없습니다.</li>
            </ul>
            <h4>제재 소명</h4>
            <ul>
              <li>
                제재에 이의가 있거나 규정 위반을 반성하는 경우 지정된 소명 창구를 통해 소명할 수
                있습니다.
              </li>
              <li>소명을 통해 제재 기간이 단축되거나 제재가 취소될 수 있습니다.</li>
              <li>동일한 사안에 대해 반복적으로 소명 신청을 할 경우 신청이 기각될 수 있습니다.</li>
              <li>
                소명은 제재와 무관한 관리자가 처리하며, 소명 신청을 사유로 가중 제재할 수 없습니다.
              </li>
              <li>
                소명을 통해 특정 관리자가 권한을 남용한 것이 확인될 경우, IT부 부장 또는 차장은 해당
                관리자의 권한을 일시적 또는 영구적으로 제한할 수 있습니다.
              </li>
            </ul>
          </section>

          <section>
            <h3>5. 기타</h3>
            <h4>계정 도용</h4>
            <ul>
              <li>
                계정 도용으로 인해 문제의 소지가 있는 게시글 또는 댓글이 작성된 경우, 해당 행위에
                대한 책임은 계정 소유자에게 있습니다.
              </li>
              <li>
                계정 도용 피해자가 도용 가해자를 명확하게 입증할 수 있고 IT부 조사 결과 해당 인물이
                도용 가해자로 확인될 경우, 가해자는 가중 제재 단계에 따라 최대 무기한 작성 제한까지
                제재를 받을 수 있습니다.
              </li>
            </ul>
            <h4>임시 조치</h4>
            <ul>
              <li>
                정보통신망 이용촉진 및 정보보호 등에 관한 법률 제44조의2 및 제44조의3에 따라
                삭제요청 또는 임시조치를 신청할 수 있습니다.
              </li>
              <li>
                임시 조치는 권리 침해 사실을 확인할 수 있는 자료와 권리자 본인 또는 대리인임을
                증명할 수 있는 자료를 함께 제출하는 방식으로 신청할 수 있습니다.
              </li>
              <li>
                임시 조치 기간은 30일 이내이며, 게시자는 임시 조치 기간 동안 이의를 제기할 수
                있습니다. 합리적인 이의 제기가 있는 경우 게시글은 복구될 수 있으며, 유효한 이의 제기
                없이 기간이 경과한 경우 게시글은 삭제될 수 있습니다.
              </li>
              <li>
                임시 조치가 받아들여진 경우 관리자는 조치의 내용과 사유를 사용자가 확인할 수 있는
                방법으로 공지해야 합니다.
              </li>
            </ul>
          </section>
        </div>
      </article>
    </div>
  );
}
