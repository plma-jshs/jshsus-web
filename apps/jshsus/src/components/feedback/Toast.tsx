import { ToastProvider as SharedToastProvider, useToast } from '@jshsus/ui';
import type { ReactNode } from 'react';
export type { ToastInput, ToastTone } from '@jshsus/ui';

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <SharedToastProvider classPrefix="web-toast" iconSize={19} maxVisible={4}>
      {children}
    </SharedToastProvider>
  );
}

export { useToast };
