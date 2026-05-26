import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic';

export function createRegisterComponentsSubject() {
  return createSubject()
    .env('prod')
    .ns('component-service')
    .context('component-agent')
    .channel('cmd')
    .entity('agent')
    .action('register-components')
    .version('v1')
    .build();
}

export function createComponentRegistrationSubject() {
  return createSubject()
    .env('prod')
    .ns('component-service')
    .context('component-agent')
    .entity('component')
    .channel('cmd')
    .action('register')
    .version('v1')
    .build();
}

export function createComputeResultDoneSubject() {
  return createSubject()
    .env('prod')
    .ns('component-service')
    .context('component-agent')
    .entity('component')
    .channel('evt')
    .action('computeResultDone')
    .version('v1')
    .build();
}
