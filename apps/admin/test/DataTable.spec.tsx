/** @vitest-environment jsdom */

import { renderToStaticMarkup } from 'react-dom/server';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataTable } from '../src/components/DataTable';
import {
  ADMIN_DEFAULT_PAGE_SIZE,
  ADMIN_PAGE_SIZES,
  normalizeAdminPageSize,
} from '../src/components/dataTableConfig';

type Row = {
  studentNo: string;
  name: string;
};

const columns: ColumnDef<Row>[] = [
  { accessorKey: 'studentNo', header: '학번', meta: { widthPreset: 'short' } },
  { accessorKey: 'name', header: '이름' },
];

const rows: Row[] = [
  { studentNo: '1203', name: '세 번째' },
  { studentNo: '1101', name: '첫 번째' },
  { studentNo: '1201', name: '두 번째' },
];

beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});

function renderTable(sorting: SortingState, manualSorting = false) {
  return renderToStaticMarkup(
    <DataTable
      columns={columns}
      data={rows}
      sorting={sorting}
      manualSorting={manualSorting}
      caption="정렬 테스트"
    />,
  );
}

describe('DataTable sorting', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('sorts uncontrolled client rows when a header is clicked', () => {
    act(() => root.render(<DataTable columns={columns} data={rows} caption="정렬 테스트" />));

    const studentNoHeader = [...container.querySelectorAll<HTMLButtonElement>('th button')].find(
      (button) => button.textContent?.includes('학번'),
    );
    expect(studentNoHeader).toBeDefined();

    act(() => studentNoHeader!.click());

    const renderedStudentNumbers = [...container.querySelectorAll('tbody tr')].map(
      (row) => row.querySelector('td')?.textContent,
    );
    expect(renderedStudentNumbers).toEqual(['1101', '1201', '1203']);
    expect(studentNoHeader!.closest('th')).toHaveAttribute('aria-sort', 'ascending');

    act(() => studentNoHeader!.click());

    const descendingStudentNumbers = [...container.querySelectorAll('tbody tr')].map(
      (row) => row.querySelector('td')?.textContent,
    );
    expect(descendingStudentNumbers).toEqual(['1203', '1201', '1101']);
    expect(studentNoHeader!.closest('th')).toHaveAttribute('aria-sort', 'descending');
  });

  it('applies controlled sorting to client-side rows', () => {
    const html = renderTable([{ id: 'studentNo', desc: false }]);

    expect(html.indexOf('1101')).toBeLessThan(html.indexOf('1201'));
    expect(html.indexOf('1201')).toBeLessThan(html.indexOf('1203'));
    expect(html).toContain('aria-sort="ascending"');
  });

  it('does not re-sort server-owned rows in manual mode', () => {
    const html = renderTable([{ id: 'studentNo', desc: false }], true);

    expect(html.indexOf('1203')).toBeLessThan(html.indexOf('1101'));
    expect(html.indexOf('1101')).toBeLessThan(html.indexOf('1201'));
  });
});

describe('admin page-size policy', () => {
  it('offers 20, 50, and 100 rows and normalizes legacy values to 20', () => {
    expect(ADMIN_PAGE_SIZES).toEqual([20, 50, 100]);
    expect(ADMIN_DEFAULT_PAGE_SIZE).toBe(20);
    expect(normalizeAdminPageSize(30)).toBe(20);
    expect(normalizeAdminPageSize(50)).toBe(50);
  });
});
