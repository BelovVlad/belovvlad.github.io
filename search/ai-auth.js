// Browsers reject non-ISO-8859-1 characters in HTTP header values.
// Store users' passwords unchanged, but send non-ASCII credentials in a
// versioned, ASCII-safe representation that the Hyle API can decode.
export const UTF8_BEARER_PREFIX = 'hyle-utf8-v1.';

export function bearerAuthorization(key) {
  if (typeof key !== 'string' || !key) throw new TypeError('Missing AI access key');
  const headerValue = /^[\x21-\x7E]+$/.test(key)
    ? key
    : UTF8_BEARER_PREFIX + encodeURIComponent(key);
  return 'Bearer ' + headerValue;
}
