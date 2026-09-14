/* eslint-disable no-console */
import { main } from './run.js';

// The only file in the harness that talks to the outside world, so everything above it stays a pure
// function of its inputs and can be tested without capturing stdout or an exit code.
process.exitCode = main(process.argv.slice(2), (line) => console.log(line));
