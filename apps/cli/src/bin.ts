#!/usr/bin/env node
import { main } from "./main.js";

const argv = process.argv.slice(2);
const code = main(argv);
// `author` starts a long-running server (serve() is non-blocking); forcing process.exit()
// here would kill it the instant it starts. Only `generate` (synchronous, one-shot) exits.
if (argv[0] !== "author") process.exit(code);
