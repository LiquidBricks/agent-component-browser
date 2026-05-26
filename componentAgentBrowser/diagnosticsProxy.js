const UNKNOWN_CODE = 'UNKNOWN';

export class WorkerDiagnosticError extends Error {
  constructor({ type, code, message, meta, cause }) {
    super(message);
    this.name = 'WorkerDiagnosticError';
    this.type = type;
    this.code = code;
    this.meta = meta;
    this.cause = cause;
  }
}

export function createWorkerDiagnostics({
  postMessage,
  source,
  baseMeta = {},
  now = () => Date.now(),
} = {}) {
  const emit = (level, payload) => {
    postMessage?.({
      source,
      type: 'diagnostic',
      level,
      code: payload.code,
      msg: payload.msg,
      meta: normalizeMeta({ ...baseMeta, ...(payload.meta ?? {}) }),
    });
  };

  const fail = (type, code, msg, meta, opts = {}) => {
    emit('error', { code, msg, meta });
    throw new WorkerDiagnosticError({
      type,
      code,
      message: msg,
      meta: normalizeMeta({ ...baseMeta, ...(meta ?? {}) }),
      cause: opts.cause,
    });
  };

  return {
    invariant(cond, code, msg, meta) {
      if (!cond) fail('Invariant', code, msg, meta);
    },
    require(cond, code, msg, meta) {
      if (!cond) fail('Precondition', code, msg, meta);
    },
    error(code, msg, meta, opts) {
      fail('Operational', code, msg, meta, opts);
    },
    warn(cond, code, msg, meta) {
      if (cond) return;
      emit('warn', { code: code ?? UNKNOWN_CODE, msg, meta });
    },
    info(msg, meta) {
      emit('info', { msg, meta });
    },
    debug(msg, meta) {
      emit('debug', { msg, meta });
    },
    timer(name, baseTimerMeta) {
      const start = now();
      return {
        stop(extraMeta) {
          const durationMs = now() - start;
          const meta = {
            ...baseTimerMeta,
            ...extraMeta,
            duration_ms: durationMs,
          };
          emit('info', { code: `TIMER_${name}`, msg: 'timer.stop', meta });
          return durationMs;
        },
      };
    },
    child(scopeMeta) {
      return createWorkerDiagnostics({
        postMessage,
        source,
        baseMeta: { ...baseMeta, ...(scopeMeta ?? {}) },
        now,
      });
    },
    DiagnosticError: WorkerDiagnosticError,
  };
}

function normalizeMeta(value, seen = new WeakSet()) {
  if (value == null || typeof value !== 'object') {
    return value;
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      code: value.code,
      meta: normalizeMeta(value.meta, seen),
    };
  }
  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => normalizeMeta(item, seen));
  }

  const normalized = {};
  for (const [key, item] of Object.entries(value)) {
    normalized[key] = normalizeMeta(item, seen);
  }
  return normalized;
}
