import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ImageOff, MapPin, PackagePlus } from 'lucide-react';
import {
  FilterChips,
  PageScaffold,
  PageState,
  PageToolbar,
  SearchField,
} from '../../components/page/PageScaffold';
import { listBreadcrumbs } from '../../components/page/pageHierarchy';
import { createKoreanDateFormatter } from '../../shared/lib/date';
import { getLostItems } from './api';
import { lostStatusLabels } from './presentation';
import '../../styles/lost-items.css';

type LostFilter = 'all' | 'lost' | 'found';

const dateFormatter = createKoreanDateFormatter({
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function LostItemsPage() {
  const itemsQuery = useQuery({ queryKey: ['lost-items'], queryFn: getLostItems });
  const [filter, setFilter] = useState<LostFilter>('all');
  const [query, setQuery] = useState('');
  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);
  const filtered = useMemo(
    () =>
      items.filter(
        (item) =>
          (filter === 'all' || item.type === filter) &&
          (!query.trim() ||
            `${item.itemName} ${item.location} ${item.description ?? ''}`
              .toLocaleLowerCase('ko-KR')
              .includes(query.trim().toLocaleLowerCase('ko-KR'))),
      ),
    [filter, items, query],
  );

  return (
    <PageScaffold
      breadcrumbs={listBreadcrumbs('lostItems')}
      title="분실물"
      action={
        <Link className="detail-primary-button" to="/lost-items/new">
          <PackagePlus size={16} aria-hidden="true" /> 등록하기
        </Link>
      }
      width="wide"
      variant="workspace"
    >
      <section className="lost-items-view" aria-label="분실물 목록">
        <PageToolbar>
          <FilterChips
            value={filter}
            onChange={setFilter}
            label="분실물 종류"
            options={[
              { value: 'all', label: '전체' },
              { value: 'lost', label: '분실' },
              { value: 'found', label: '습득' },
            ]}
          />
          <SearchField
            value={query}
            onChange={setQuery}
            label="분실물 검색"
            placeholder="물건 이름 또는 장소 검색"
          />
        </PageToolbar>

        {itemsQuery.isLoading ? (
          <PageState kind="loading" title="분실물 정보를 불러오는 중입니다." variant="section" />
        ) : null}
        {itemsQuery.isError ? (
          <PageState
            kind="error"
            title="분실물 정보를 불러오지 못했습니다."
            variant="section"
            action={
              <button
                className="detail-secondary-button"
                type="button"
                onClick={() => itemsQuery.refetch()}
              >
                다시 시도
              </button>
            }
          />
        ) : null}
        {itemsQuery.isSuccess && !filtered.length ? (
          <PageState
            kind="empty"
            title={items.length ? '검색 결과가 없습니다.' : '등록된 분실물이 없습니다.'}
            description={items.length ? '검색어나 필터를 변경해 보세요.' : undefined}
            variant="section"
          />
        ) : null}

        {filtered.length ? (
          <div className="lost-grid">
            {filtered.map((item) => {
              const image = item.attachments?.find((file) => file.mimeType.startsWith('image/'));
              return (
                <Link
                  className="lost-card"
                  to="/lost-items/$itemId"
                  params={{ itemId: String(item.id) }}
                  aria-label={`${item.type === 'lost' ? '분실' : '습득'} 물건 ${item.itemName} 상세 보기`}
                  key={item.id}
                >
                  <div className="lost-card__visual">
                    {image ? (
                      <img src={image.inlineUrl} alt={`${item.itemName} 사진`} loading="lazy" />
                    ) : (
                      <span className="lost-card__placeholder">
                        <ImageOff size={24} aria-hidden="true" />
                        사진 없음
                      </span>
                    )}
                  </div>
                  <div className="lost-card__body">
                    <div className="lost-card__labels">
                      <span className={`lost-type is-${item.type}`}>
                        {item.type === 'lost' ? '분실' : '습득'}
                      </span>
                      <span className={`lost-status is-${item.status}`}>
                        {lostStatusLabels[item.status]}
                      </span>
                    </div>
                    <h2>{item.itemName}</h2>
                    <p>
                      <MapPin size={14} aria-hidden="true" />
                      <span>{item.location || '장소 미입력'}</span>
                    </p>
                    {item.occurredAt ? (
                      <time dateTime={item.occurredAt}>
                        {dateFormatter.format(new Date(item.occurredAt))}
                      </time>
                    ) : null}
                  </div>
                </Link>
              );
            })}
          </div>
        ) : null}
      </section>
    </PageScaffold>
  );
}
