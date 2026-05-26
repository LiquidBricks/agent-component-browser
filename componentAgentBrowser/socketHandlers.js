import { Codes } from './codes.js';

export function createSocketHandlers({
  diagnostics,
  endpoint,
  files,
  queueState,
  reconnect,
  shouldReconnect = () => true,
}) {
  const handleOpen = () => {
    diagnostics.info('Browser component agent connected', { endpoint });
    reconnect.reset();

    void (async () => {
      await queueState.registerComponents(files);
      await queueState.processQueue();
    })().catch((error) => {
      diagnostics.warn(
        false,
        Codes.AGENT_REGISTRATION_FAILED,
        'Browser component agent registration error',
        { error },
      );
    });
  };

  const handleMessage = async (event) => {
    const raw = event?.data ?? event;
    const normalizedRaw = typeof raw === 'string' ? raw : raw?.toString?.() ?? '';
    let parsed;

    try {
      parsed = JSON.parse(normalizedRaw);
    } catch (error) {
      diagnostics.warn(
        false,
        Codes.PRECONDITION_INVALID,
        'componentDispatcher received invalid JSON',
        {
          raw: normalizedRaw,
          error: error?.message ?? String(error),
        },
      );
      return;
    }

    await queueState.enqueueMessage(parsed);
  };

  const handleClose = (event) => {
    diagnostics.info('Browser component agent closed', {
      code: event?.code,
      reason: event?.reason,
    });
    if (shouldReconnect()) {
      reconnect.schedule();
    }
  };

  const handleError = (event) => {
    diagnostics.warn(
      false,
      Codes.AGENT_SOCKET_ERROR,
      'Browser component agent error',
      { error: event?.error ?? event?.message ?? event?.type ?? event },
    );
    if (shouldReconnect()) {
      reconnect.schedule();
    }
  };

  return {
    handleOpen,
    handleMessage,
    handleClose,
    handleError,
  };
}
