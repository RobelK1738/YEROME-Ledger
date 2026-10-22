// Modal dialogs and side drawers. Focus moves into the dialog, Tab is trapped,
// Escape closes only the top-most layer, and focus returns to the trigger.

import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon.jsx';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const stack = [];

function visible(element) {
  return element.offsetParent !== null || element === document.activeElement;
}

function useDialogBehaviour(open, ref, onClose) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const token = {};
    stack.push(token);
    const previous = document.activeElement;
    const node = ref.current;
    const initial = node?.querySelector('[data-autofocus]') ||
      node?.querySelector('.overlay__body input:not([disabled]), .overlay__body select:not([disabled]), .overlay__body textarea:not([disabled])') ||
      node;
    initial?.focus({ preventScroll: true });
    const onKey = (event) => {
      if (stack[stack.length - 1] !== token || !node) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = [...node.querySelectorAll(FOCUSABLE)].filter(visible);
      if (!items.length) { event.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === node)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      stack.splice(stack.indexOf(token), 1);
      if (!stack.length) document.body.style.overflow = overflow;
      if (previous && typeof previous.focus === 'function' && document.contains(previous)) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [open, ref]);
}

function Layer({ open, onClose, title, description, children, footer, variant, size, dismissible = true }) {
  const ref = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  useDialogBehaviour(open, ref, dismissible ? onClose : undefined);
  if (!open) return null;
  return createPortal(
    <div
      className={`overlay overlay--${variant}`}
      onMouseDown={(event) => { if (dismissible && event.target === event.currentTarget) onClose?.(); }}
    >
      <div
        ref={ref}
        className={`overlay__panel overlay__panel--${variant} ${size ? `overlay__panel--${size}` : ''}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <header className="overlay__header">
          <div className="overlay__titles">
            <h2 className="overlay__title" id={titleId}>{title}</h2>
            {description ? <p className="overlay__description" id={descriptionId}>{description}</p> : null}
          </div>
          {dismissible ? (
            <button type="button" className="overlay__close" onClick={onClose} aria-label="Close">
              <Icon name="x" size={20} />
            </button>
          ) : null}
        </header>
        <div className="overlay__body">{children}</div>
        {footer ? <footer className="overlay__footer">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}

export function Modal(props) {
  return <Layer variant="modal" {...props} />;
}

/** Side panel on wide screens, full-height sheet on phones. */
export function Drawer(props) {
  return <Layer variant="drawer" {...props} />;
}
