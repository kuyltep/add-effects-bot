import { Worker } from 'worker_threads';
import path from 'path';
import { Logger } from '../utils/rollbar.logger';
import fs from 'fs';

// Track active workers
const activeWorkers: Worker[] = [];

// Helper function to determine the correct script extension and path
function getScriptPath(basePath: string): string {
  // Remove any existing extension
  const basePathWithoutExt = basePath.replace(/\.(js|ts)$/, '');

  // Determine environment
  const isProd = process.env.NODE_ENV === 'production';
  const extension = isProd ? '.js' : '.ts';

  // In production, check if we need to adjust the path for compiled output
  if (isProd) {
    // In production, check if the path should be adjusted for dist/build directory
    // This depends on your TypeScript configuration
    try {
      // Try to locate tsconfig.json to determine output directory
      const tsconfigPath = path.resolve(process.cwd(), 'tsconfig.json');
      if (fs.existsSync(tsconfigPath)) {
        const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
        const outDir = tsconfig?.compilerOptions?.outDir;

        if (outDir) {
          // If outDir is defined, we might need to adjust the path
          // This is a simplified example - you may need to customize based on your project structure
          const relativePath = basePathWithoutExt.startsWith('../')
            ? basePathWithoutExt.substring(3) // Remove '../' prefix
            : basePathWithoutExt;

          return path.join(outDir, `${relativePath}${extension}`);
        }
      }
    } catch (error) {
      console.warn('Failed to parse tsconfig.json:', error);
      // Proceed with default path
    }
  }

  // Default path with appropriate extension
  return `${basePathWithoutExt}${extension}`;
}

// List of worker modules to launch in separate threads
const workers = [
  { name: 'imageEffectWorker', script: '../queues/imageEffectWorker' },
  { name: 'videoWorker', script: '../queues/videoWorker' },
  { name: 'upgradeWorker', script: '../queues/upgradeWorker' },
];

// Function to find the correct worker script file (JS or TS)
function findWorkerFile(basePath: string): string {
  const basePathWithoutExt = basePath.replace(/\.(js|ts)$/, '');
  const resolvedBasePath = path.resolve(__dirname, basePathWithoutExt);
  const jsPath = `${resolvedBasePath}.js`;
  if (fs.existsSync(jsPath)) return jsPath;
  const tsPath = `${resolvedBasePath}.ts`;
  if (fs.existsSync(tsPath)) return tsPath;
  Logger.warn(`Worker script not found for base path: ${basePath}. Trying .js path.`, { jsPath });
  return jsPath; // Default to JS path if neither found
}

// Function to start a worker in its own thread
function startWorker(workerData: { name: string; script: string }) {
  try {
    const workerPath = findWorkerFile(workerData.script);

    const worker = new Worker(workerPath, {
      workerData: { workerName: workerData.name },
    });

    activeWorkers.push(worker);

    worker.on('online', () => Logger.info(`Worker ${workerData.name} is online`));
    worker.on('message', message => Logger.info(`Message from ${workerData.name}:`, { message }));
    worker.on('error', error => {
      Logger.error(error, { context: 'worker-thread', worker: workerData.name });
      // Consider a restart strategy with backoff
    });
    worker.on('exit', code => {
      const index = activeWorkers.indexOf(worker);
      if (index > -1) activeWorkers.splice(index, 1);
      if (code !== 0) {
        Logger.error(`Worker ${workerData.name} exited`, { code, worker: workerData.name });
        // Consider restarting
      }
    });
    return worker;
  } catch (error) {
    Logger.error(error, { context: 'worker-thread-start', worker: workerData.name });
    return null;
  }
}

// Start all workers
export function launchWorkers() {
  workers.forEach(startWorker);
}

// Gracefully stop all workers
export async function stopWorkers(): Promise<boolean> {
  let success = true;
  const shutdownPromises = activeWorkers.map(worker => {
    return new Promise<void>(resolve => {
      worker.once('exit', () => resolve());
      worker.postMessage({ type: 'shutdown' }); // Signal worker to shutdown
      setTimeout(() => {
        worker
          .terminate()
          .then(() => {
            Logger.warn(`Worker terminated forcefully after timeout.`);
            resolve();
          })
          .catch(err => {
            Logger.error('Error during forceful termination', { err });
            success = false;
            resolve(); // Still resolve to not block shutdown
          });
      }, 5000);
    });
  });

  if (shutdownPromises.length > 0) {
    await Promise.all(shutdownPromises);
  }
  activeWorkers.length = 0; // Clear the array
  return success;
}

// Optional: Handle main process signals for graceful shutdown
// process.on('SIGINT', async () => { await stopWorkers(); process.exit(0); });
// process.on('SIGTERM', async () => { await stopWorkers(); process.exit(0); });

// Start workers if this file is run directly
if (require.main === module) {
  launchWorkers();
}
