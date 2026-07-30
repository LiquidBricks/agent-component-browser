import { PRECONDITION_INVALID, PRECONDITION_REQUIRED } from '@liquid-bricks/lib-diagnostics/codes';
import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic';
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats';

export const DEFAULT_BACKOFF = {
  initialDelayMs: 1_000,
  maxDelayMs: 30_000,
  factor: 2,
};

export const DEFAULT_QUEUE_LIMIT = 20;

export function createAgentConfig({
  ipAddress,
  ipaddress,
  port,
  protocols,
  files,
  diagnostics: diagnosticsInput,
  backoff,
  concurrentQueueLimit,
} = {}) {
  const diagnostics = diagnosticsInput?.child
    ? diagnosticsInput.child({ agentName: 'componentAgentBrowser' })
    : diagnosticsInput;

  if (!diagnostics) {
    throw new Error('diagnostics is required to start the browser component agent');
  }

  const normalizedIpAddress = ipAddress ?? ipaddress;

  diagnostics.require(
    normalizedIpAddress,
    PRECONDITION_REQUIRED,
    'ipAddress is required to start the browser component agent',
    { field: 'ipAddress' },
  );
  diagnostics.require(
    port,
    PRECONDITION_REQUIRED,
    'port is required to start the browser component agent',
    { field: 'port' },
  );
  diagnostics.require(
    files,
    PRECONDITION_REQUIRED,
    'files is required',
    { field: 'files' },
  );
  diagnostics.require(
    Array.isArray(files),
    PRECONDITION_INVALID,
    'files must be an array',
    { field: 'files' },
  );

  const endpoint = `ws://${normalizedIpAddress}:${port}/componentAgent`;

  return {
    diagnostics,
    ipAddress: normalizedIpAddress,
    port,
    protocols,
    files,
    endpoint,
    registerComponentsSubject: createSubject(natsEvents['*'].component_service['*']['*'].cmd.agent.register_components.v1['*'])
      .forPublish()
      .env('prod')
      .context('component-agent')
      .build(),
    backoff: { ...DEFAULT_BACKOFF, ...(backoff ?? {}) },
    concurrentQueueLimit: concurrentQueueLimit ?? DEFAULT_QUEUE_LIMIT,
  };
}

export function normalizeFileReferences(files, baseHref = globalThis.location?.href ?? import.meta.url) {
  return files.map((file) => normalizeFileReference(file, baseHref));
}

function normalizeFileReference(file, baseHref) {
  if (file instanceof URL) {
    return file.href;
  }
  if (typeof file === 'string') {
    return new URL(file, baseHref).href;
  }
  if (typeof file?.href === 'string') {
    return file.href;
  }
  return file;
}
