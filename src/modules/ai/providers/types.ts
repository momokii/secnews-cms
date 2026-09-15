/**
 * Shared contract for the four AI provider adapters (AIP-01..04).
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

/** Central-config models are optional; these defaults keep fill/test usable.
 * DEEPSEEK's default is the documented cheap chat model (api-docs.deepseek.com). */
export const DEFAULT_MODELS = {
  OPENAI: "gpt-4o-mini",
  ANTHROPIC: "claude-3-5-haiku-latest",
  GEMINI: "gemini-2.0-flash",
  DEEPSEEK: "deepseek-flash",
} as const;

/** Late-bound default fetch so runtime fetch stubbing keeps working. */
export function defaultFetch(url: string, init?: RequestInit): Promise<Response> {
  return globalThis.fetch(url, init);
}
