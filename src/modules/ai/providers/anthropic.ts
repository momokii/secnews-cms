import { upstreamFailure } from "../../../common/upstream.js";
import { defaultFetch, type ChatCompletionOptions } from "./types.js";

/**
 * Anthropic adapter (AIP-02): POST /v1/messages with `x-api-key` +
 * `anthropic-version: 2023-06-01` and { model, max_tokens, system, messages }.
 */
export async function callAnthropic(options: ChatCompletionOptions): Promise<string> {
  const doFetch = options.fetchImpl ?? defaultFetch;
  const url = `${options.baseUrl ?? "https://api.anthropic.com"}/v1/messages`;
  const response = await doFetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": options.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: options.model,
      max_tokens: 1024,
      system: options.system,
      messages: [{ role: "user", content: options.prompt }],
    }),
  });
  if (response.ok === false) {
    throw await upstreamFailure("anthropic", response);
  }
  const body = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const blocks = body.content ?? [];
  let text = "";
  for (const block of blocks) {
    if (block.type === "text" && block.text !== undefined) {
      text += block.text;
    }
  }
  return text;
}
