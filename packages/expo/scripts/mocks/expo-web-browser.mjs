export const browser = { calls: [], next: { type: 'cancel' }, dismissed: 0 };
export async function openAuthSessionAsync(url, redirectUrl, options) {
  browser.calls.push({ url, redirectUrl, options });
  return typeof browser.next === 'function' ? browser.next(url, redirectUrl) : browser.next;
}
export function dismissAuthSession() {
  browser.dismissed++;
}
export function maybeCompleteAuthSession() {
  return { type: 'success' };
}
