/*
 * Runs the package against stand-ins for React Native and the Expo
 * modules, so `npm run verify` works on any machine without a phone,
 * a simulator or the React Native toolchain. Each mock implements only
 * what the package calls, and records it so the checks can assert on it.
 */
import { register } from 'node:module';

register(new URL('./mock-resolver.mjs', import.meta.url));
