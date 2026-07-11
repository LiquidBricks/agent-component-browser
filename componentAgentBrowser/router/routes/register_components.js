import { s } from '@liquid-bricks/lib-component-builder/component/builder/helper';
import { getAgentFns, getComponents } from '../../componentOperations.js';
import { Codes } from '../../codes.js';
import { decodeData } from '../middleware.js';
import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'

export const path = createSubject(natsEvents['*'].component_service['*']['*'].cmd.agent.register_components.v1['*'])
  .forSubscribe()
  .context('component-agent')
  .toObject()

export const emits = {
  'component_service.cmd.component.register.v1':
    natsEvents['*'].component_service['*']['*'].cmd.component.register.v1['*'],
}

export const spec = {
  context: { emits },
  decode: [
    decodeData(['files']),
  ],
  pre: [
    ensureFilesProvided,
  ],
  handler: registerComponentsAndPublish,
};

function ensureFilesProvided({ scope: { files }, rootCtx: { diagnostics } }) {
  diagnostics.require(
    Array.isArray(files),
    Codes.PRECONDITION_INVALID,
    'files must be an array',
    { field: 'files' },
  );
  diagnostics.require(
    files.length > 0,
    Codes.PRECONDITION_REQUIRED,
    'files is required',
    { field: 'files' },
  );
}

async function registerComponentsAndPublish({
  scope: { files },
  rootCtx: { diagnostics, componentStore, agentFnStore, publish },
  routeCtx: { emits },
  message,
}) {
  const [components, agentFns] = await Promise.all([
    getComponents(files, diagnostics),
    getAgentFns(files, diagnostics),
  ]);
  diagnostics.require(
    components.size > 0,
    Codes.PRECONDITION_REQUIRED,
    'No components found in files: ' + files.join(', '),
    { files },
  );

  componentStore.set(components);
  agentFnStore.set(agentFns);

  const registrationSubject = createSubject(emits['component_service.cmd.component.register.v1'])
    .forPublish()
    .env('prod')
    .context('component-agent')
    .build();
  for (const [, comp] of components) {
    const registration = await comp[s.INTERNALS].registration();
    await publish(registrationSubject, registration);
  }

  try {
    message?.ack?.();
  } catch (_) {
    // Ignore optional ack failures.
  }

  return { status: 'registered', components: components.size, agentFns: agentFns.size };
}
