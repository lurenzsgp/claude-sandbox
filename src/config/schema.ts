export interface Config {
  /** Absolute path to monorepo root. Walk for .claude-sandbox-ignore stops here. null = walk to fs root. */
  monorepoRoot: string | null;
  /** Docker registry URL for pulling the sandbox image. null = local build only. */
  registryUrl: string | null;
}

export const DEFAULT_CONFIG: Config = {
  monorepoRoot: null,
  registryUrl: null,
};
