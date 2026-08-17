/** @vitest-environment jsdom */

import { useState } from 'react';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OtpInput } from './OtpInput';

function OtpHarness({ onComplete }: { onComplete: (value: string) => void }) {
  const [value, setValue] = useState('');
  return <OtpInput autoFocus={false} value={value} onChange={setValue} onComplete={onComplete} />;
}

describe('OtpInput', () => {
  it('renders mobile-friendly numeric fields and submits after the sixth digit', () => {
    const onComplete = vi.fn();
    const view = render(<OtpHarness onComplete={onComplete} />);
    const inputs = view.getAllByRole('textbox');

    expect(inputs).toHaveLength(6);
    expect(inputs[0]).toHaveAttribute('inputmode', 'numeric');
    expect(inputs[0]).toHaveAttribute('autocomplete', 'one-time-code');

    inputs.forEach((input, index) => {
      fireEvent.change(input, { target: { value: String(index + 1) } });
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith('123456');
  });
});
