export const SESSION_EXPIRED_EVENT = 'supe:session-expired';

let sessionExpiredDispatched = false;

export function emitSessionExpired() {
  if (sessionExpiredDispatched || typeof window === 'undefined') {
    return;
  }
  sessionExpiredDispatched = true;
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
}

export function resetSessionExpiredSignal() {
  sessionExpiredDispatched = false;
}
