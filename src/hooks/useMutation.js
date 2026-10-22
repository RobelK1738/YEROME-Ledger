// Runs one Admin write at a time: blocks double submits, keeps form input on
// failure (the caller's state is untouched) and confirms success with a toast.

import { useCallback, useRef, useState } from 'react';
import { useToast } from '../components/ui/Feedback.jsx';
import { friendlyMessage } from '../components/ui/ErrorState.jsx';

export function useMutation() {
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inflight = useRef(false);

  const run = useCallback(async (work, { success, onSuccess, onError } = {}) => {
    if (inflight.current) return false;
    inflight.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await work();
      if (success) notify(success);
      await onSuccess?.(result);
      return true;
    } catch (caught) {
      setError(friendlyMessage(caught) || 'Could not save changes.');
      await onError?.(caught);
      return false;
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }, [notify]);

  return { run, busy, error, setError };
}
