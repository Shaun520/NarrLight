export interface ApiClientOptions {
  baseUrl: string;
}

export function createApiClient(options: ApiClientOptions) {
  return {
    baseUrl: options.baseUrl.replace(/\/$/, ""),
  };
}
