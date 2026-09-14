import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setToken } from "../../lib/tokenStore";
import { jsonResponse, TICKET_ID } from "./testUtils";
import { DeliveryActions } from "./DeliveryActions";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

function renderActions(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DeliveryActions
          ticketId={TICKET_ID}
          status="READY"
          blocked={false}
          onBlocked={vi.fn()}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("TASK-UIC: OTX push pending state", () => {
  it("shows Pushing… with a disabled button while the push is in flight, then the success feedback", async () => {
    setToken("test-token");
    let resolvePush!: (response: Response) => void;
    const pushPromise = new Promise<Response>((resolve) => {
      resolvePush = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === "POST" && url === `/api/tickets/${TICKET_ID}/otx`) {
          return pushPromise;
        }
        throw new Error(`Unexpected fetch: ${init?.method ?? "GET"} ${url}`);
      }),
    );
    renderActions();

    const push = screen.getByRole("button", { name: "Push to OTX" });
    fireEvent.click(push);

    const pending = (await screen.findByRole("button", {
      name: "Pushing…",
    })) as HTMLButtonElement;
    expect(pending.disabled).toBe(true);

    resolvePush(
      jsonResponse({
        pulseId: "9f8e7d6c-5555-4555-8555-555555555555",
        pulseUrl: "https://otx.example/pulses/9f8e7d6c",
        isPublic: false,
        tlpMarking: "AMBER",
      }),
    );

    expect(await screen.findByRole("status")).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Push to OTX" }).textContent).toBe("Push to OTX"),
    );
  });

  it("returns to Push to OTX with the error feedback when the push fails", async () => {
    setToken("test-token");
    let rejectPush!: (error: unknown) => void;
    const pushPromise = new Promise<Response>((_resolve, reject) => {
      rejectPush = reject;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === "POST" && url === `/api/tickets/${TICKET_ID}/otx`) {
          return pushPromise;
        }
        throw new Error(`Unexpected fetch: ${init?.method ?? "GET"} ${url}`);
      }),
    );
    renderActions();

    fireEvent.click(screen.getByRole("button", { name: "Push to OTX" }));
    expect(await screen.findByRole("button", { name: "Pushing…" })).toBeTruthy();

    rejectPush(new Error("OTX unreachable"));

    expect(await screen.findByRole("alert")).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Push to OTX" }).textContent).toBe("Push to OTX"),
    );
  });
});
