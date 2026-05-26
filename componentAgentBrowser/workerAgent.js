import { createAgentConfig } from './agentConfig.js';
import { createQueueProcessor } from './processQueue.js';
import { createReconnectManager } from './reconnectManager.js';
import { createSocketHandlers } from './socketHandlers.js';

export function createWorkerComponentAgent(options = {}, dependencies = {}) {
  const {
    WebSocket: WebSocketConstructor = globalThis.WebSocket,
    diagnostics,
    setTimeout,
    clearTimeout,
  } = dependencies;

  if (typeof WebSocketConstructor !== 'function') {
    throw new Error('WebSocket is required inside the browser component agent worker');
  }

  const {
    endpoint,
    protocols,
    files,
    registerComponentsSubject,
    backoff,
    concurrentQueueLimit,
  } = createAgentConfig({ ...options, diagnostics });

  let socket;
  let closed = false;
  const queueState = {
    enqueueMessage: async () => {},
    processQueue: async () => {},
    registerComponents: async () => {},
  };

  const reconnect = createReconnectManager({
    diagnostics,
    backoff,
    connect,
    setTimeout,
    clearTimeout,
  });

  function connect() {
    if (closed) {
      return;
    }
    reconnect.resume();
    socket = protocols === undefined
      ? new WebSocketConstructor(endpoint)
      : new WebSocketConstructor(endpoint, protocols);

    const qp = createQueueProcessor({
      diagnostics,
      concurrentQueueLimit,
      socket,
    });

    queueState.enqueueMessage = qp.enqueueMessage;
    queueState.processQueue = qp.processQueue;
    queueState.registerComponents = async (nextFiles) => {
      await queueState.enqueueMessage({
        subject: registerComponentsSubject,
        data: { files: nextFiles },
      });
    };

    const handlers = createSocketHandlers({
      diagnostics,
      endpoint,
      files,
      queueState,
      reconnect,
      shouldReconnect: () => !closed,
    });

    listen(socket, 'open', handlers.handleOpen);
    listen(socket, 'message', handlers.handleMessage);
    listen(socket, 'close', handlers.handleClose);
    listen(socket, 'error', handlers.handleError);
  }

  connect();

  return {
    get socket() {
      return socket;
    },
    endpoint,
    files,
    close() {
      closed = true;
      reconnect.stop();
      try {
        socket?.close?.();
      } catch (_) {
        // Ignore close failures during worker shutdown.
      }
    },
  };
}

function listen(target, eventName, handler) {
  if (typeof target.addEventListener === 'function') {
    target.addEventListener(eventName, handler);
    return;
  }
  if (typeof target.on === 'function') {
    target.on(eventName, handler);
  }
}
