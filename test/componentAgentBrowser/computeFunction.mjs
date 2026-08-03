import test from 'node:test';
import assert from 'node:assert/strict';

import { s } from '@liquid-bricks/lib-component-builder/component/builder/helper';
import { createExecutionRouter } from '../../componentAgentBrowser/router/index.js';
import { createMemoryDiagnostics } from '../helpers.mjs';

const computeSubject = 'prod.agent._._.cmd.component.compute_function.v1._';
const computeResultFailedSubject = 'prod.gateway._.function_result.evt.component.compute_function_failed.v1._';

function createComponentWithTask(name, fnc) {
  return {
    [s.INTERNALS]: {
      nodes: {
        data: new Map(),
        tasks: new Map([[name, { fnc }]]),
        gates: new Map(),
        agentFns: new Map(),
      },
    },
  };
}

function executionMessage(data, onAck = () => {}) {
  return { subject: computeSubject, data, ack: onAck };
}

test('handler failures publish a structured terminal result and preserve the original error', async () => {
  const { diagnostics } = createMemoryDiagnostics();
  const executionError = Object.assign(new Error('task exploded'), { code: 'TASK_EXPLODED' });
  const componentHash = 'component-hash';
  const published = [];
  const router = createExecutionRouter({
    diagnostics,
    publish: async (subject, data) => published.push({ subject, data }),
  });
  router.context.componentStore.set(new Map([
    [componentHash, createComponentWithTask('explode', () => { throw executionError; })],
  ]));

  let acknowledgements = 0;
  const response = await router.request({
    subject: computeSubject,
    message: executionMessage({
      instanceId: 'instance-1',
      deps: {},
      componentHash,
      name: 'explode',
      type: 'task',
    }, () => { acknowledgements += 1; }),
  });

  assert.deepEqual(published, [{
    subject: computeResultFailedSubject,
    data: {
      instanceId: 'instance-1',
      name: 'explode',
      type: 'task',
      status: 'error',
      error: {
        name: 'Error',
        message: 'task exploded',
        code: 'TASK_EXPLODED',
      },
    },
  }]);
  assert.equal(response.scope.status, 'errored');
  assert.equal(response.scope.error, executionError);
  assert.equal(acknowledgements, 1);
});

test('valid precondition failures publish an error result while invalid identities do not', async () => {
  const { diagnostics } = createMemoryDiagnostics();
  const published = [];
  const router = createExecutionRouter({
    diagnostics,
    publish: async (subject, data) => published.push({ subject, data }),
  });
  router.context.componentStore.set(new Map());

  const response = await router.request({
    subject: computeSubject,
    message: executionMessage({
      instanceId: 'instance-2',
      deps: {},
      componentHash: 'missing-component',
      name: 'work',
      type: 'task',
    }),
  });

  assert.equal(response.scope.status, 'errored');
  assert.equal(response.scope.error instanceof diagnostics.DiagnosticError, true);
  assert.deepEqual(published, [{
    subject: computeResultFailedSubject,
    data: {
      instanceId: 'instance-2',
      name: 'work',
      type: 'task',
      status: 'error',
      error: {
        name: 'DiagnosticError',
        message: 'component not found for execution',
        code: 'PRECONDITION_INVALID',
      },
    },
  }]);

  await router.request({
    subject: computeSubject,
    message: executionMessage({
      deps: {},
      componentHash: 'missing-component',
      name: 'work',
      type: 'task',
    }),
  });

  assert.equal(published.length, 1);
});
