// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataTableToolbar } from './DataTableControls';

afterEach(cleanup);

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
});
