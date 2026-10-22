// Friendly error surface. Shows a safe message; never renders raw stack traces
// or secrets to the browser.

import { Icon } from './Icon.jsx';
import { Button } from './Button.jsx';

export function friendlyMessage(error) {
  if (!error) return 'Something went wrong.';
  const msg = typeof error === 'string' ? error : error.message || 'Something went wrong.';
  if (/sign in to continue|jwt|session/i.test(msg)) {
    return 'Your session has ended. Sign in again to continue.';
  }
  if (/not authorized|permission|rls|row-level|admin required|account required/i.test(msg)) {
    return "You don't have access to this information.";
  }
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(msg)) {
    return 'Could not reach the server. Check your connection and try again.';
  }
  return msg;
}

export function ErrorState({ error, onRetry, title = 'Unable to load', compact = false }) {
  return (
    <div className={`state state--error ${compact ? 'state--compact' : ''}`.trim()} role="alert">
      <div className="state__icon" aria-hidden="true"><Icon name="alert" size={22} /></div>
      <h3 className="state__title">{title}</h3>
      <p className="state__text">{friendlyMessage(error)}</p>
      {onRetry ? <Button icon="refresh" onClick={onRetry}>Try again</Button> : null}
    </div>
  );
}
