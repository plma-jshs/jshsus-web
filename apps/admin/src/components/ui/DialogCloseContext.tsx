import { createContext, useContext, type ReactNode } from 'react';

const DialogCloseContext = createContext<(() => void) | null>(null);

export function DialogCloseProvider({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  return <DialogCloseContext.Provider value={onClose}>{children}</DialogCloseContext.Provider>;
}

/** Returns the animated close action for the surrounding Dialog/Drawer. */
export function useDialogClose() {
  return useContext(DialogCloseContext);
}
