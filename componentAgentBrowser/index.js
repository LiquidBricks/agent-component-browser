import { AGENT_SOCKET_ERROR } from '@liquid-bricks/lib-diagnostics/codes';
import { createAgentConfig, normalizeFileReferences } from './agentConfig.js';
import { MESSAGE_SOURCE } from './protocol.js';
const defaultWorkerUrl = new URL('./worker.js', import.meta.url);

export function createComponentAgent(options = {}) {
  return createBrowserComponentAgent(options);
}

export function createBrowserComponentAgent(options = {}) {
  const {
    Worker: WorkerConstructor = globalThis.Worker,
    workerUrl = defaultWorkerUrl,
    workerOptions,
    baseUrl = globalThis.location?.href ?? import.meta.url,
  } = options;

  if (typeof WorkerConstructor !== 'function') {
    throw new Error('Worker is required to start the browser component agent');
  }

  const config = createAgentConfig(options);
  const files = normalizeFileReferences(config.files, baseUrl);
  const worker = new WorkerConstructor(workerUrl, {
    type: 'module',
    name: 'component-agent-browser',
    ...(workerOptions ?? {}),
  });

  const detachDiagnostics = attachWorkerDiagnostics({
    worker,
    diagnostics: config.diagnostics,
  });

  worker.postMessage({
    source: MESSAGE_SOURCE,
    type: 'start',
    options: {
      ipAddress: config.ipAddress,
      port: config.port,
      protocols: config.protocols,
      files,
      backoff: config.backoff,
      concurrentQueueLimit: config.concurrentQueueLimit,
    },
  });

  return {
    worker,
    endpoint: config.endpoint,
    files,
    postMessage(message, transfer) {
      return worker.postMessage(message, transfer);
    },
    addEventListener(...args) {
      return worker.addEventListener(...args);
    },
    removeEventListener(...args) {
      return worker.removeEventListener(...args);
    },
    terminate() {
      try {
        worker.postMessage({ source: MESSAGE_SOURCE, type: 'stop' });
      } catch (_) {
        // Termination still proceeds below.
      }
      detachDiagnostics();
      return worker.terminate();
    },
    close() {
      return this.terminate();
    },
  };
}

function attachWorkerDiagnostics({ worker, diagnostics }) {
  const handler = (event) => {
    const data = event?.data;
    if (!data || data.source !== MESSAGE_SOURCE || data.type !== 'diagnostic') {
      return;
    }

    const { level, code, msg, meta } = data;
    if (level === 'debug') {
      diagnostics.debug(msg, meta);
      return;
    }
    if (level === 'info') {
      diagnostics.info(msg, meta);
      return;
    }

    diagnostics.warn(
      false,
      code ?? AGENT_SOCKET_ERROR,
      msg ?? 'Browser component agent diagnostic',
      meta,
    );
  };

  worker.addEventListener('message', handler);
  return () => worker.removeEventListener('message', handler);
}

export { MESSAGE_SOURCE };
