// App-wide feedback: transient toasts for completed actions and a promise-based
// confirmation dialog that replaces window.confirm.

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Modal } from './Overlay.jsx';
import { Button } from './Button.jsx';
import { Icon } from './Icon.jsx';

const ToastContext = createContext(null);
const ConfirmContext = createContext(null);

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((toast) => toast.id !== id)), []);
  const notify = useCallback((message, { tone = 'ok', duration = 6000 } = {}) => {
    const id = nextId.current++;
    setToasts((list) => [...list.slice(-2), { id, message, tone }]);
    if (duration) setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  const confirm = useCallback((options) => new Promise((resolve) => {
    setDialog({ ...options, resolve });
  }), []);

  const close = (result) => {
    dialog?.resolve(result);
    setDialog(null);
  };

  const toastValue = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);

  return (
    <ToastContext.Provider value={toastValue}>
      <ConfirmContext.Provider value={confirm}>
        {children}
        <div className="toast-region" aria-live="polite" aria-atomic="false">
          {toasts.map((toast) => (
            <div key={toast.id} className={`toast toast--${toast.tone}`} role={toast.tone === 'danger' ? 'alert' : 'status'}>
              <Icon name={toast.tone === 'danger' ? 'alert' : 'checkCircle'} size={18} />
              <span className="toast__text">{toast.message}</span>
              <button type="button" className="toast__close" onClick={() => dismiss(toast.id)} aria-label="Dismiss notification">
                <Icon name="x" size={16} />
              </button>
            </div>
          ))}
        </div>
        <Modal
          open={Boolean(dialog)}
          title={dialog?.title || 'Are you sure?'}
          onClose={() => close(false)}
          size="sm"
          footer={<>
            <Button variant="secondary" onClick={() => close(false)} data-autofocus>
              {dialog?.cancelLabel || 'Cancel'}
            </Button>
            <Button variant={dialog?.tone === 'danger' ? 'danger' : 'primary'} onClick={() => close(true)}>
              {dialog?.confirmLabel || 'Confirm'}
            </Button>
          </>}
        >
          {dialog?.message ? <div className="confirm__message">{dialog.message}</div> : null}
        </Modal>
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within FeedbackProvider.');
  return ctx;
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within FeedbackProvider.');
  return ctx;
}
