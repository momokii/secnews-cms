import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setToken } from "../../lib/tokenStore";
import {
  TICKET_ID,
  jsonResponse,
  paginated,
  renderWithProviders,
  routeFetch,
  suggestionFixture,
} from "./testUtils";
import { AiPanel } from "./AiPanel";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

/** GEMINI is keyless and OTX is not an AI provider — the picker must drop both. */
function availableResponder(): {
  match: (url: string, method: string) => boolean;
  respond: () => Response;
} {
  return {
    match: (url, method) => method === "GET" && url.endsWith("/integrations/available"),
    respond: () =>
      jsonResponse([
        { kind: "OPENAI", model: "gpt-5", hasKey: true },
        { kind: "ANTHROPIC", model: null, hasKey: true },
        { kind: "GEMINI", model: "gemini-2.5", hasKey: false },
        { kind: "OTX", model: null, hasKey: true },
      ]),
  };
}

function routes(): Array<{
  match: (url: string, method: string) => boolean;
  respond: () => Response;
}> {
  return [
    {
      match: (url, method) =>
        method === "GET" && url.startsWith(`/api/tickets/${TICKET_ID}/suggestions`),
      respond: () => jsonResponse(paginated([suggestionFixture()])),
    },
    availableResponder(),
    {
      match: (url, method) => method === "POST" && url.endsWith("/ai/fill"),
      respond: () => jsonResponse({ suggestions: [suggestionFixture()] }),
    },
    {
      match: (url, method) => method === "POST" && url.endsWith("/ai/enrich"),
      respond: () => jsonResponse({ suggestions: [suggestionFixture()] }),
    },
    {
      match: (url, method) => method === "POST" && url.endsWith("/accept"),
      respond: () => jsonResponse({ suggestion: suggestionFixture({ status: "ACCEPTED" }) }),
    },
    {
      match: (url, method) => method === "POST" && url.endsWith("/reject"),
      respond: () => jsonResponse({ suggestion: suggestionFixture({ status: "REJECTED" }) }),
    },
  ];
}

