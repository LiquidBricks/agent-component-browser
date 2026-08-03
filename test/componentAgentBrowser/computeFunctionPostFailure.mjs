import test from 'node:test';
import assert from 'node:assert/strict';

import { s } from '@liquid-bricks/lib-component-builder/component/builder/helper';
import { createExecutionRouter } from '../../componentAgentBrowser/router/index.js';
import { createMemoryDiagnostics } from '../helpers.mjs';

const computeSubject = 'prod.agent._._.cmd.component.compute_function.v1._';
const computeResultFailedSubject = 'prod.gateway._.function_result.evt.component.compute_function_failed.v1._';

function componentWithTask(name, fnc) {
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

function computeMessage({ instanceId, componentHash, name, ack }) {
  return {
    subject: computeSubject,
    data: {
      instanceId,
      deps: {},
      componentHash,
      name,
      type: 'task',
    },
    ack,
  };
}

test('a provided-result post failure publishes one error terminal result', async () => {
  const { diagnostics } = createMemoryDiagnostics();
  const componentHash = 'post-failure-component';
  const postError = new Error('provided result publish failed');
  const attempts = [];
  const delivered = [];
  const router = createExecutionRouter({
    diagnostics,
    publish: async (subject, data) => {
      attempts.push(data.status);
      if (data.status === 'provided') throw postError;
      delivered.push({ subject, data });
    },
  });
  router.context.componentStore.set(new Map([
    [componentHash, componentWithTask('work', () => 42)],
  ]));

  let acknowledgements = 0;
  const response = await router.request({
    subject: computeSubject,
    message: computeMessage({
      instanceId: 'instance-post-error',
      componentHash,
      name: 'work',
      ack: () => { acknowledgements += 1; },
    }),
  });

  assert.deepEqual(attempts, ['provided', 'error']);
  assert.equal(delivered.length, 1);
  assert.equal(delivered[0].subject, computeResultFailedSubject);
  assert.deepEqual(delivered[0].data, {
    instanceId: 'instance-post-error',
    name: 'work',
    type: 'task',
    status: 'error',
    error: {
      name: 'Error',
      message: postError.message,
    },
  });
  assert.equal(response.scope.error, postError);
  assert.equal(response.scope.status, 'errored');
  assert.equal(acknowledgements, 1);
});

test('terminal error publication failure rejects without acknowledging the command', async () => {
  const { diagnostics } = createMemoryDiagnostics();
  const componentHash = 'terminal-publish-failure-component';
  const executionError = new Error('task exploded');
  const publicationError = new Error('terminal result transport failed');
  let publishAttempts = 0;
  const router = createExecutionRouter({
    diagnostics,
    publish: async () => {
      publishAttempts += 1;
      throw publicationError;
    },
  });
  router.context.componentStore.set(new Map([
    [componentHash, componentWithTask('explode', () => { throw executionError; })],
  ]));

  let acknowledgements = 0;
  await assert.rejects(
    () => router.request({
      subject: computeSubject,
      message: computeMessage({
        instanceId: 'instance-terminal-publish-error',
        componentHash,
        name: 'explode',
        ack: () => { acknowledgements += 1; },
      }),
    }),
    (error) => error === publicationError,
  );

  assert.equal(publishAttempts, 1);
  assert.equal(acknowledgements, 0);
});
