import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft, Download, Eye, Paperclip } from 'lucide-react';
import { getRichTextImageSources, RichTextContent } from '../../components/editor/RichTextEditor';
import { useToast } from '../../components/feedback/Toast';
import { ContentDetailHeader } from '../../components/page/ContentDetailHeader';
import { ContentMoreMenu } from '../../components/page/ContentMoreMenu';
import { PageScaffold, PageState } from '../../components/page/PageScaffold';
import { detailBreadcrumbs } from '../../components/page/pageHierarchy';
import { ApiError } from '../../shared/api/http';
import { getSession } from '../auth/api';
import { deleteNotice, getNotice } from './api';
import { parseRichNoticeContent } from './richNoticeContent';

export function NoticeDetailPage() {
  const { noticeId } = useParams({ from: '/notices/$noticeId' });
  const numericId = Number(noticeId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const noticeQuery = useQuery({
    queryKey: ['notice', numericId],
    queryFn: () => getNotice(numericId),
    enabled: Number.isInteger(numericId) && numericId > 0,
  });
  const sessionQuery = useQuery({ queryKey: ['session'], queryFn: getSession });
  const notice = noticeQuery.data;
  const canManage =
    sessionQuery.data?.isLogined &&
    (sessionQuery.data.roles?.includes('system_admin') ||
      sessionQuery.data.permissions.includes('notices.manage'));
  const deleteMutation = useMutation({
    mutationFn: () => deleteNotice(numericId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['notices'] }),
        queryClient.invalidateQueries({ queryKey: ['home-dashboard'] }),
      ]);
      await navigate({ to: '/notices' });
      showToast({ title: '공지를 삭제했습니다.', tone: 'success' });
    },
    onError: () =>
      showToast({
        title: '공지를 삭제하지 못했습니다.',
        description: '권한과 네트워크 상태를 확인한 뒤 다시 시도해 주세요.',
        tone: 'danger',
      }),
  });

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
          actions={
            canManage ? (
              <ContentMoreMenu
                deleteDisabled={deleteMutation.isPending}
                onDelete={() => {
                  if (window.confirm('이 공지를 삭제하시겠습니까?')) deleteMutation.mutate();
                }}
                onEdit={() =>
                  void navigate({
                    to: '/notices/$noticeId/edit',
                    params: { noticeId: String(notice.id) },
                  })
                }
              />
            ) : undefined
          }
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
