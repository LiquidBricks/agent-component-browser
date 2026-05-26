export function createReconnectManager({
  diagnostics,
  backoff,
  connect,
  setTimeout: setTimer = globalThis.setTimeout,
  clearTimeout: clearTimer = globalThis.clearTimeout,
}) {
  let reconnectTimer;
  let reconnectAttempt = 0;
  let stopped = false;

  const computeReconnectDelay = () => {
    const delay = backoff.initialDelayMs * (backoff.factor ** reconnectAttempt);
    return Math.min(delay, backoff.maxDelayMs);
  };

  const reset = () => {
    reconnectAttempt = 0;
    if (reconnectTimer) {
      clearTimer(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const stop = () => {
    stopped = true;
    reset();
  };

  const schedule = () => {
    if (stopped || reconnectTimer) return;

    const delay = computeReconnectDelay();
    diagnostics.info('Scheduling component agent reconnect', {
      attempt: reconnectAttempt + 1,
      delayMs: delay,
    });

    reconnectTimer = setTimer(() => {
      reconnectTimer = null;
      reconnectAttempt += 1;
      connect();
    }, delay);
  };

  const resume = () => {
    stopped = false;
  };

  return { schedule, reset, stop, resume };
}
