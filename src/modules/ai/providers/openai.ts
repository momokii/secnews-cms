import { defaultFetch, upstreamError, type ChatCompletionOptions } from "./types.js";

/**
 * OpenAI adapter (AIP-01): POST /v1/chat/completions with
 * `Authorization: Bearer <key>` and { model, messages }.
 */
export async function callOpenAi(options: ChatCompletionOptions): Promise<string> {
  const doFetch = options.fetchImpl ?? defaultFetch;
  const url = `${options.baseUrl ?? "https://api.openai.com"}/v1/chat/completions`;
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
    throw upstreamError("openai", response.status);
  }
  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const first = body.choices?.[0];
  const content = first?.message?.content;
  return content === undefined ? "" : content;
}
