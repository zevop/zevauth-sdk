/**
 * The component stylesheet, on an entry with no React in it.
 *
 * A server component (the Next.js app router's `layout.tsx`) has to put
 * the stylesheet in the HTML, but cannot import the main entry: that
 * module creates React contexts as it loads, which the server runtime
 * refuses, and through `@zevauth/nextjs` it sits behind `'use client'`,
 * where a server file gets an opaque reference instead of the string.
 * This entry is plain strings and one pure function, so it is safe
 * anywhere.
 */
export {
  componentStyles,
  componentStyleId,
  getComponentStyles,
} from './internal/styles.js';
