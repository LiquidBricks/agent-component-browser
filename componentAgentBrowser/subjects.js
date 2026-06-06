import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic';

import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'


export function createRegisterComponentsSubject() {
  return createSubject(natsEvents['*'].component_service['*']['*'].cmd.agent.register_components.v1['*']).forPublish()
    .env('prod')
    .context('component-agent')
    .build();
}

export function createComponentRegistrationSubject() {
  return createSubject(natsEvents['*'].component_service['*']['*'].cmd.component.register.v1['*']).forPublish()
    .env('prod')
    .context('component-agent')
    .build();
}

export function createComputeResultDoneSubject() {
  return createSubject(natsEvents['*'].component_service['*']['*'].evt.component.computeResultDone.v1['*']).forPublish()
    .env('prod')
    .context('component-agent')
    .build();
}
