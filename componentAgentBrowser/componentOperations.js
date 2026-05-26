import { s } from '@liquid-bricks/lib-component-builder/component/builder/helper';
import { Codes } from './codes.js';

export function getComponentFiles(files) {
  return filterFilesBySuffix(files, '.comp.js');
}

export function getAgentFnFiles(files) {
  return filterFilesBySuffix(files, '.agentFn.js');
}

export async function getComponents(files, diagnostics) {
  const componentFiles = getComponentFiles(files);
  const byName = new Map();
  const byHash = new Map();
  const byHashSource = new Map();

  for (const file of componentFiles) {
    const href = getImportHref(file);
    const mod = await import(href);
    diagnostics.require(
      'default' in mod,
      Codes.PRECONDITION_REQUIRED,
      `Flow file ${href} must have a default export (component or array of components)`,
      { file: href },
    );

    const def = mod.default;
    const list = Array.isArray(def) ? def : [def];
    diagnostics.require(
      list.every((comp) => comp?.[s.IDENTITY.COMPONENT]),
      Codes.PRECONDITION_INVALID,
      `Flow file ${href} default export contains a non-component item`,
      { file: href },
    );

    for (let exportIndex = 0; exportIndex < list.length; exportIndex++) {
      const comp = list[exportIndex];
      const name = comp[s.INTERNALS].name;
      const h = comp[s.INTERNALS].hash();
      const source = { file: href, exportIndex, hash: h };
      const existingNameSource = byName.get(name);
      diagnostics.require(
        !existingNameSource,
        Codes.PRECONDITION_INVALID,
        `Duplicate component name detected: "${name}"`,
        {
          name,
          firstFile: existingNameSource?.file,
          duplicateFile: href,
          firstHash: existingNameSource?.hash,
          duplicateHash: h,
          firstExportIndex: existingNameSource?.exportIndex,
          duplicateExportIndex: exportIndex,
        },
      );
      byName.set(name, source);

      const existingHashSource = byHashSource.get(h);
      diagnostics.require(
        !existingHashSource,
        Codes.PRECONDITION_INVALID,
        `Duplicate component hash detected: "${h}"`,
        {
          hash: h,
          firstFile: existingHashSource?.file,
          duplicateFile: href,
          firstComponentName: existingHashSource?.name,
          duplicateComponentName: name,
          firstExportIndex: existingHashSource?.exportIndex,
          duplicateExportIndex: exportIndex,
        },
      );
      byHash.set(h, comp);
      byHashSource.set(h, { ...source, name });
    }
  }

  return byHash;
}

export async function getAgentFns(files, diagnostics) {
  const agentFnFiles = getAgentFnFiles(files);
  const byPortAddr = new Map();
  const byPortAddrSource = new Map();

  for (const file of agentFnFiles) {
    const href = getImportHref(file);
    const mod = await import(href);
    const exports = collectAgentFnExports(mod);
    diagnostics.require(
      exports.length > 0,
      Codes.PRECONDITION_REQUIRED,
      `Agent function file ${href} must export an agentFn or array of agentFns`,
      { file: href },
    );

    for (const { value, exportName, exportIndex } of exports) {
      const normalized = normalizeAgentFn(value);
      diagnostics.require(
        normalized,
        Codes.PRECONDITION_INVALID,
        `Agent function file ${href} export contains a non-agentFn item`,
        { file: href, exportName, exportIndex },
      );

      const { portAddr, hash, fn } = normalized;
      const source = { file: href, exportName, exportIndex, portAddr, hash };
      const existingSource = byPortAddrSource.get(portAddr);
      diagnostics.require(
        !existingSource,
        Codes.PRECONDITION_INVALID,
        `Duplicate agentFn portAddr detected: "${portAddr}"`,
        {
          portAddr,
          firstFile: existingSource?.file,
          duplicateFile: href,
          firstHash: existingSource?.hash,
          duplicateHash: hash,
          firstExportName: existingSource?.exportName,
          duplicateExportName: exportName,
          firstExportIndex: existingSource?.exportIndex,
          duplicateExportIndex: exportIndex,
        },
      );

      byPortAddr.set(portAddr, { portAddr, hash, fn });
      byPortAddrSource.set(portAddr, source);
    }
  }

  return byPortAddr;
}

function filterFilesBySuffix(files, suffix) {
  if (!Array.isArray(files)) {
    return [];
  }
  return files.filter((file) => fileHasSuffix(file, suffix));
}

function fileHasSuffix(file, suffix) {
  const href = getImportHref(file);
  try {
    return new URL(href, globalThis.location?.href ?? import.meta.url).pathname.endsWith(suffix);
  } catch (_) {
    return String(href).split('?')[0].split('#')[0].endsWith(suffix);
  }
}

function getImportHref(file) {
  if (file instanceof URL) {
    return file.href;
  }
  if (typeof file === 'string') {
    return file;
  }
  if (typeof file?.href === 'string') {
    return file.href;
  }
  return String(file);
}

function collectAgentFnExports(mod) {
  const exports = [];

  if ('default' in mod) {
    const list = Array.isArray(mod.default) ? mod.default : [mod.default];
    for (let exportIndex = 0; exportIndex < list.length; exportIndex++) {
      exports.push({ value: list[exportIndex], exportName: 'default', exportIndex });
    }
    return exports;
  }

  for (const [exportName, value] of Object.entries(mod)) {
    if (Array.isArray(value)) {
      for (let exportIndex = 0; exportIndex < value.length; exportIndex++) {
        exports.push({ value: value[exportIndex], exportName, exportIndex });
      }
    } else {
      exports.push({ value, exportName, exportIndex: 0 });
    }
  }

  return exports;
}

function normalizeAgentFn(value) {
  const internal = value?.[s.INTERNALS];
  const candidate = internal ?? value;
  const portAddr = candidate?.portAddr ?? value?.portAddr;
  const fn = candidate?.fn ?? value?.fn;
  const hashSource = candidate?.hash ?? value?.hash;
  const hash = typeof hashSource === 'function' ? hashSource.call(candidate) : hashSource;

  if (typeof portAddr !== 'string' || !portAddr.trim() || typeof fn !== 'function') {
    return null;
  }

  return {
    portAddr: portAddr.trim(),
    hash: typeof hash === 'string' && hash.trim() ? hash.trim() : undefined,
    fn,
  };
}
