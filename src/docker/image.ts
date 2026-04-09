import { userInfo } from 'os';
import { resolve, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import Dockerode from 'dockerode';

export const IMAGE_TAG = 'claude-sandbox:latest';

// Resolve project root by walking up from this file until we find the Dockerfile
function findProjectRoot(): string {
  // When running via tsx (development): __dirname is src/docker/
  // When bundled by esbuild (CJS): __dirname is wherever esbuild places the bundle
  // Walk up a reasonable number of levels to find Dockerfile
  let dir: string;
  try {
    dir = dirname(fileURLToPath(import.meta.url));
  } catch {
    // Fallback for CJS bundles where import.meta.url may not be standard
    dir = __dirname;
  }
  for (let i = 0; i < 8; i++) {
    if (existsSync(resolve(dir, 'Dockerfile'))) return dir;
    const parent = resolve(dir, '..');
    if (parent === dir) break; // filesystem root
    dir = parent;
  }
  // Last resort — return two levels up from src/docker/
  return resolve(dirname(fileURLToPath(import.meta.url)), '../..');
}

/**
 * Check if the sandbox image exists locally.
 */
async function imageExists(docker: Dockerode): Promise<boolean> {
  try {
    const images = await docker.listImages({ filters: { reference: [IMAGE_TAG] } });
    return images.length > 0;
  } catch {
    return false;
  }
}

/**
 * Build the sandbox image with friendly progress output (D-09).
 * Passes host UID/GID as build args (CONT-02).
 */
async function buildImage(docker: Dockerode): Promise<void> {
  const { uid, gid } = userInfo();
  const contextDir = findProjectRoot();

  console.log('Building sandbox image for the first time — this takes ~5 minutes...');
  console.log('  (This only happens once. Subsequent starts are instant.)\n');

  const fullLog: string[] = [];
  let stepCount = 0;

  return new Promise<void>((resolve, reject) => {
    docker.buildImage(
      { context: contextDir, src: ['Dockerfile', 'entrypoint.sh'] },
      {
        t: IMAGE_TAG,
        buildargs: { UID: String(uid), GID: String(gid) },
      },
      (err, stream) => {
        if (err) return reject(new Error(`Build failed to start: ${err.message}`));
        if (!stream) return reject(new Error('Build stream is null'));

        stream.on('data', (chunk: Buffer) => {
          try {
            const data = JSON.parse(chunk.toString()) as {
              stream?: string;
              error?: string;
              status?: string;
            };

            if (data.stream) {
              const line = data.stream.trim();
              if (line) fullLog.push(line);
              if (line.startsWith('Step ')) {
                stepCount++;
                process.stdout.write(`  ${line}\n`);
              }
            }
            if (data.error) {
              fullLog.push(`ERROR: ${data.error}`);
              console.error('\nBuild failed. Full build log:\n');
              console.error(fullLog.join('\n'));
              reject(new Error(data.error));
            }
          } catch {
            // Non-JSON chunk — ignore
          }
        });

        stream.on('end', () => {
          console.log(`\nSandbox image built successfully (${stepCount} steps).`);
          resolve();
        });

        stream.on('error', (e: Error) => {
          console.error('\nBuild stream error. Full log:\n', fullLog.join('\n'));
          reject(e);
        });
      }
    );
  });
}

/**
 * Ensure the sandbox image exists, building it if not (D-07, D-08).
 * For Phase 1, always builds locally (no registry pull configured).
 */
export async function ensureImage(docker: Dockerode): Promise<void> {
  if (await imageExists(docker)) {
    return; // Image already exists — skip build
  }
  await buildImage(docker);
}
