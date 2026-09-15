import { upstreamFailure } from "../../../common/upstream.js";
import { defaultFetch, type ChatCompletionOptions } from "./types.js";

/**
 * Gemini adapter (AIP-03): POST /v1beta/models/{model}:generateContent with
 * `x-goog-api-key` and { contents, systemInstruction }.
 */
export async function callGemini(options: ChatCompletionOptions): Promise<string> {
  const doFetch = options.fetchImpl ?? defaultFetch;
  const url = `${options.baseUrl ?? "https://generativelanguage.googleapis.com"}/v1beta/models/${options.model}:generateContent`;
  const response = await doFetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": options.apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: options.prompt }] }],
      systemInstruction: { parts: [{ text: options.system }] },
    }),
  });
  if (response.ok === false) {
    throw await upstreamFailure("gemini", response);
  }
  const body = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const parts = body.candidates?.[0]?.content?.parts ?? [];
  let text = "";
  for (const part of parts) {
    if (part.text !== undefined) {
      text += part.text;
    }
  }
  return text;
}
