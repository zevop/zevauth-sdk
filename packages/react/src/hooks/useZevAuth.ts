import { useZevAuthContext } from '../internal/context.js';
import type { ZevAuth } from '@zevauth/js';

/** The client itself, for anything the typed hooks do not cover. */
export function useZevAuth(): ZevAuth {
  return useZevAuthContext('useZevAuth').client;
}
