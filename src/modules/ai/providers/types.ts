/**
 * Shared contract for the three AI provider adapters (AIP-01..03).
 * `fetchImpl` is injectable so tests stub the wire instead of the SDK;
 * production passes nothing and the adapter late-binds globalThis.fetch.
 */

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type ChatCompletionOptions = {
  apiKey: string;
  /** Free-text model id from central integration config. */
  model: string;
  system: string;
  prompt: string;
  fetchImpl?: FetchLike;
  /** Override the upstream origin (tests / self-hosted gateways). */
  baseUrl?: string;
};

export type ChatProviderFn = (options: ChatCompletionOptions) => Promise<string>;

/** Central-config models are optional; these defaults keep fill/test usable. */
export const DEFAULT_MODELS = {
  OPENAI: "gpt-4o-mini",
  ANTHROPIC: "claude-3-5-haiku-latest",
  GEMINI: "gemini-2.0-flash",
} as const;

/** Late-bound default fetch so runtime fetch stubbing keeps working. */
export function defaultFetch(url: string, init?: RequestInit): Promise<Response> {
  return globalThis.fetch(url, init);
}

/** Uniform upstream-failure error: carries the status, never the api key. */
export function upstreamError(provider: string, status: number): Error {
  return new Error(`${provider} request failed with upstream status ${status}`);
}
