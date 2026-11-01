export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY = 4;
export const store = new Map();
export const calls = [];
export async function getItemAsync(key, options) {
  calls.push(['get', key, options]);
  return store.get(key) ?? null;
}
export async function setItemAsync(key, value, options) {
  calls.push(['set', key, options]);
  store.set(key, value);
}
export async function deleteItemAsync(key, options) {
  calls.push(['delete', key, options]);
  store.delete(key);
}
