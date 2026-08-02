import { s } from '@liquid-bricks/lib-component-builder/component/builder/helper';
import { getAgentFns, getComponents } from '../../../componentOperations.js';
import { PRECONDITION_REQUIRED } from '@liquid-bricks/lib-diagnostics/codes';
import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

export async function registerComponentsAndPublish({
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
    PRECONDITION_REQUIRED,
    'No components found in files: ' + files.join(', '),
    { files },
  );

  componentStore.set(components);
  agentFnStore.set(agentFns);

  const registrationSubject = createSubject(emits['component_service.cmd.component.register.v1'])
    .forPublish()
    .env('prod')
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
