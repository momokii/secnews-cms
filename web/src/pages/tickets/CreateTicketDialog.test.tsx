import { fireEvent, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setToken } from "../../lib/tokenStore";
import { TICKET_ID, jsonResponse, routeFetch } from "./testUtils";
import { CreateTicketDialog } from "./CreateTicketDialog";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

function renderDialogWithRoutes(onClose: () => void): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/tickets"]}>
        <Routes>
          <Route path="/tickets" element={<CreateTicketDialog onClose={onClose} />} />
          <Route path="/tickets/:id" element={<p>ticket detail</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("FE-TKT-CREATE: create-ticket dialog", () => {
  it("POSTs title, findingType and summary to /tickets, then navigates to the detail", async () => {
    // Given: an authenticated analyst and a dialog with the manual shape filled in
    setToken("test-token");
    const onClose = vi.fn();
    const fetchMock = routeFetch([
      {
        match: (url, method) => method === "POST" && url === "/api/tickets",
        respond: () => jsonResponse({ id: TICKET_ID }, 201),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    renderDialogWithRoutes(onClose);

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Suspicious login portal" },
    });
    fireEvent.change(screen.getByLabelText("Finding type"), {
      target: { value: "THREAT_CAMPAIGN" },
    });
    fireEvent.change(screen.getByLabelText("Summary"), {
      target: { value: "Analyst working summary" },
    });

    // When: Create is clicked
    fireEvent.click(screen.getByRole("button", { name: "Create ticket" }));

    // Then: the manual create shape goes to POST /tickets and the app lands on the detail
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tickets",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      title: "Suspicious login portal",
      findingType: "THREAT_CAMPAIGN",
      summary: "Analyst working summary",
    });
    expect(await screen.findByText("ticket detail")).toBeTruthy();
    expect(onClose).toHaveBeenCalled();
  });

  it("omits the summary from the POST body when left blank", async () => {
    // Given: a dialog with only title + finding type filled in
    setToken("test-token");
    const onClose = vi.fn();
    const fetchMock = routeFetch([
      {
        match: (url, method) => method === "POST" && url === "/api/tickets",
        respond: () => jsonResponse({ id: TICKET_ID }, 201),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    renderDialogWithRoutes(onClose);

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Bare ticket" },
    });

    // When: Create is clicked
    fireEvent.click(screen.getByRole("button", { name: "Create ticket" }));

    // Then: the body carries exactly { title, findingType } — no empty summary
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      title: "Bare ticket",
      findingType: "OTHER",
    });
  });

  it("keeps Create disabled until a title is entered", () => {
    // Given: a fresh dialog
    setToken("test-token");
    vi.stubGlobal("fetch", routeFetch([]));
    renderDialogWithRoutes(vi.fn());

    // Then: the create action is unavailable without a title
    expect(
      (screen.getByRole("button", { name: "Create ticket" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
