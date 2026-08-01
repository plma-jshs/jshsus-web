// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataTableToolbar } from './DataTableControls';

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
    fireEvent.click(screen.getByRole('button', { name: '페이지당 표시 건수: 20건' }));
    expect(screen.getByRole('listbox', { name: '페이지당 표시 건수' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: '50건' }));
    expect(onPageSizeChange).toHaveBeenCalledWith(50);
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

    fireEvent.change(screen.getByPlaceholderText('검색어를 입력하세요'), {
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
    const input = screen.getByPlaceholderText('검색어를 입력하세요');
    input.focus();

    view.rerender(<DataTableToolbar {...props} query="검색 결과" />);

    expect(screen.getByPlaceholderText('검색어를 입력하세요')).toBe(input);
    expect(input).toHaveFocus();
    await waitFor(() => expect(input).toHaveValue('검색 결과'));
  });
});
