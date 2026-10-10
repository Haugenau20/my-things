import { useEffect, useState } from 'react';

export function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 850px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 850px)');
    const changed = () => setNarrow(query.matches);
    query.addEventListener('change', changed);
    return () => query.removeEventListener('change', changed);
  }, []);
  return narrow;
}
