import { createWorkerDiagnostics } from './diagnosticsProxy.js';
import { createWorkerComponentAgent } from './workerAgent.js';
import { MESSAGE_SOURCE } from './protocol.js';

let activeAgent;

function handleWorkerMessage(event) {
  const message = event?.data;
  if (!message || message.source !== MESSAGE_SOURCE) {
    return;
  }

  if (message.type === 'stop') {
    activeAgent?.close?.();
    activeAgent = undefined;
    return;
  }

  if (message.type !== 'start') {
    return;
  }

  activeAgent?.close?.();
  const diagnostics = createWorkerDiagnostics({
    source: MESSAGE_SOURCE,
    postMessage: (payload) => globalThis.postMessage(payload),
  });
  activeAgent = createWorkerComponentAgent(message.options, {
    diagnostics,
    WebSocket: globalThis.WebSocket,
  });
}

if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('message', handleWorkerMessage);
}

export { createWorkerComponentAgent, handleWorkerMessage };
