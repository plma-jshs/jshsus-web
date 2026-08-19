// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataTablePagination, DataTableToolbar } from './DataTableControls';

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('DataTableToolbar', () => {
  it('uses styled listboxes for filters instead of native selects', () => {
    const onPageSizeChange = vi.fn();
    render(
      <DataTableToolbar
        total={72}
        page={1}
        totalPages={4}
        pageSize={20}
        field="title_content"
        query=""
        onPageSizeChange={onPageSizeChange}
        onSearch={vi.fn()}
      />,
    );

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '페이지당 표시 건수: 20건' }),
    ).not.toBeInTheDocument();
    expect(onPageSizeChange).not.toHaveBeenCalled();
  });

  it('applies search changes after a 250ms debounce and exposes a stable clear button', () => {
    vi.useFakeTimers();
    const onSearch = vi.fn();
    render(
      <DataTableToolbar
        total={10}
        page={1}
        totalPages={1}
        pageSize={20}
        field="title_content"
        query=""
        onPageSizeChange={vi.fn()}
        onSearch={onSearch}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('검색어 검색'), {
      target: { value: '실시간 검색' },
    });
    expect(onSearch).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(249));
    expect(onSearch).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onSearch).toHaveBeenLastCalledWith('title_content', '실시간 검색');

    fireEvent.click(screen.getByRole('button', { name: '검색어 지우기' }));
    act(() => vi.advanceTimersByTime(250));
    expect(onSearch).toHaveBeenLastCalledWith('title_content', '');
  });

  it('keeps the search input mounted and focused when URL-backed search props update', async () => {
    const props = {
      total: 10,
      page: 1,
      totalPages: 1,
      pageSize: 20 as const,
      field: 'title_content' as const,
      onPageSizeChange: vi.fn(),
      onSearch: vi.fn(),
    };
    const view = render(<DataTableToolbar {...props} query="" />);
    const input = screen.getByPlaceholderText('검색어 검색');
    input.focus();

    view.rerender(<DataTableToolbar {...props} query="검색 결과" />);

    expect(screen.getByPlaceholderText('검색어 검색')).toBe(input);
    expect(input).toHaveFocus();
    await waitFor(() => expect(input).toHaveValue('검색 결과'));
  });

  it('groups a requested action directly with the page-size control', () => {
    const view = render(
      <DataTableToolbar
        total={1}
        page={1}
        totalPages={1}
        pageSize={20}
        field="title_content"
        query=""
        action={<button type="button">작성</button>}
        groupActionWithPageSize
        onPageSizeChange={vi.fn()}
        onSearch={vi.fn()}
      />,
    );

    const primaryActions = view.container.querySelector('.data-table-toolbar__primary-actions');
    expect(primaryActions).toContainElement(screen.getByRole('button', { name: '작성' }));
  });

  it('does not reserve a hidden mobile filter column for action-only toolbars', () => {
    const view = render(
      <DataTableToolbar
        total={1}
        page={1}
        totalPages={1}
        pageSize={20}
        field="title_content"
        query=""
        action={<button type="button">작성</button>}
        onPageSizeChange={vi.fn()}
        onSearch={vi.fn()}
      />,
    );

    expect(view.container.querySelector('.data-table-toolbar')).toHaveClass(
      'data-table-toolbar--search-only',
    );
  });
});

describe('DataTablePagination', () => {
  it('renders compact page controls instead of the old load-more action', () => {
    const view = render(
      <DataTablePagination
        page={1}
        totalPages={2}
        hasMore
        loadingMore
        onChange={vi.fn()}
        onLoadMore={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '다음 페이지' })).toBeInTheDocument();
    expect(view.container.querySelector('.data-table-pagination__spinner')).not.toBeInTheDocument();
  });

  it('does not navigate when the page input is blurred without changing its value', () => {
    const onChange = vi.fn();
    render(
      <DataTablePagination
        page={1}
        totalPages={3}
        total={50}
        onChange={onChange}
        syncUrl={false}
      />,
    );

    fireEvent.blur(screen.getByRole('textbox', { name: '페이지 번호' }));

    expect(onChange).not.toHaveBeenCalled();
  });
});
