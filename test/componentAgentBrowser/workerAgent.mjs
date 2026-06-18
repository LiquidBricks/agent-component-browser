import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic';
import { s } from '@liquid-bricks/lib-component-builder/component/builder/helper';
import { createWorkerComponentAgent } from '../../componentAgentBrowser/workerAgent.js';
import {
  createComponentRegistrationSubject,
  createComputeResultDoneSubject,
} from '../../componentAgentBrowser/subjects.js';
import { createMemoryDiagnostics, waitFor, writeModule } from '../helpers.mjs';

import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const builderImportPath = '@liquid-bricks/lib-component-builder/component/builder';

class FakeWebSocket {
  static instances = [];

  constructor(url, protocols) {
    this.url = url;
    this.protocols = protocols;
    this.sent = [];
    this.listeners = new Map();
    this.closed = false;
    FakeWebSocket.instances.push(this);
  }

  send(payload) {
    this.sent.push(JSON.parse(payload));
  }

  close() {
    this.closed = true;
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) ?? [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  async dispatch(type, event = {}) {
    for (const handler of this.listeners.get(type) ?? []) {
      await handler(event);
    }
  }
}

function createComputeSubject() {
  return createSubject(natsEvents['*'].component_service['*'].agent.exec.component.compute_result.v1['*']).forPublish()
    .env('prod')
    .build();
}

test('worker agent registers components on WebSocket open', async (t) => {
  FakeWebSocket.instances.length = 0;
  const { diagnostics } = createMemoryDiagnostics();
  const tmpRoot = await fs.mkdtemp(path.join(__dirname, 'tmp-worker-register-'));
  t.after(() => fs.rm(tmpRoot, { recursive: true, force: true }));

  const componentModule = await writeModule({
    dir: tmpRoot,
    fileName: 'register.comp.js',
    sourceLines: [
      `import { component } from '${builderImportPath}';`,
      "export default component('worker-register').data('value', { fnc: () => 7 });",
      '',
    ],
  });

  const expectedComponent = (await import(componentModule.href)).default;
  const expectedRegistration = await expectedComponent[s.INTERNALS].registration();
  createWorkerComponentAgent({
    ipAddress: '127.0.0.1',
    port: 8765,
    files: [componentModule.href],
  }, {
    diagnostics,
    WebSocket: FakeWebSocket,
  });

  const socket = FakeWebSocket.instances[0];
  assert.equal(socket.url, 'ws://127.0.0.1:8765/componentAgent');
  await socket.dispatch('open');

  const registration = await waitFor(() => socket.sent.find(
    (message) => message.subject === createComponentRegistrationSubject(),
  ));

  assert.ok(registration);
  assert.equal(registration.data.name, expectedRegistration.name);
  assert.equal(registration.data.hash, expectedRegistration.hash);
})

test('worker agent computes component results and publishes completion events', async (t) => {
  FakeWebSocket.instances.length = 0;
  const { diagnostics } = createMemoryDiagnostics();
  const tmpRoot = await fs.mkdtemp(path.join(__dirname, 'tmp-worker-compute-'));
  t.after(() => fs.rm(tmpRoot, { recursive: true, force: true }));

  const componentModule = await writeModule({
    dir: tmpRoot,
    fileName: 'compute.comp.js',
    sourceLines: [
      `import { component } from '${builderImportPath}';`,
      "export default component('worker-compute').task('add', { fnc: ({ deps }) => deps.inputs.a + deps.inputs.b });",
      '',
    ],
  });
  const expectedComponent = (await import(componentModule.href)).default;
  const componentHash = expectedComponent[s.INTERNALS].hash();

  createWorkerComponentAgent({
    ipAddress: '127.0.0.1',
    port: 8765,
    files: [componentModule.href],
  }, {
    diagnostics,
    WebSocket: FakeWebSocket,
  });

  const socket = FakeWebSocket.instances[0];
  await socket.dispatch('open');
  const registration = await waitFor(() => socket.sent.find(
    (message) => message.subject === createComponentRegistrationSubject(),
  ));
  assert.ok(registration);

  await socket.dispatch('message', {
    data: JSON.stringify({
      subject: createComputeSubject(),
      data: {
        instanceId: 'instance-1',
        deps: { inputs: { a: 2, b: 5 } },
        componentHash,
        name: 'add',
        type: 'task',
      },
    }),
  });

  const resultMessage = socket.sent.find(
    (message) => message.subject === createComputeResultDoneSubject(),
  );
  assert.ok(resultMessage);
  assert.deepEqual(resultMessage.data, {
    instanceId: 'instance-1',
    name: 'add',
    type: 'task',
    result: 7,
  });
})

test('worker agent exposes registered agentFns during compute execution', async (t) => {
  FakeWebSocket.instances.length = 0;
  const { diagnostics } = createMemoryDiagnostics();
  const tmpRoot = await fs.mkdtemp(path.join(__dirname, 'tmp-worker-agent-fn-'));
  t.after(() => fs.rm(tmpRoot, { recursive: true, force: true }));

  const componentModule = await writeModule({
    dir: tmpRoot,
    fileName: 'with-agent-fn.comp.js',
    sourceLines: [
      `import { component } from '${builderImportPath}';`,
      "export default component('worker-agent-fn')",
      "  .agentFn('double', { portAddr: 'math.double' })",
      "  .task('work', { deps: ({ agentFn: { double } }) => double, fnc: ({ agentFn }) => agentFn.double(21) });",
      '',
    ],
  });
  const agentFnModule = await writeModule({
    dir: tmpRoot,
    fileName: 'math.agentFn.js',
    sourceLines: [
      `import { agentFn } from '${builderImportPath}';`,
      "export default agentFn({ portAddr: 'math.double', fn: (value) => value * 2 });",
      '',
    ],
  });
  const expectedComponent = (await import(componentModule.href)).default;
  const componentHash = expectedComponent[s.INTERNALS].hash();

  createWorkerComponentAgent({
    ipAddress: '127.0.0.1',
    port: 8765,
    files: [componentModule.href, agentFnModule.href],
  }, {
    diagnostics,
    WebSocket: FakeWebSocket,
  });

  const socket = FakeWebSocket.instances[0];
  await socket.dispatch('open');
  const registration = await waitFor(() => socket.sent.find(
    (message) => message.subject === createComponentRegistrationSubject(),
  ));
  assert.ok(registration);

  await socket.dispatch('message', {
    data: JSON.stringify({
      subject: createComputeSubject(),
      data: {
        instanceId: 'instance-2',
        deps: {},
        componentHash,
        name: 'work',
        type: 'task',
      },
    }),
  });

  const resultMessage = socket.sent.find(
    (message) => message.subject === createComputeResultDoneSubject(),
  );
  assert.equal(resultMessage.data.result, 42);
})
