import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('jshsus-theme') === 'dark';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    window.localStorage.setItem('jshsus-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  return (
    <button
      className="header-theme-toggle"
      type="button"
      aria-label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
      aria-pressed={isDark}
      title={isDark ? '라이트 모드' : '다크 모드'}
      onClick={() => setIsDark((current) => !current)}
    >
      {isDark ? <Sun aria-hidden="true" size={18} /> : <Moon aria-hidden="true" size={18} />}
    </button>
  );
}
