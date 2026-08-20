import { describe, expect, it } from 'vitest';
import { maskEmail, maskPhone } from './MyStatusPage';

describe('my status contact masking', () => {
  it('keeps exactly six mask characters in each email section', () => {
    expect(maskEmail('kimseongchan@gmail.com')).toBe('ki******@g******.com');
  });

  it('masks a Korean mobile number while preserving its shape', () => {
    expect(maskPhone('010-7123-4561')).toBe('010-7***-4***');
  });

  it('shows an empty state for missing contact information', () => {
    expect(maskEmail()).toBe('미등록');
    expect(maskPhone()).toBe('미등록');
  });
});
