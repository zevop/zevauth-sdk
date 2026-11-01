import { createHash, getRandomValues as nodeRandom } from 'node:crypto';
export const CryptoDigestAlgorithm = { SHA256: 'SHA-256' };
export function getRandomValues(array) {
  return nodeRandom(array);
}
export async function digest(_algorithm, data) {
  const out = createHash('sha256').update(data).digest();
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}
