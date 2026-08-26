'use client';

/**
 * Everything a Next.js app renders.
 *
 * ── Why `'use client'` is on this file ────────────────────────────
 * Every component here holds state and subscribes to the session, so
 * none of them can be server components. Marking the entry point means a
 * developer importing `<SignIn>` into a server component gets it working
 * instead of the "useState is not a function" error that sends people to
 * search for a Next.js bug that is not one.
 *
 * Server helpers live at `@zevauth/nextjs/server` — a separate entry so
 * nothing in this file, and no browser API it touches, is ever pulled
 * into a server bundle.
 */
export * from '@zevauth/react';
