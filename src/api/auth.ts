// No-op interceptor. Future: pull JWT from secure storage, add Bearer header,
// refresh on 401. Signature is intentionally stable so call sites don't change.
export function applyAuth(headers: Record<string, string>): Record<string, string> {
  return headers;
}
