import { describe, expect, it } from "vitest";
import { callAnthropic } from "../src/modules/ai/providers/anthropic.js";
import { callGemini } from "../src/modules/ai/providers/gemini.js";
import { callOpenAi } from "../src/modules/ai/providers/openai.js";
import type { FetchLike } from "../src/modules/ai/providers/types.js";

/** Capturing fetch stub: records every call, replies with a fixed JSON body. */
function stubFetch(status: number, body: unknown): { fetch: FetchLike; calls: Array<{ url: string; init: RequestInit }> } {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init: init ?? {} });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
  return { fetch, calls };
}

const BASE = {
  apiKey: "sk-test-4242",
  model: "test-model-1",
  system: "system prompt",
  prompt: "user prompt",
} as const;

describe("TASK-C4 AI provider adapters (injectable fetch)", () => {
  it("AIP-01: openai posts Bearer auth to /v1/chat/completions with {model,messages}", async () => {
    // Given: an OpenAI-compatible upstream that echoes assistant text
    const { fetch, calls } = stubFetch(200, { choices: [{ message: { content: "assistant text" } }] });

    // When: callOpenAi runs
    const out = await callOpenAi({ ...BASE, fetchImpl: fetch });

    // Then: URL, auth header and body shape match the OpenAI chat contract
    expect(out).toBe("assistant text");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.openai.com/v1/chat/completions");
    const headers = new Headers(calls[0]?.init.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${BASE.apiKey}`);
    const body = JSON.parse(String(calls[0]?.init.body)) as {
      model: string;
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.model).toBe(BASE.model);
    expect(body.messages).toEqual([
      { role: "system", content: BASE.system },
      { role: "user", content: BASE.prompt },
    ]);
  });

  it("AIP-02: anthropic posts x-api-key + anthropic-version to /v1/messages with {model,max_tokens,system,messages}", async () => {
    // Given: an Anthropic-compatible upstream
    const { fetch, calls } = stubFetch(200, { content: [{ type: "text", text: "claude says hi" }] });

    // When: callAnthropic runs
    const out = await callAnthropic({ ...BASE, fetchImpl: fetch });

    // Then: URL, both required headers and the messages body shape match
    expect(out).toBe("claude says hi");
    expect(calls[0]?.url).toBe("https://api.anthropic.com/v1/messages");
    const headers = new Headers(calls[0]?.init.headers);
    expect(headers.get("x-api-key")).toBe(BASE.apiKey);
    expect(headers.get("anthropic-version")).toBe("2023-06-01");
    const body = JSON.parse(String(calls[0]?.init.body)) as {
      model: string;
      max_tokens: number;
      system: string;
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.model).toBe(BASE.model);
    expect(typeof body.max_tokens).toBe("number");
    expect(body.system).toBe(BASE.system);
    expect(body.messages).toEqual([{ role: "user", content: BASE.prompt }]);
  });

  it("AIP-03: gemini posts x-goog-api-key to /v1beta/models/{model}:generateContent with {contents,systemInstruction}", async () => {
    // Given: a Gemini-compatible upstream
    const { fetch, calls } = stubFetch(200, { candidates: [{ content: { parts: [{ text: "gemini text" }] } }] });

    // When: callGemini runs
    const out = await callGemini({ ...BASE, fetchImpl: fetch });

    // Then: URL, api-key header and the contents/systemInstruction body shape match
    expect(out).toBe("gemini text");
    expect(calls[0]?.url).toBe(
      `https://generativelanguage.googleapis.com/v1beta/models/${BASE.model}:generateContent`,
    );
    const headers = new Headers(calls[0]?.init.headers);
    expect(headers.get("x-goog-api-key")).toBe(BASE.apiKey);
    const body = JSON.parse(String(calls[0]?.init.body)) as {
      contents: Array<{ role: string; parts: Array<{ text: string }> }>;
      systemInstruction: { parts: Array<{ text: string }> };
    };
    expect(body.contents).toEqual([{ role: "user", parts: [{ text: BASE.prompt }] }]);
    expect(body.systemInstruction).toEqual({ parts: [{ text: BASE.system }] });
  });

  it("AIP-*: upstream failures never leak the api key in the thrown error", async () => {
    // Given: upstreams answering 401 for every provider
    const openai = stubFetch(401, { error: { message: "bad key" } });
    const anthropic = stubFetch(401, { error: { message: "bad key" } });
    const gemini = stubFetch(401, { error: { message: "bad key" } });

    // When: each provider is called against a failing upstream
    // Then: they throw with the upstream status but never embed the key
    await expect(callOpenAi({ ...BASE, fetchImpl: openai.fetch })).rejects.toThrow(/401/);
    await expect(callAnthropic({ ...BASE, fetchImpl: anthropic.fetch })).rejects.toThrow(/401/);
    await expect(callGemini({ ...BASE, fetchImpl: gemini.fetch })).rejects.toThrow(/401/);
    for (const stub of [openai, anthropic, gemini]) {
      try {
        await (stub === openai
          ? callOpenAi({ ...BASE, fetchImpl: stub.fetch })
          : stub === anthropic
            ? callAnthropic({ ...BASE, fetchImpl: stub.fetch })
            : callGemini({ ...BASE, fetchImpl: stub.fetch }));
      } catch (error) {
        expect(String(error)).not.toContain(BASE.apiKey);
      }
    }
  });
});
