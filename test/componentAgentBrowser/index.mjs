import test from 'node:test';
import assert from 'node:assert/strict';

import { createComponentAgent } from '../../index.js';
import { MESSAGE_SOURCE } from '../../componentAgentBrowser/index.js';
import { createMemoryDiagnostics } from '../helpers.mjs';

class FakeWorker {
  static instances = [];

  constructor(url, options) {
    this.url = url;
    this.options = options;
    this.messages = [];
    this.listeners = new Map();
    this.terminated = false;
    FakeWorker.instances.push(this);
  }

  postMessage(message) {
    this.messages.push(message);
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) ?? [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  removeEventListener(type, handler) {
    const handlers = this.listeners.get(type) ?? [];
    this.listeners.set(type, handlers.filter((candidate) => candidate !== handler));
  }

  terminate() {
    this.terminated = true;
  }

  dispatchMessage(data) {
    for (const handler of this.listeners.get('message') ?? []) {
      handler({ data });
    }
  }
}

test('createComponentAgent starts a module worker with normalized files', () => {
  FakeWorker.instances.length = 0;
  const { diagnostics } = createMemoryDiagnostics();
  const agent = createComponentAgent({
    ipaddress: '127.0.0.1',
    port: 7001,
    files: ['./components/smoke.comp.js'],
    diagnostics,
    Worker: FakeWorker,
    workerUrl: 'worker-entry.js',
    baseUrl: 'https://example.test/app/page.js',
  });

  assert.equal(FakeWorker.instances.length, 1);
  const worker = FakeWorker.instances[0];
  assert.equal(worker.url, 'worker-entry.js');
  assert.deepEqual(worker.options, {
    type: 'module',
    name: 'component-agent-browser',
  });

  assert.equal(agent.endpoint, 'ws://127.0.0.1:7001/componentAgent');
  assert.deepEqual(agent.files, ['https://example.test/app/components/smoke.comp.js']);
  assert.equal(worker.messages.length, 1);
  assert.equal(worker.messages[0].source, MESSAGE_SOURCE);
  assert.equal(worker.messages[0].type, 'start');
  assert.deepEqual(worker.messages[0].options.files, agent.files);

  agent.terminate();
  assert.equal(worker.terminated, true);
})

test('createComponentAgent relays worker diagnostics without throwing', () => {
  FakeWorker.instances.length = 0;
  const { diagnostics, entries } = createMemoryDiagnostics();
  const agent = createComponentAgent({
    ipAddress: '127.0.0.1',
    port: 7001,
    files: ['https://example.test/component.comp.js'],
    diagnostics,
    Worker: FakeWorker,
  });

  const worker = FakeWorker.instances[0];
  worker.dispatchMessage({
    source: MESSAGE_SOURCE,
    type: 'diagnostic',
    level: 'warn',
    code: 'TEST_CODE',
    msg: 'worker warning',
    meta: { value: 1 },
  });
  worker.dispatchMessage({
    source: MESSAGE_SOURCE,
    type: 'diagnostic',
    level: 'info',
    msg: 'worker info',
    meta: { value: 2 },
  });

  assert.equal(entries.some((entry) => entry.level === 'warn' && entry.code === 'TEST_CODE'), true);
  assert.equal(entries.some((entry) => entry.level === 'info' && entry.msg === 'worker info'), true);

  agent.close();
})
