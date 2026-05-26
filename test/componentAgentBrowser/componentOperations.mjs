import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getAgentFnFiles, getAgentFns, getComponentFiles, getComponents } from '../../componentAgentBrowser/componentOperations.js';
import { s } from '@liquid-bricks/lib-component-builder/component/builder/helper';
import { createMemoryDiagnostics, writeModule } from '../helpers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const builderImportPath = '@liquid-bricks/lib-component-builder/component/builder';

test('file helpers select component and agentFn module URLs', () => {
  const files = [
    'https://example.test/a.comp.js',
    'https://example.test/b.agentFn.js',
    'https://example.test/ignored.js',
    'https://example.test/query.comp.js?cache=1',
  ];

  assert.deepEqual(getComponentFiles(files), [
    'https://example.test/a.comp.js',
    'https://example.test/query.comp.js?cache=1',
  ]);
  assert.deepEqual(getAgentFnFiles(files), [
    'https://example.test/b.agentFn.js',
  ]);
})

test('getComponents loads only provided component files and indexes by hash', async (t) => {
  const { diagnostics } = createMemoryDiagnostics();
  const tmpRoot = await fs.mkdtemp(path.join(__dirname, 'tmp-components-'));
  t.after(() => fs.rm(tmpRoot, { recursive: true, force: true }));

  const alpha = await writeModule({
    dir: tmpRoot,
    fileName: 'alpha.comp.js',
    sourceLines: [
      `import { component } from '${builderImportPath}';`,
      "export default component('browser-alpha').task('add', { fnc: ({ deps }) => deps.a + deps.b });",
      '',
    ],
  });
  await writeModule({
    dir: tmpRoot,
    fileName: 'ignored.js',
    sourceLines: [
      'throw new Error("ignored file should not be imported");',
    ],
  });

  const components = await getComponents([alpha.href], diagnostics);
  assert.equal(components.size, 1);
  const [component] = components.values();
  assert.equal(component[s.INTERNALS].name, 'browser-alpha');
  assert.equal(components.get(component[s.INTERNALS].hash()), component);
})

test('getAgentFns loads provided agentFn files and indexes by portAddr', async (t) => {
  const { diagnostics } = createMemoryDiagnostics();
  const tmpRoot = await fs.mkdtemp(path.join(__dirname, 'tmp-agent-fns-'));
  t.after(() => fs.rm(tmpRoot, { recursive: true, force: true }));

  const agentFnModule = await writeModule({
    dir: tmpRoot,
    fileName: 'math.agentFn.js',
    sourceLines: [
      `import { agentFn } from '${builderImportPath}';`,
      "export default agentFn({ portAddr: 'math.double', fn: (value) => value * 2 });",
      '',
    ],
  });

  const agentFns = await getAgentFns([agentFnModule.href], diagnostics);
  assert.equal(agentFns.size, 1);
  assert.equal(agentFns.get('math.double').fn(21), 42);
  assert.equal(typeof agentFns.get('math.double').hash, 'string');
})
