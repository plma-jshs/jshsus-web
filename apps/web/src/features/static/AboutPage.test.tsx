// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../components/page/PageScaffold', () => ({
  PageScaffold: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

import { AboutPage } from './AboutPage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AboutPage', () => {
  it('shows the original JSHSus introduction by default', () => {
    render(<AboutPage />);

    expect(screen.getByRole('tab', { name: '과구리' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: /JSHSus 의 탄생/ })).toBeInTheDocument();
    expect(
      screen.getByText(/학교생활 중에는 분명히 많은 학생의 외침이 있었습니다/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Primary Color - R: 53, G: 148, B: 138/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Icon Design/ })).toBeInTheDocument();
  });

  it('switches to the original developer story and includes the 2025 developers', async () => {
    const user = userEvent.setup();
    render(<AboutPage />);

    await user.click(screen.getByRole('tab', { name: '개발자' }));

    expect(screen.getByRole('tab', { name: '개발자' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: 'Developer Story' })).toBeInTheDocument();
    expect(screen.getByText('HUZI')).toBeInTheDocument();
    expect(screen.getByText('김찬혁')).toBeInTheDocument();
    expect(screen.getByText('최익준')).toBeInTheDocument();
    expect(screen.getByText('강선우')).toBeInTheDocument();
    expect(screen.getByText('김성찬')).toBeInTheDocument();
    expect(screen.getByText('강재환')).toBeInTheDocument();
    expect(screen.getByText('나주붉은매 화이팅')).toBeInTheDocument();
    expect(screen.getAllByText('- 2025 과구리 개발')).toHaveLength(2);
  });
});
