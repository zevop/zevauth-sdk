import React from 'react';

/**
 * `tsx` compiles JSX with the classic runtime regardless of tsconfig,
 * so every element becomes `React.createElement(...)` with nothing named
 * `React` in scope. Harness only: the package itself builds with the
 * automatic runtime.
 */
(globalThis as unknown as { React: typeof React }).React = React;
