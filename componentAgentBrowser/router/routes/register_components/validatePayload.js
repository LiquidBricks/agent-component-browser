import { PRECONDITION_INVALID, PRECONDITION_REQUIRED } from '@liquid-bricks/lib-diagnostics/codes';

export function ensureFilesProvided({ scope: { files }, rootCtx: { diagnostics } }) {
  diagnostics.require(
    Array.isArray(files),
    PRECONDITION_INVALID,
    'files must be an array',
    { field: 'files' },
  );
  diagnostics.require(
    files.length > 0,
    PRECONDITION_REQUIRED,
    'files is required',
    { field: 'files' },
  );
}
