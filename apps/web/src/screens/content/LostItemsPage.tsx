import type { FormEvent } from 'react';
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LostItemSummary } from '@jshsus/types';
import { Flag, PackagePlus, PackageSearch, Paperclip } from 'lucide-react';
import { PageHeader, Panel, StateMessage, StatusBadge } from '../../components/PortalUi';
import { createContentReport, createLostItem, getLostItems, uploadFile } from '../../lib/api';
import { createKoreanDateFormatter } from '../../lib/date';

const lostItemStatusLabels: Record<LostItemSummary['status'], string> = {
  open: '접수 중',
  matched: '주인 확인',
  closed: '처리 완료',
  hidden: '비공개',
};

const lostItemStatusTones: Record<
  LostItemSummary['status'],
  'brand' | 'neutral' | 'positive' | 'warning'
> = {
  open: 'brand',
  matched: 'warning',
  closed: 'positive',
  hidden: 'neutral',
};

const lostItemDateFormatter = createKoreanDateFormatter({
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

export function LostItemsPage() {
  const queryClient = useQueryClient();
  const lostItemsQuery = useQuery({ queryKey: ['lost-items'], queryFn: getLostItems });
  const [form, setForm] = useState({
    type: 'found' as 'lost' | 'found',
    itemName: '',
    location: '',
    occurredAt: '',
    description: '',
  });
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const createMutation = useMutation({
    mutationFn: async (input: typeof form & { file: File | null }) => {
      const result = await createLostItem({
        type: input.type,
        itemName: input.itemName,
        location: input.location,
        occurredAt: input.occurredAt
          ? new Date(`${input.occurredAt}T09:00:00`).toISOString()
          : undefined,
        description: input.description,
      });

      if (input.file) {
        await uploadFile({
          file: input.file,
          targetType: 'lost_item',
          targetId: result.lostItem.id,
          visibility: 'public',
        });
      }

      return result;
    },
    onSuccess: async () => {
      setForm({ type: 'found', itemName: '', location: '', occurredAt: '', description: '' });
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      await queryClient.invalidateQueries({ queryKey: ['lost-items'] });
    },
  });
  const reportMutation = useMutation({ mutationFn: createContentReport });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createMutation.mutate({ ...form, file });
  };

  const lostItems = lostItemsQuery.data ?? [];
  const openCount = lostItems.filter((item) => item.status === 'open').length;

  return (
    <div className="portal-page">
      <PageHeader
        eyebrow="학교생활"
        title="분실물"
        description="학교에서 잃어버리거나 습득한 물건을 등록하고 처리 상태를 확인하세요."
        stat={{ icon: PackageSearch, label: '접수 중', value: `${openCount}건` }}
      />

      <Panel
        title="분실·습득 등록"
        description="물건을 찾기 쉽도록 장소와 특징을 구체적으로 적어 주세요."
        icon={PackagePlus}
      >
        <form className="portal-form" onSubmit={handleSubmit}>
          <div className="portal-form__grid">
            <label className="portal-field" htmlFor="lost-item-type">
              <span className="portal-field__label">등록 구분</span>
              <select
                id="lost-item-type"
                value={form.type}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    type: event.target.value as 'lost' | 'found',
                  }))
                }
              >
                <option value="found">습득한 물건</option>
                <option value="lost">잃어버린 물건</option>
              </select>
            </label>
            <label className="portal-field" htmlFor="lost-item-name">
              <span className="portal-field__label">물건 이름</span>
              <input
                id="lost-item-name"
                value={form.itemName}
                onChange={(event) =>
                  setForm((current) => ({ ...current, itemName: event.target.value }))
                }
                maxLength={160}
                placeholder="예: 검은색 무선 이어폰"
                required
              />
            </label>
            <label className="portal-field" htmlFor="lost-item-location">
              <span className="portal-field__label">분실·습득 장소</span>
              <input
                id="lost-item-location"
                value={form.location}
                onChange={(event) =>
                  setForm((current) => ({ ...current, location: event.target.value }))
                }
                maxLength={160}
                placeholder="예: 본관 2층 복도"
              />
            </label>
            <label className="portal-field" htmlFor="lost-item-date">
              <span className="portal-field__label">분실·습득 일자</span>
              <input
                id="lost-item-date"
                type="date"
                value={form.occurredAt}
                onChange={(event) =>
                  setForm((current) => ({ ...current, occurredAt: event.target.value }))
                }
              />
            </label>
            <label className="portal-field portal-field--wide" htmlFor="lost-item-description">
              <span className="portal-field__label">상세 설명</span>
              <textarea
                id="lost-item-description"
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
                rows={4}
                placeholder="물건의 색상, 특징, 보관 장소 등을 적어 주세요."
              />
            </label>
            <label className="portal-field portal-field--wide" htmlFor="lost-item-file">
              <span className="portal-field__label">사진 첨부</span>
              <input
                id="lost-item-file"
                ref={fileInputRef}
                type="file"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              <span className="portal-field__hint">
                물건을 식별할 수 있는 사진 한 장을 첨부할 수 있습니다.
              </span>
            </label>
          </div>
          <div className="portal-actions">
            <button
              className="portal-button portal-button--primary"
              type="submit"
              disabled={createMutation.isPending}
            >
              <PackagePlus size={16} aria-hidden="true" />
              {createMutation.isPending ? '등록 중…' : '분실물 등록'}
            </button>
          </div>
        </form>
        {createMutation.isSuccess ? (
          <p className="action-feedback" role="status">
            분실물 정보가 등록되었습니다.
          </p>
        ) : null}
        {createMutation.isError ? (
          <StateMessage
            kind="error"
            title="분실물 정보를 등록하지 못했습니다."
            description="로그인 상태와 입력 내용을 확인해 주세요."
            compact
          />
        ) : null}
      </Panel>

      <Panel
        title="분실물 목록"
        icon={PackageSearch}
        action={<span className="portal-panel__count">총 {lostItems.length}건</span>}
      >
        {lostItemsQuery.isLoading ? (
          <StateMessage kind="loading" title="분실물 정보를 불러오고 있습니다." />
        ) : null}
        {lostItemsQuery.isError ? (
          <StateMessage
            kind="error"
            title="분실물 정보를 불러오지 못했습니다."
            description="잠시 후 다시 시도해 주세요."
          />
        ) : null}
        {lostItemsQuery.isSuccess && lostItems.length === 0 ? (
          <StateMessage
            kind="empty"
            title="등록된 분실물이 없습니다."
            description="새로운 분실·습득 정보가 등록되면 이곳에 표시됩니다."
          />
        ) : null}
        {lostItems.length > 0 ? (
          <div className="item-list">
            {lostItems.map((item) => (
              <article className="item-card lost-item-card" key={item.id}>
                <div className="item-card__main">
                  <div className="item-card__meta">
                    <StatusBadge tone={item.type === 'found' ? 'info' : 'warning'}>
                      {item.type === 'found' ? '습득' : '분실'}
                    </StatusBadge>
                    <span>{item.location || '장소 미입력'}</span>
                    {item.occurredAt ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <time dateTime={item.occurredAt}>
                          {lostItemDateFormatter.format(new Date(item.occurredAt))}
                        </time>
                      </>
                    ) : null}
                  </div>
                  <h3 className="item-card__title">{item.itemName}</h3>
                  {item.description ? (
                    <p className="item-card__content">{item.description}</p>
                  ) : null}
                  {item.attachments?.length ? (
                    <div className="attachment-list" aria-label="첨부 파일">
                      {item.attachments.map((fileItem) => (
                        <a className="attachment-chip" href={fileItem.url} key={fileItem.id}>
                          <Paperclip size={14} aria-hidden="true" />
                          {fileItem.originalName}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="item-card__aside">
                  <StatusBadge tone={lostItemStatusTones[item.status]}>
                    {lostItemStatusLabels[item.status]}
                  </StatusBadge>
                  <button
                    className="portal-button portal-button--text"
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
                    <Flag size={14} aria-hidden="true" />
                    {reportMutation.isPending && reportMutation.variables?.targetId === item.id
                      ? '신고 중…'
                      : '정보 신고'}
                  </button>
                  {reportMutation.isSuccess && reportMutation.variables?.targetId === item.id ? (
                    <span className="action-feedback" role="status">
                      신고가 접수되었습니다.
                    </span>
                  ) : null}
                  {reportMutation.isError && reportMutation.variables?.targetId === item.id ? (
                    <span className="action-feedback action-feedback--error" role="alert">
                      신고하지 못했습니다.
                    </span>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
