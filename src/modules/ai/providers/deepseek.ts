import { upstreamFailure } from "../../../common/upstream.js";
import { defaultFetch, type ChatCompletionOptions } from "./types.js";

/**
 * DeepSeek adapter (AIP-04): POST {base}/chat/completions (OpenAI-compatible,
 * documented base https://api.deepseek.com — no /v1 prefix) with
 * `Authorization: Bearer <key>` and { model, messages }. Documented models:
 * deepseek-flash / deepseek-v4-pro.
 */
export async function callDeepSeek(options: ChatCompletionOptions): Promise<string> {
  const doFetch = options.fetchImpl ?? defaultFetch;
  const url = `${options.baseUrl ?? "https://api.deepseek.com"}/chat/completions`;
  const response = await doFetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify({
      model: options.model,
      messages: [
        { role: "system", content: options.system },
        { role: "user", content: options.prompt },
      ],
    }),
  });
  if (response.ok === false) {
    throw await upstreamFailure("deepseek", response);
  }
  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const first = body.choices?.[0];
  const content = first?.message?.content;
  return content === undefined ? "" : content;
}
