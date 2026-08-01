/** @vitest-environment jsdom */

import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminSelect } from '../src/components/ui/AdminSelect';

beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});

describe('AdminSelect', () => {
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
    document.body.querySelectorAll('.admin-select__menu').forEach((menu) => menu.remove());
    vi.restoreAllMocks();
  });

  it('updates a controlled value through the custom listbox and native change contract', () => {
    function Harness() {
      const [value, setValue] = useState('pending');
      return (
        <AdminSelect
          aria-label="상태"
          name="status"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        >
          <option value="pending">대기</option>
          <option value="completed">완료</option>
        </AdminSelect>
      );
    }

    act(() => root.render(<Harness />));
    const trigger = container.querySelector<HTMLButtonElement>('.admin-select__trigger')!;
    expect(trigger).toHaveTextContent('대기');

    act(() => trigger.click());
    const completedOption = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('.admin-select__menu [role="option"]'),
    ).find((button) => button.textContent?.includes('완료'))!;
    act(() => completedOption.click());

    expect(trigger).toHaveTextContent('완료');
    expect(container.querySelector<HTMLSelectElement>('select[name="status"]')).toHaveValue(
      'completed',
    );
  });

  it('uses option text as the implicit value like a native select', () => {
    act(() =>
      root.render(
        <AdminSelect aria-label="학년" defaultValue="2">
          <option>1</option>
          <option>2</option>
          <option>3</option>
        </AdminSelect>,
      ),
    );

    expect(container.querySelector('.admin-select__trigger')).toHaveTextContent('2');
  });

  it('renders the listbox inside an open dialog so it stays in the modal top layer', () => {
    act(() =>
      root.render(
        <dialog open>
          <AdminSelect aria-label="페이지당 표시 건수" defaultValue="20">
            <option value="20">20건</option>
            <option value="50">50건</option>
          </AdminSelect>
        </dialog>,
      ),
    );

    const dialog = container.querySelector('dialog')!;
    const trigger = dialog.querySelector<HTMLButtonElement>('.admin-select__trigger')!;
    act(() => trigger.click());

    expect(dialog.querySelector('.admin-select__menu')).not.toBeNull();
    expect(document.body.querySelector(':scope > .admin-select__menu')).toBeNull();
  });
});
