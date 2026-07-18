import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft, Download, Eye, Paperclip } from 'lucide-react';
import { getRichTextImageSources, RichTextContent } from '../../components/editor/RichTextEditor';
import { ContentDetailHeader } from '../../components/page/ContentDetailHeader';
import { PageScaffold, PageState } from '../../components/page/PageScaffold';
import { detailBreadcrumbs } from '../../components/page/pageHierarchy';
import { ApiError } from '../../shared/api/http';
import { getNotice } from './api';
import { parseRichNoticeContent } from './richNoticeContent';

export function NoticeDetailPage() {
  const { noticeId } = useParams({ from: '/notices/$noticeId' });
  const numericId = Number(noticeId);
  const noticeQuery = useQuery({
    queryKey: ['notice', numericId],
    queryFn: () => getNotice(numericId),
    enabled: Number.isInteger(numericId) && numericId > 0,
  });
  const notice = noticeQuery.data;

  if (noticeQuery.isLoading) {
    return <PageState kind="loading" title="공지를 불러오는 중입니다." />;
  }

  if (noticeQuery.isError || !notice) {
    const status = noticeQuery.error instanceof ApiError ? noticeQuery.error.status : 0;
    const isNotFound = !Number.isInteger(numericId) || numericId < 1 || status === 404;
    const isForbidden = status === 401 || status === 403;
    return (
      <PageScaffold
        breadcrumbs={detailBreadcrumbs('notices')}
        title={
          isNotFound
            ? '공지를 찾을 수 없습니다'
            : isForbidden
              ? '공개되지 않은 공지입니다'
              : '공지를 불러오지 못했습니다'
        }
        width="reading"
        variant="document"
      >
        <PageState
          kind="error"
          variant="page"
          title={
            isNotFound
              ? '요청한 공지가 존재하지 않습니다.'
              : isForbidden
                ? '이 공지를 볼 권한이 없습니다.'
                : '서버와 통신하지 못했습니다.'
          }
          description={
            isNotFound
              ? '주소를 확인하거나 공지 목록으로 돌아가 주세요.'
              : isForbidden
                ? '로그인 상태를 확인하거나 공지 목록으로 돌아가 주세요.'
                : '잠시 후 다시 시도해 주세요.'
          }
          action={
            isNotFound || isForbidden ? (
              <Link className="detail-secondary-button" to="/notices">
                공지 목록으로
              </Link>
            ) : (
              <button
                className="detail-secondary-button"
                type="button"
                onClick={() => noticeQuery.refetch()}
              >
                다시 시도
              </button>
            )
          }
        />
      </PageScaffold>
    );
  }

  const richContent = parseRichNoticeContent(notice.content);
  const inlineImageSources = getRichTextImageSources(richContent.contentDoc);
  const downloadableAttachments = notice.attachments.filter(
    (file) =>
      !inlineImageSources.has(file.inlineUrl) &&
      !inlineImageSources.has(`/api/files/${file.id}/content`),
  );

  return (
    <PageScaffold breadcrumbs={detailBreadcrumbs('notices')} width="reading" variant="document">
      <article className="reading-surface">
        <ContentDetailHeader
          title={notice.title}
          author={notice.department}
          createdAt={notice.publishedAt}
        >
          <span>
            <Eye size={14} aria-hidden="true" />
            <span className="sr-only">조회 </span>
            {notice.viewCount.toLocaleString('ko-KR')}
          </span>
        </ContentDetailHeader>
        <div className="reading-body">
          <RichTextContent contentDoc={richContent.contentDoc} plainText={richContent.plainText} />
        </div>
        {downloadableAttachments.length ? (
          <section className="detail-attachments" aria-labelledby="notice-attachments-title">
            <h2 id="notice-attachments-title">
              <Paperclip size={16} aria-hidden="true" /> 첨부파일
            </h2>
            {downloadableAttachments.map((file) => (
              <a href={file.url} key={file.id}>
                <span>{file.originalName}</span>
                <Download size={16} aria-hidden="true" />
              </a>
            ))}
          </section>
        ) : null}
      </article>
      <div className="detail-bottom-actions">
        <Link className="detail-secondary-button" to="/notices">
          <ArrowLeft size={16} aria-hidden="true" /> 목록으로
        </Link>
      </div>
    </PageScaffold>
  );
}
