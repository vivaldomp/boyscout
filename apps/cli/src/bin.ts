#!/usr/bin/env node
import { main } from "./main.js";

const argv = process.argv.slice(2);
const code = main(argv);
// `author` starts a long-running server (serve() is non-blocking); on success (code 0) we must NOT
// process.exit or we'd kill it the instant it starts. A non-zero code means an error before serve()
// ran, so exit with it. `generate` (synchronous, one-shot) always exits.
if (argv[0] !== "author" || code !== 0) process.exit(code);
