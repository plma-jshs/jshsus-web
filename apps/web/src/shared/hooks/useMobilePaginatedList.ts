import { useState } from 'react';

export type MobilePaginatedResult<T> = {
  items: T[];
  page: number;
  totalPages: number;
};

/**
 * Keeps server-paginated lists cumulative on small screens while preserving
 * normal URL-driven pagination on desktop. The first page comes from the
 * current query; subsequent pages are fetched only when the user asks for
 * more.
 */
export function useMobilePaginatedList<T>({
  key,
  page,
  result,
  isPlaceholderData = false,
  fetchPage,
}: {
  key: string;
  page: number;
  result?: MobilePaginatedResult<T>;
  isPlaceholderData?: boolean;
  fetchPage: (page: number) => Promise<MobilePaginatedResult<T>>;
}) {
  const [state, setState] = useState<{
    key: string;
    items: T[];
    nextPage: number;
  }>({ key: '', items: [], nextPage: 1 });
  const [loadingMore, setLoadingMore] = useState(false);
  const isCurrentList = state.key === key;
  const nextPage = isCurrentList ? state.nextPage : (result?.page ?? page) + 1;
  const items = isCurrentList ? state.items : (result?.items ?? []);
  const hasMore = Boolean(
    result && !isPlaceholderData && page === 1 && nextPage <= result.totalPages,
  );

  const loadMore = async () => {
    if (!result || !hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const nextResult = await fetchPage(nextPage);
      setState((current) => ({
        key,
        items: [...(current.key === key ? current.items : result.items), ...nextResult.items],
        nextPage: nextResult.page + 1,
      }));
    } catch {
      // Keep the current page visible and allow the user to retry.
    } finally {
      setLoadingMore(false);
    }
  };

  return { items, hasMore, loadingMore, loadMore };
}
