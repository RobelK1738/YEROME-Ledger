// Small hook to run an async data loader with loading/error handling and a
// manual refresh. `loading` is only true before the first result; later
// refreshes keep the current data on screen and set `refreshing` instead.

import { useCallback, useEffect, useRef, useState } from 'react';

export function useAsync(loader, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const hasData = useRef(false);

  const run = useCallback(async () => {
    if (hasData.current) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const result = await loader();
      hasData.current = true;
      setData(result);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await loader();
        if (active) { hasData.current = true; setData(result); }
      } catch (err) {
        if (active) setError(err);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, refreshing, error, refresh: run, setData };
}
