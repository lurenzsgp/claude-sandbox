import { userInfo } from 'os';
import { resolve } from 'path';
import { existsSync, readFileSync } from 'fs';
import { createHash } from 'crypto';
import Dockerode from 'dockerode';

export const IMAGE_TAG = 'claude-sandbox:latest';

// Resolve project root by walking up from this file until we find the Dockerfile.
// esbuild bundles to CJS which provides __dirname as the directory of the bundle output.
// We walk up from there to find the project root containing the Dockerfile.
function findProjectRoot(): string {
  // __dirname is available in CJS output (esbuild injects it)
  // In tsx dev mode, __dirname is also available
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    if (existsSync(resolve(dir, 'Dockerfile'))) return dir;
    const parent = resolve(dir, '..');
    if (parent === dir) break; // filesystem root
    dir = parent;
  }
  // Last resort — walk up three levels from wherever the bundle landed
  return resolve(__dirname, '../../..');
}

/** Label key used to stamp the build-context hash onto the image. */
const HASH_LABEL = 'claude-sandbox.context-hash';

/**
 * Compute a SHA-256 hash of the Dockerfile and entrypoint.sh build context.
 * Used to detect when the image is stale and needs a rebuild.
 */
function buildContextHash(contextDir: string): string {
  const hash = createHash('sha256');
  for (const file of ['Dockerfile', 'entrypoint.sh']) {
    const p = resolve(contextDir, file);
    if (existsSync(p)) hash.update(readFileSync(p));
  }
  return hash.digest('hex').slice(0, 16);
}

/**
 * Check if the sandbox image exists locally AND its build-context hash matches
 * the current Dockerfile + entrypoint.sh. Returns false (triggering a rebuild)
 * if the image is absent or was built from a different context.
 */
async function imageUpToDate(docker: Dockerode, contextDir: string): Promise<boolean> {
  try {
    const images = await docker.listImages({ filters: { reference: [IMAGE_TAG] } });
    if (images.length === 0) return false;
    const storedHash = images[0]?.Labels?.[HASH_LABEL];
    return storedHash === buildContextHash(contextDir);
  } catch {
    return false;
  }
}

/**
 * Build the sandbox image with friendly progress output (D-09).
 * Passes host UID/GID as build args (CONT-02).
 */
async function buildImage(docker: Dockerode, isRebuild: boolean): Promise<void> {
  const { uid, gid } = userInfo();
  const contextDir = findProjectRoot();
  const contextHash = buildContextHash(contextDir);

  if (isRebuild) {
    console.log('Dockerfile changed — rebuilding sandbox image...\n');
  } else {
    console.log('Building sandbox image for the first time — this takes ~5 minutes...');
    console.log('  (This only happens once. Subsequent starts are instant.)\n');
  }

  const fullLog: string[] = [];
  let stepCount = 0;

  return new Promise<void>((resolve, reject) => {
    docker.buildImage(
      { context: contextDir, src: ['Dockerfile', 'entrypoint.sh'] },
      {
        t: IMAGE_TAG,
        buildargs: { UID: String(uid), GID: String(gid) },
        labels: { [HASH_LABEL]: contextHash },
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
          const verb = isRebuild ? 'rebuilt' : 'built';
          console.log(`\nSandbox image ${verb} successfully (${stepCount} steps).`);
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
 * Ensure the sandbox image exists and is up-to-date with the current
 * Dockerfile + entrypoint.sh (D-07, D-08). Rebuilds automatically when the
 * build context changes (e.g. CMD, RUN layers, entrypoint edits).
 */
export async function ensureImage(docker: Dockerode): Promise<void> {
  const contextDir = findProjectRoot();
  const upToDate = await imageUpToDate(docker, contextDir);
  if (upToDate) return;

  // Check if an image exists at all to decide the log message
  const images = await docker.listImages({ filters: { reference: [IMAGE_TAG] } }).catch(() => []);
  const isRebuild = images.length > 0;
  await buildImage(docker, isRebuild);
}
