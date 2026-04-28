import { useCallback, useState } from 'react';

import { getWebviewState, setWebviewState } from './useVSCodeMessaging';

export function usePersistentState<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const all = getWebviewState();
    return key in all ? (all[key] as T) : initial;
  });

  const set = useCallback(
    (next: T) => {
      setValue(next);
      setWebviewState({ ...getWebviewState(), [key]: next });
    },
    [key],
  );

  return [value, set];
}
