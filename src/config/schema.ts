export interface Config {
  /** Docker registry URL for pulling the sandbox image. null = local build only. */
  registryUrl: string | null;
}

export const DEFAULT_CONFIG: Config = {
  registryUrl: null,
};
