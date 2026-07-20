import { ProxyAgent } from 'undici';

type FetchInitWithDispatcher = RequestInit & {
  dispatcher?: ProxyAgent;
};

function resolveProxyUrl(explicitProxyUrl?: string): string | undefined {
  return (
    explicitProxyUrl ||
    process.env.OPENAI_PROXY_URL ||
    process.env.ARK_PROXY_URL ||
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.ALL_PROXY ||
    undefined
  );
}

export function fetchWithOptionalProxy(
  input: string | URL,
  init: RequestInit = {},
  explicitProxyUrl?: string,
): Promise<Response> {
  const proxyUrl = resolveProxyUrl(explicitProxyUrl);
  if (!proxyUrl) return fetch(input, init);

  const dispatcher = new ProxyAgent(proxyUrl);
  return fetch(input, {
    ...init,
    dispatcher,
  } as FetchInitWithDispatcher);
}
