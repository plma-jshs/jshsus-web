import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft, Flag, ImageOff, MapPin, Paperclip } from 'lucide-react';
import { PageScaffold, PageState } from '../../components/page/PageScaffold';
import { ApiError } from '../../shared/api/http';
import { createContentReport } from '../../shared/api/reports';
import { createKoreanDateFormatter } from '../../shared/lib/date';
import { authActionRequiresLogin } from '../auth/action-access';
import { getSession } from '../auth/api';
import { getLostItem } from './api';
import { lostStatusLabels } from './presentation';
import '../../styles/lost-items.css';

const dateFormatter = createKoreanDateFormatter({
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function LostItemDetailPage() {
  const { itemId } = useParams({ from: '/lost-items/$itemId' });
  const id = Number(itemId);
  const itemQuery = useQuery({
    queryKey: ['lost-item', id],
    queryFn: () => getLostItem(id),
    enabled: Number.isSafeInteger(id) && id > 0,
  });
  const item = itemQuery.data;
  const sessionQuery = useQuery({ queryKey: ['session'], queryFn: getSession });
  const reportMutation = useMutation({ mutationFn: createContentReport });

  if (itemQuery.isLoading) {
    return (
      <PageScaffold
        breadcrumbs={[{ label: '분실물', to: '/lost-items' }]}
        title="분실물"
        width="wide"
        variant="document"
      >
        <PageState kind="loading" title="분실물 정보를 불러오는 중입니다." variant="page" />
      </PageScaffold>
    );
  }
  if (
    itemQuery.isError &&
    !(itemQuery.error instanceof ApiError && itemQuery.error.status === 404)
  ) {
    return (
      <PageScaffold
        breadcrumbs={[{ label: '분실물', to: '/lost-items' }]}
        title="분실물"
        width="wide"
        variant="document"
      >
        <PageState
          kind="error"
          title="분실물 정보를 불러오지 못했습니다."
          description="잠시 후 다시 시도해 주세요."
          variant="page"
        />
      </PageScaffold>
    );
  }
  if (!item || !Number.isSafeInteger(id) || id < 1) {
    return (
      <PageScaffold
        breadcrumbs={[{ label: '분실물', to: '/lost-items' }]}
        title="분실물을 찾을 수 없습니다"
        width="wide"
        variant="document"
      >
        <PageState kind="empty" title="삭제되었거나 공개되지 않은 분실물입니다." variant="page" />
      </PageScaffold>
    );
  }

  const image = item.attachments?.find((file) => file.mimeType.startsWith('image/'));
  const files = item.attachments?.filter((file) => file.id !== image?.id) ?? [];
  const reportNeedsLogin = authActionRequiresLogin(sessionQuery.data, reportMutation.error);

  return (
    <PageScaffold
      breadcrumbs={[{ label: '학교생활' }, { label: '분실물', to: '/lost-items' }]}
      title={item.itemName}
      width="wide"
      variant="document"
    >
      <article className="lost-item-detail">
        <div className="lost-item-detail__overview">
          <div className="lost-item-detail__visual">
            {image ? (
              <img src={image.inlineUrl} alt={`${item.itemName} 사진`} />
            ) : (
              <span>
                <ImageOff size={28} aria-hidden="true" />
                등록된 사진이 없습니다.
              </span>
            )}
          </div>
          <div className="lost-item-detail__summary">
            <div className="lost-item-detail__labels">
              <span className={`lost-type is-${item.type}`}>
                {item.type === 'lost' ? '분실' : '습득'}
              </span>
              <span className={`lost-status is-${item.status}`}>
                {lostStatusLabels[item.status]}
              </span>
            </div>
            <dl>
              <div>
                <dt>
                  <MapPin size={15} aria-hidden="true" /> 장소
                </dt>
                <dd>{item.location || '입력되지 않음'}</dd>
              </div>
              <div>
                <dt>일시</dt>
                <dd>
                  {item.occurredAt
                    ? dateFormatter.format(new Date(item.occurredAt))
                    : '입력되지 않음'}
                </dd>
              </div>
              <div>
                <dt>등록자</dt>
                <dd>{item.authorName ?? '학생'}</dd>
              </div>
            </dl>
          </div>
        </div>

        <section className="lost-item-detail__section" aria-labelledby="lost-item-description">
          <h2 id="lost-item-description">물건 설명</h2>
          <p>{item.description || '등록된 설명이 없습니다.'}</p>
        </section>

        {files.length ? (
          <section className="lost-item-detail__section" aria-labelledby="lost-item-files">
            <h2 id="lost-item-files">첨부 파일</h2>
            <div className="lost-item-detail__files">
              {files.map((file) => (
                <a href={file.url} key={file.id} download>
                  <Paperclip size={15} aria-hidden="true" />
                  <span>{file.originalName}</span>
                </a>
              ))}
            </div>
          </section>
        ) : null}

        <footer className="lost-item-detail__footer">
          <div aria-live="polite">
            {reportMutation.isSuccess ? <span>신고가 접수되었습니다.</span> : null}
            {reportMutation.isError && !reportNeedsLogin ? (
              <span>신고를 접수하지 못했습니다.</span>
            ) : null}
          </div>
          {sessionQuery.isLoading ? (
            <button type="button" disabled>
              로그인 상태 확인 중
            </button>
          ) : reportNeedsLogin ? (
            <Link
              className="auth-required-action"
              to="/login"
              search={{ returnTo: `/lost-items/${itemId}` }}
            >
              <Flag size={14} aria-hidden="true" /> 로그인하고 신고
            </Link>
          ) : (
            <button
              type="button"
              onClick={() =>
                reportMutation.mutate({
                  targetType: 'lost_item',
                  targetId: item.id,
                  reason: '분실물 정보 확인 필요',
                })
              }
              disabled={reportMutation.isPending || reportMutation.isSuccess}
            >
              <Flag size={14} aria-hidden="true" />
              {reportMutation.isPending
                ? '접수 중'
                : reportMutation.isSuccess
                  ? '접수 완료'
                  : '정보 신고'}
            </button>
          )}
        </footer>
      </article>
      <div className="lost-item-detail__back">
        <Link className="detail-secondary-button" to="/lost-items">
          <ArrowLeft size={16} aria-hidden="true" /> 목록으로
        </Link>
      </div>
    </PageScaffold>
  );
}
