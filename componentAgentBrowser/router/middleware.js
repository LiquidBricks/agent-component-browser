import { Codes } from '../codes.js';

export function decodeData(selector) {
  return function ({ message, rootCtx: { diagnostics } }) {
    const { data } = message;
    diagnostics.require(
      data,
      Codes.PRECONDITION_REQUIRED,
      'Data is required',
      { field: 'data', subject: message.subject },
    );

    const isString = typeof selector === 'string';
    const isArray = Array.isArray(selector);

    diagnostics.require(
      isString || isArray,
      Codes.PRECONDITION_INVALID,
      'decodeData requires a string key or array of keys',
      { selector },
    );

    if (isString) {
      diagnostics.require(
        selector.length > 0,
        Codes.PRECONDITION_REQUIRED,
        'decodeData key cannot be empty',
        { field: 'selector' },
      );
      return { [selector]: data };
    }

    diagnostics.require(
      selector.length > 0,
      Codes.PRECONDITION_REQUIRED,
      'decodeData keys cannot be empty',
      { field: 'selector' },
    );
    diagnostics.require(
      selector.every((k) => typeof k === 'string' && k.length > 0),
      Codes.PRECONDITION_INVALID,
      'decodeData keys must be non-empty strings',
      { selector },
    );

    const picked = {};
    for (const k of selector) {
      if (Object.prototype.hasOwnProperty.call(data, k)) {
        picked[k] = data[k];
      }
    }
    return picked;
  };
}
