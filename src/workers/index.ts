import { Worker } from 'worker_threads';
import path from 'path';
import { Logger } from '../utils/rollbar.logger';
import fs from 'fs';

// Track active workers
const activeWorkers: Worker[] = [];

// Track successful worker paths for future launches
const successfulWorkerPaths: Record<string, string> = {};

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
  { name: 'generationWorker', script: '../queues/generationWorker' },
  { name: 'upgradeWorker', script: '../queues/upgradeWorker' },
  { name: 'videoWorker', script: '../queues/videoWorker' }
];

// Function to find the correct worker script file
function findWorkerFile(basePath: string): string {
  // Get absolute path without extension
  const basePathWithoutExt = basePath.replace(/\.(js|ts)$/, '');
  const resolvedBasePath = path.resolve(__dirname, basePathWithoutExt);
  
  // Try JavaScript file first (production build)
  const jsPath = `${resolvedBasePath}.js`;
  if (fs.existsSync(jsPath)) {
    return jsPath;
  }
  
  // Fall back to TypeScript file (development mode)
  const tsPath = `${resolvedBasePath}.ts`;
  if (fs.existsSync(tsPath)) {
    return tsPath;
  }
  
  // If neither exists, return the JS path and let the worker creation handle the error
  return jsPath;
}

// Function to start a worker in its own thread
function startWorker(workerData: { name: string, script: string }) {
  try {
    // Find the correct worker file (JS or TS)
    const workerPath = findWorkerFile(workerData.script);
    console.log(`Starting worker ${workerData.name} using: ${workerPath}`);
    
    // Create the worker
    const worker = new Worker(workerPath, {
      workerData: { workerName: workerData.name }
    });
    
    // Store the worker reference
    activeWorkers.push(worker);

    // Handle worker events
    worker.on('online', () => {
      console.log(`Worker ${workerData.name} is online`);
    });

    worker.on('message', (message) => {
      console.log(`Message from ${workerData.name}:`, message);
    });

    worker.on('error', (error) => {
      Logger.error(error, {
        context: 'worker-threads',
        worker: workerData.name
      });
      console.error(`Error in ${workerData.name}:`, error);
      // Restart the worker on error
      setTimeout(() => startWorker(workerData), 5000);
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        Logger.error(`Worker ${workerData.name} exited with code ${code}`, {
          context: 'worker-threads',
          worker: workerData.name,
          exitCode: code
        });
        console.error(`Worker ${workerData.name} exited with code ${code}`);
        // Restart the worker if it crashed
        setTimeout(() => startWorker(workerData), 5000);
      }

      // Remove worker from active workers
      const index = activeWorkers.indexOf(worker);
      if (index > -1) {
        activeWorkers.splice(index, 1);
      }
    });

    return worker;
  } catch (error) {
    Logger.error(error, {
      context: 'worker-threads',
      worker: workerData.name
    });
    console.error(`Failed to start worker ${workerData.name}:`, error);
    
    // Try to restart the worker
    setTimeout(() => startWorker(workerData), 5000);
    return null;
  }
}

// Start all workers
export function launchWorkers() {
  console.log('Launching workers in separate threads...');
  
  workers.forEach(worker => {
    startWorker(worker);
  });
  
  console.log('All workers launched');
}

// Gracefully stop all workers
export async function stopWorkers(): Promise<boolean> {
  console.log('Shutting down workers...');
  
  let success = true;
  
  // Send shutdown message to all workers and wait for them to terminate
  const shutdownPromises = activeWorkers.map(worker => {
    return new Promise<void>((resolve) => {
      // Set up a one-time exit handler to know when the worker is done
      worker.once('exit', () => {
        resolve();
      });
      
      // Send shutdown message
      worker.postMessage({ type: 'shutdown' });
      
      // Set a timeout to force termination if graceful shutdown fails
      setTimeout(() => {
        try {
          worker.terminate();
          console.log('Worker terminated forcefully');
        } catch (error) {
          console.error('Error terminating worker:', error);
          success = false;
        } finally {
          resolve();
        }
      }, 5000); // 5 second timeout for graceful shutdown
    });
  });
  
  // Wait for all workers to exit
  if (shutdownPromises.length > 0) {
    await Promise.all(shutdownPromises);
  }
  
  console.log(`All workers shut down ${success ? 'successfully' : 'with some errors'}`);
  return success;
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down workers...');
  stopWorkers().then(() => {
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('Shutting down workers...');
  stopWorkers().then(() => {
    process.exit(0);
  });
});

// Start workers if this file is run directly
if (require.main === module) {
  launchWorkers();
} 