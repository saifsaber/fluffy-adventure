/* eslint-disable no-console */
import { main } from './dominance-cli.js';

process.exitCode = main(process.argv.slice(2), (line) => console.log(line));
