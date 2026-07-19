import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft, Flag, ImageOff, MapPin, Paperclip, Pencil, Trash2 } from 'lucide-react';
import { PageScaffold, PageState } from '../../components/page/PageScaffold';
import { detailBreadcrumbs } from '../../components/page/pageHierarchy';
import { ApiError } from '../../shared/api/http';
import { createContentReport } from '../../shared/api/reports';
import { createKoreanDateFormatter } from '../../shared/lib/date';
import { authActionRequiresLogin } from '../auth/action-access';
import { getSession } from '../auth/api';
import { discardLostItem, getLostItem, updateLostItem, updateLostItemStatus } from './api';
import { lostStatusLabels } from './presentation';
import '../../styles/lost-items.css';

const dateFormatter = createKoreanDateFormatter({
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function toLocalDateTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function LostItemDetailPage() {
  const { itemId } = useParams({ from: '/lost-items/$itemId' });
  const id = Number(itemId);
  const itemQuery = useQuery({
    queryKey: ['lost-item', id],
    queryFn: () => getLostItem(id),
    enabled: Number.isSafeInteger(id) && id > 0,
  });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const item = itemQuery.data;
  const sessionQuery = useQuery({ queryKey: ['session'], queryFn: getSession });
  const reportMutation = useMutation({ mutationFn: createContentReport });
  const updateMutation = useMutation({
    mutationFn: (input: Parameters<typeof updateLostItem>[1]) => updateLostItem(id, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['lost-item', id] }),
        queryClient.invalidateQueries({ queryKey: ['lost-items'] }),
      ]);
      setIsEditing(false);
    },
  });
  const statusMutation = useMutation({
    mutationFn: (status: 'PROCESSING' | 'RETURNED') => updateLostItemStatus(id, status),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['lost-item', id] }),
        queryClient.invalidateQueries({ queryKey: ['lost-items'] }),
      ]);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => discardLostItem(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['lost-items'] });
      await navigate({ to: '/lost-items' });
    },
  });

  function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const occurredAt = String(data.get('occurredAt') ?? '');
    updateMutation.mutate({
      type: data.get('type') === 'found' ? 'found' : 'lost',
      itemName: String(data.get('itemName') ?? ''),
      location: String(data.get('location') ?? ''),
      occurredAt: occurredAt ? new Date(occurredAt).toISOString() : undefined,
      description: String(data.get('description') ?? ''),
    });
  }

  if (itemQuery.isLoading) {
    return (
      <PageScaffold
        breadcrumbs={detailBreadcrumbs('lostItems')}
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
        breadcrumbs={detailBreadcrumbs('lostItems')}
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
        breadcrumbs={detailBreadcrumbs('lostItems')}
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
      breadcrumbs={detailBreadcrumbs('lostItems')}
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

        {item.canEdit ? (
          <section className="lost-item-owner" aria-label="내 분실물 관리">
            <label>
              <span>처리 상태</span>
              <select
                value={item.status}
                disabled={statusMutation.isPending}
                onChange={(event) =>
                  statusMutation.mutate(event.target.value as 'PROCESSING' | 'RETURNED')
                }
              >
                <option value="PROCESSING">처리 중</option>
                <option value="RETURNED">반환 완료</option>
              </select>
            </label>
            <div className="lost-item-owner__actions">
              <button type="button" onClick={() => setIsEditing((value) => !value)}>
                <Pencil size={15} aria-hidden="true" /> 수정
              </button>
              <button
                className="is-danger"
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  if (window.confirm('이 분실물 게시물을 삭제할까요?')) deleteMutation.mutate();
                }}
              >
                <Trash2 size={15} aria-hidden="true" />
                {deleteMutation.isPending ? '삭제 중' : '삭제'}
              </button>
            </div>
          </section>
        ) : null}

        {item.canEdit && isEditing ? (
          <form className="lost-item-owner-edit" onSubmit={submitEdit}>
            <div className="lost-item-owner-edit__grid">
              <label>
                <span>구분</span>
                <select name="type" defaultValue={item.type}>
                  <option value="lost">분실</option>
                  <option value="found">습득</option>
                </select>
              </label>
              <label>
                <span>물건 이름</span>
                <input name="itemName" defaultValue={item.itemName} required maxLength={160} />
              </label>
              <label>
                <span>장소</span>
                <input name="location" defaultValue={item.location} maxLength={160} />
              </label>
              <label>
                <span>일시</span>
                <input
                  name="occurredAt"
                  type="datetime-local"
                  defaultValue={toLocalDateTime(item.occurredAt)}
                />
              </label>
            </div>
            <label className="lost-item-owner-edit__description">
              <span>물건 설명</span>
              <textarea
                name="description"
                defaultValue={item.description ?? ''}
                rows={5}
                maxLength={2000}
              />
            </label>
            {updateMutation.isError ? (
              <p className="lost-item-owner-edit__error" role="alert">
                수정 내용을 저장하지 못했습니다.
              </p>
            ) : null}
            <div className="lost-item-owner-edit__actions">
              <button type="button" onClick={() => setIsEditing(false)}>
                취소
              </button>
              <button
                className="detail-primary-button"
                type="submit"
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? '저장 중' : '저장'}
              </button>
            </div>
          </form>
        ) : null}

        {statusMutation.isError || deleteMutation.isError ? (
          <p className="lost-item-owner__error" role="alert">
            요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.
          </p>
        ) : null}

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
              className="auth-required-action content-report-action"
              to="/login"
              search={{ returnTo: `/lost-items/${itemId}` }}
            >
              <Flag size={14} aria-hidden="true" /> 신고
            </Link>
          ) : (
            <button
              className="content-report-action"
              type="button"
              onClick={() =>
                reportMutation.mutate({
                  targetType: 'lost_item',
                  targetId: item.id,
                  reason: '분실물 정보 확인 필요',
                })
              }
              disabled={reportMutation.isPending}
            >
              <Flag
                className={reportMutation.isSuccess ? 'is-filled' : undefined}
                size={14}
                aria-hidden="true"
              />
              신고
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
