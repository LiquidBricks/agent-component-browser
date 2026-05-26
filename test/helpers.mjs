import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { diagnostics } from '@liquid-bricks/lib-diagnostics';

export const defaultMetrics = { count() {}, timing() {} };

export function createMemoryDiagnostics() {
  const entries = [];
  const logger = {};
  for (const level of ['info', 'warn', 'error', 'debug']) {
    logger[level] = (entry) => entries.push({ level, ...entry });
  }
  return {
    entries,
    diagnostics: diagnostics({ logger, metrics: defaultMetrics }),
  };
}

export async function writeModule({ dir, fileName, sourceLines }) {
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, fileName);
  await fs.writeFile(filePath, sourceLines.join('\n'), 'utf8');
  return {
    filePath,
    href: pathToFileURL(filePath).href,
  };
}

export async function waitFor(predicate, { timeoutMs = 2000, intervalMs = 10 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = predicate();
    if (result) {
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
}
