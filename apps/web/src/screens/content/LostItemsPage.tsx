import type { FormEvent } from 'react';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PackagePlus, PackageSearch } from 'lucide-react';
import { createContentReport, createLostItem, getLostItems, uploadFile } from '../../lib/api';

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
      await queryClient.invalidateQueries({ queryKey: ['lost-items'] });
    },
  });
  const reportMutation = useMutation({ mutationFn: createContentReport });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createMutation.mutate({ ...form, file });
  };

  return (
    <div className="dashboard">
      <section className="status-band">
        <div>
          <span className="eyebrow">분실물</span>
          <h2>분실·습득 접수</h2>
          <p>학교 안에서 잃어버렸거나 습득한 물건을 등록하고 상태를 확인합니다.</p>
        </div>
        <div className="today-card">
          <PackageSearch size={20} />
          <span>열린 접수</span>
          <strong>
            {(lostItemsQuery.data ?? []).filter((item) => item.status === 'open').length}건
          </strong>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <PackagePlus size={19} />
          <h2>분실물 등록</h2>
        </div>
        <form className="content-form" onSubmit={handleSubmit}>
          <label>
            <span>구분</span>
            <select
              value={form.type}
              onChange={(event) =>
                setForm((current) => ({ ...current, type: event.target.value as 'lost' | 'found' }))
              }
            >
              <option value="found">습득</option>
              <option value="lost">분실</option>
            </select>
          </label>
          <label>
            <span>물건 이름</span>
            <input
              value={form.itemName}
              onChange={(event) =>
                setForm((current) => ({ ...current, itemName: event.target.value }))
              }
              maxLength={160}
              required
            />
          </label>
          <label>
            <span>장소</span>
            <input
              value={form.location}
              onChange={(event) =>
                setForm((current) => ({ ...current, location: event.target.value }))
              }
              maxLength={160}
            />
          </label>
          <label>
            <span>일자</span>
            <input
              type="date"
              value={form.occurredAt}
              onChange={(event) =>
                setForm((current) => ({ ...current, occurredAt: event.target.value }))
              }
            />
          </label>
          <label>
            <span>첨부</span>
            <input type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </label>
          <label className="full-field">
            <span>상세 설명</span>
            <textarea
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
              rows={4}
            />
          </label>
          <button className="primary-button" type="submit" disabled={createMutation.isPending}>
            등록
          </button>
        </form>
        {createMutation.isError ? (
          <p className="form-error">분실물 등록에는 로그인이 필요합니다.</p>
        ) : null}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <PackageSearch size={19} />
          <h2>분실물 목록</h2>
        </div>
        {lostItemsQuery.isLoading ? (
          <p className="empty-text">분실물을 불러오는 중입니다.</p>
        ) : null}
        {lostItemsQuery.isError ? (
          <p className="empty-text">분실물 API 연결을 확인해주세요.</p>
        ) : null}
        <div className="list-stack">
          {(lostItemsQuery.data ?? []).map((item) => (
            <article className="list-row expanded" key={item.id}>
              <div>
                <span className="row-meta">
                  {item.type === 'found' ? '습득' : '분실'} · {item.location || '장소 미입력'}
                </span>
                <h3>{item.itemName}</h3>
                {item.description ? <p>{item.description}</p> : null}
                {item.attachments?.length ? (
                  <div className="attachment-list">
                    {item.attachments.map((fileItem) => (
                      <a href={fileItem.url} key={fileItem.id}>
                        {fileItem.originalName}
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="row-actions">
                <span className="badge subtle">
                  {item.status === 'open' ? '접수' : item.status}
                </span>
                <button
                  className="quiet-button"
                  type="button"
                  onClick={() =>
                    reportMutation.mutate({
                      targetType: 'lost_item',
                      targetId: item.id,
                      reason: '분실물 정보 확인 필요',
                    })
                  }
                >
                  신고
                </button>
              </div>
            </article>
          ))}
          {lostItemsQuery.data?.length === 0 ? (
            <p className="empty-text">등록된 분실물이 없습니다.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
