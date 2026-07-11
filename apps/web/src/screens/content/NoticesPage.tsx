import { useQuery } from '@tanstack/react-query';
import { Megaphone } from 'lucide-react';
import { getNotices } from '../../lib/api';

export function NoticesPage() {
  const noticesQuery = useQuery({ queryKey: ['notices'], queryFn: getNotices });

  return (
    <div className="dashboard">
      <section className="status-band">
        <div>
          <span className="eyebrow">공지</span>
          <h2>학교 공지사항</h2>
          <p>학생생활부와 학교 부서에서 게시한 안내를 확인합니다.</p>
        </div>
        <div className="today-card">
          <Megaphone size={20} />
          <span>고정 공지</span>
          <strong>{(noticesQuery.data ?? []).filter((notice) => notice.pinned).length}건</strong>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <Megaphone size={19} />
          <h2>공지 목록</h2>
        </div>
        {noticesQuery.isLoading ? <p className="empty-text">공지를 불러오는 중입니다.</p> : null}
        {noticesQuery.isError ? <p className="empty-text">공지 API 연결을 확인해주세요.</p> : null}
        <div className="list-stack">
          {(noticesQuery.data ?? []).map((notice) => (
            <article className="list-row expanded" key={notice.id}>
              <div>
                <span className="row-meta">
                  {notice.department} · {new Date(notice.publishedAt).toLocaleDateString('ko-KR')}
                </span>
                <h3>{notice.title}</h3>
                <p>{notice.content}</p>
              </div>
              {notice.pinned ? <span className="badge">고정</span> : null}
            </article>
          ))}
          {noticesQuery.data?.length === 0 ? (
            <p className="empty-text">등록된 공지가 없습니다.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
