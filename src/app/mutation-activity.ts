import { createContext, useCallback, useContext, useState } from 'react';

export const MutationActivity = createContext<(id: symbol, busy: boolean) => void>(() => {});
// Keep a save registered until its async finally block runs, even if its editor closes.
export function useMutationState() {
  const report = useContext(MutationActivity);
  const [identity] = useState(() => Symbol());
  const [busy, update] = useState(false);
  const setBusy = useCallback(
    (value: boolean) => {
      report(identity, value);
      update(value);
    },
    [identity, report],
  );
  return [busy, setBusy] as const;
}
