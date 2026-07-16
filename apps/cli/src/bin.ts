#!/usr/bin/env node
import { main } from "./main.js";

const argv = process.argv.slice(2);
// `init` may prompt, so main() can return a Promise; `generate`/`author` stay synchronous.
Promise.resolve(main(argv)).then((code) => {
  // `author` starts a long-running server (serve() is non-blocking); on success (code 0) we must
  // NOT process.exit or we'd kill it the instant it starts. A non-zero code means an error before
  // serve() ran, so exit with it. `generate`/`init` (one-shot) always exit.
  if (argv[0] !== "author" || code !== 0) process.exit(code);
});