describe("FE-AI-01: AI panel", () => {
  it("POSTs to ai/fill when AI fill (strict) is clicked", async () => {
    setToken("test-token");
    const fetchMock = routeFetch(routes());
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(
      <AiPanel ticketId={TICKET_ID} pendingSuggestions={0} blocked={false} />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "AI fill (strict)" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/tickets/${TICKET_ID}/ai/fill`,
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("POSTs to ai/enrich when AI enrich is clicked", async () => {
    setToken("test-token");
    const fetchMock = routeFetch(routes());
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(
      <AiPanel ticketId={TICKET_ID} pendingSuggestions={0} blocked={false} />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "AI enrich" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/tickets/${TICKET_ID}/ai/enrich`,
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("lists suggestions with PENDING badges and accept/reject only for pending rows", async () => {
    setToken("test-token");
    vi.stubGlobal(
      "fetch",
      routeFetch([
        {
          match: (url, method) =>
            method === "GET" && url.startsWith(`/api/tickets/${TICKET_ID}/suggestions`),
          respond: () =>
            jsonResponse(
              paginated([
                suggestionFixture({ status: "PENDING" }),
                suggestionFixture({
                  id: "66666666-6666-4666-8666-666666666666",
                  field: "description",
                  status: "ACCEPTED",
                }),
              ]),
            ),
        },
      ]),
    );
    renderWithProviders(
      <AiPanel ticketId={TICKET_ID} pendingSuggestions={1} blocked={false} />,
    );

    expect((await screen.findAllByText("PENDING")).length).toBe(1);
    expect(screen.getByText("ACCEPTED")).toBeTruthy();
    const acceptButtons = screen.getAllByRole("button", { name: "Accept" });
    const rejectButtons = screen.getAllByRole("button", { name: "Reject" });
    expect(acceptButtons).toHaveLength(1);
    expect(rejectButtons).toHaveLength(1);
  });

  it("POSTs accept when Accept is clicked", async () => {
    setToken("test-token");
    const fetchMock = routeFetch(routes());
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(
      <AiPanel ticketId={TICKET_ID} pendingSuggestions={1} blocked={false} />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Accept" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/tickets/${TICKET_ID}/suggestions/${suggestionFixture().id}/accept`,
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("shows the hard-block banner when pendingSuggestions > 0", async () => {
    setToken("test-token");
    vi.stubGlobal("fetch", routeFetch(routes()));
    renderWithProviders(
      <AiPanel ticketId={TICKET_ID} pendingSuggestions={2} blocked={false} />,
    );

    const banner = await screen.findByRole("alert");
    expect(banner.textContent).toContain("2 unresolved AI suggestion");
    expect(banner.textContent).toContain("Send");
    expect(banner.textContent).toContain("OTX");
  });

  it("shows the banner on a 409 block flag even with zero pending suggestions", () => {
    setToken("test-token");
    vi.stubGlobal("fetch", routeFetch(routes()));
    renderWithProviders(
      <AiPanel ticketId={TICKET_ID} pendingSuggestions={0} blocked={true} />,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("hides the banner when nothing blocks delivery", () => {
    setToken("test-token");
    vi.stubGlobal("fetch", routeFetch(routes()));
    renderWithProviders(
      <AiPanel ticketId={TICKET_ID} pendingSuggestions={0} blocked={false} />,
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("explains the difference between AI fill and AI enrich above the buttons", async () => {
    setToken("test-token");
    vi.stubGlobal("fetch", routeFetch(routes()));
    renderWithProviders(
      <AiPanel ticketId={TICKET_ID} pendingSuggestions={0} blocked={false} />,
    );

    const explainer = await screen.findByText(/Fill: drafts Overview\/Description\/etc\. ONLY/);
    expect(explainer.textContent).toContain("never invents facts");
    expect(explainer.textContent).toContain("researches extra context first");
    expect(explainer.textContent).toContain("Accept/Edit/Reject");
    expect(explainer.textContent).toContain("sending is blocked while any is pending");
  });
});

describe("TASK-UIC2: AI loading states, picker, provenance, help", () => {
  it("shows a disabled Filling… state while ai/fill is in flight", async () => {
    // Given: ai/fill never answers
    setToken("test-token");
    vi.stubGlobal(
      "fetch",
      routeFetch([
        {
          match: (url, method) =>
            method === "GET" && url.startsWith(`/api/tickets/${TICKET_ID}/suggestions`),
          respond: () => jsonResponse(paginated([])),
        },
        availableResponder(),
        {
          match: (url, method) => method === "POST" && url.endsWith("/ai/fill"),
          respond: () => new Promise<Response>(() => {}),
        },
      ]),
    );
    renderWithProviders(
      <AiPanel ticketId={TICKET_ID} pendingSuggestions={0} blocked={false} />,
    );

    // When: AI fill (strict) is clicked
    fireEvent.click(await screen.findByRole("button", { name: "AI fill (strict)" }));

    // Then: the button flips to the in-flight label and both AI buttons lock
    const filling = (await screen.findByRole("button", { name: "Filling…" })) as HTMLButtonElement;
    expect(filling.disabled).toBe(true);
    expect(
      (screen.getByRole("button", { name: "AI enrich" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("shows a disabled Enriching… state while ai/enrich is in flight", async () => {
    setToken("test-token");
    vi.stubGlobal(
      "fetch",
      routeFetch([
        {
          match: (url, method) =>
            method === "GET" && url.startsWith(`/api/tickets/${TICKET_ID}/suggestions`),
          respond: () => jsonResponse(paginated([])),
        },
        availableResponder(),
        {
          match: (url, method) => method === "POST" && url.endsWith("/ai/enrich"),
          respond: () => new Promise<Response>(() => {}),
        },
      ]),
    );
    renderWithProviders(
      <AiPanel ticketId={TICKET_ID} pendingSuggestions={0} blocked={false} />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "AI enrich" }));

    const enriching = (await screen.findByRole("button", { name: "Enriching…" })) as HTMLButtonElement;
    expect(enriching.disabled).toBe(true);
    expect(
      (screen.getByRole("button", { name: "AI fill (strict)" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("lists Auto plus only key-configured AI providers in the picker", async () => {
    // Given: OPENAI and ANTHROPIC have keys, GEMINI does not, OTX is not AI
    setToken("test-token");
    vi.stubGlobal("fetch", routeFetch(routes()));
    renderWithProviders(
      <AiPanel ticketId={TICKET_ID} pendingSuggestions={0} blocked={false} />,
    );

    // When: the provider picker renders
    const select = await screen.findByLabelText("AI provider");
    await screen.findByRole("option", { name: "OPENAI" });

    // Then: Auto is the default and only keyed AI providers are options
    expect((select as HTMLSelectElement).value).toBe("AUTO");
    const names = within(select)
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(names).toEqual(["Auto (first configured)", "OPENAI", "ANTHROPIC"]);
  });

  it("placeholder shows the configured model default, or 'default' on Auto", async () => {
    setToken("test-token");
    vi.stubGlobal("fetch", routeFetch(routes()));
    renderWithProviders(
      <AiPanel ticketId={TICKET_ID} pendingSuggestions={0} blocked={false} />,
    );

    expect(await screen.findByPlaceholderText("default")).toBeTruthy();

    await screen.findByRole("option", { name: "OPENAI" });
    fireEvent.change(screen.getByLabelText("AI provider"), { target: { value: "OPENAI" } });
    expect(screen.getByPlaceholderText("gpt-5")).toBeTruthy();
  });

  it("sends the chosen provider and model with both AI calls", async () => {
    setToken("test-token");
    const fetchMock = routeFetch(routes());
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(
      <AiPanel ticketId={TICKET_ID} pendingSuggestions={0} blocked={false} />,
    );

    const select = await screen.findByLabelText("AI provider");
    await screen.findByRole("option", { name: "OPENAI" });
    fireEvent.change(select, { target: { value: "OPENAI" } });
    fireEvent.change(screen.getByLabelText("AI model (optional)"), {
      target: { value: "gpt-4o" },
    });

    fireEvent.click(screen.getByRole("button", { name: "AI fill (strict)" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/tickets/${TICKET_ID}/ai/fill`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ provider: "OPENAI", model: "gpt-4o" }),
        }),
      ),
    );

    fireEvent.click(await screen.findByRole("button", { name: "AI enrich" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/tickets/${TICKET_ID}/ai/enrich`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ provider: "OPENAI", model: "gpt-4o" }),
        }),
      ),
    );
  });

  it("sends an empty body on the Auto default", async () => {
    setToken("test-token");
    const fetchMock = routeFetch(routes());
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(
      <AiPanel ticketId={TICKET_ID} pendingSuggestions={0} blocked={false} />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "AI fill (strict)" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/tickets/${TICKET_ID}/ai/fill`,
        expect.objectContaining({ method: "POST", body: JSON.stringify({}) }),
      ),
    );
  });

  it("surfaces a 502 provider failure inline and re-enables the buttons", async () => {
    // Given: the AI provider is unreachable (502 envelope)
    setToken("test-token");
    vi.stubGlobal(
      "fetch",
      routeFetch([
        {
          match: (url, method) =>
            method === "GET" && url.startsWith(`/api/tickets/${TICKET_ID}/suggestions`),
          respond: () => jsonResponse(paginated([])),
        },
        availableResponder(),
        {
          match: (url, method) => method === "POST" && url.endsWith("/ai/fill"),
          respond: () =>
            jsonResponse(
              { error: { code: "AI_PROVIDER_UNREACHABLE", message: "AI provider unreachable" } },
              502,
            ),
        },
      ]),
    );
    renderWithProviders(
      <AiPanel ticketId={TICKET_ID} pendingSuggestions={0} blocked={false} />,
    );

    // When: AI fill is clicked and fails
    fireEvent.click(await screen.findByRole("button", { name: "AI fill (strict)" }));

    // Then: an inline alert carries the failure and the buttons unlock
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("AI provider unreachable");
    expect(
      (screen.getByRole("button", { name: "AI fill (strict)" }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(
      (screen.getByRole("button", { name: "AI enrich" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("shows when + provider + model under each suggestion", async () => {
    // Given: a suggestion created at 08:00Z with ANTHROPIC provenance
    setToken("test-token");
    vi.stubGlobal(
      "fetch",
      routeFetch([
        {
          match: (url, method) =>
            method === "GET" && url.startsWith(`/api/tickets/${TICKET_ID}/suggestions`),
          respond: () =>
            jsonResponse(
              paginated([suggestionFixture({ provider: "ANTHROPIC", model: "claude-x" })]),
            ),
        },
        availableResponder(),
      ]),
    );
    renderWithProviders(
      <AiPanel ticketId={TICKET_ID} pendingSuggestions={0} blocked={false} />,
    );

    // Then: the meta line reads WIB time · provider · model
    expect(
      await screen.findByText("2026-09-14 15:00 WIB · ANTHROPIC · claude-x"),
    ).toBeTruthy();
  });

  it("falls back to Auto and drops the model when provenance is missing", async () => {
    setToken("test-token");
    vi.stubGlobal(
      "fetch",
      routeFetch([
        {
          match: (url, method) =>
            method === "GET" && url.startsWith(`/api/tickets/${TICKET_ID}/suggestions`),
          respond: () =>
            jsonResponse(paginated([suggestionFixture({ provider: null, model: null })])),
        },
        availableResponder(),
      ]),
    );
    renderWithProviders(
      <AiPanel ticketId={TICKET_ID} pendingSuggestions={0} blocked={false} />,
    );

    expect(await screen.findByText("2026-09-14 15:00 WIB · Auto")).toBeTruthy();
  });

  it("opens a help modal explaining Fill vs Enrich with examples", async () => {
    setToken("test-token");
    vi.stubGlobal("fetch", routeFetch(routes()));
    renderWithProviders(
      <AiPanel ticketId={TICKET_ID} pendingSuggestions={0} blocked={false} />,
    );

    // When: the help button is clicked
    fireEvent.click(screen.getByRole("button", { name: "How Fill & Enrich work" }));

    // Then: the modal explains both flows with a concrete example
    const dialog = await screen.findByRole("dialog", { name: "How Fill & Enrich work" });
    const text = dialog.textContent ?? "";
    expect(text).toContain("only from this ticket's materials");
    expect(text).toContain("never invents facts");
    expect(text).toContain("only empty fields");
    expect(text).toContain("CVE-2024-1234");
    expect(text).toContain("X 1.2");
    expect(text).toContain("researches extra context");
    expect(text).toContain("PENDING");
    expect(text).toContain("Accept/Edit/Reject");
    expect(text).toContain("no manual copy");
    expect(text).toContain("rejected");
    expect(text).toContain("blocked");

    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
