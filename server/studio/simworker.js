/* Worker thread: runs sim.js (about a minute of CPU) off the studio's event loop. */
import { parentPort, workerData } from 'node:worker_threads';
import { simulate } from './sim.js';

const res = simulate({ ...workerData, progress: p => parentPort.postMessage({ progress: p }) });
parentPort.postMessage({ result: res });
