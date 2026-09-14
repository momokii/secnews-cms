import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IOC_TYPES } from "../../lib/ticketsApi";
import { setToken } from "../../lib/tokenStore";
import {
  TICKET_ID,
  iocFixture,
  jsonResponse,
  renderWithProviders,
  routeFetch,
} from "./testUtils";
import { IocTable } from "./IocTable";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("FE-IOC-01: IOC table", () => {
  it("offers all 12 IOC types in the add-row select", () => {
    setToken("test-token");
    vi.stubGlobal("fetch", routeFetch([]));
    renderWithProviders(<IocTable ticketId={TICKET_ID} iocs={[]} />);
    const select = screen.getByLabelText("IOC type") as HTMLSelectElement;
    const options = Array.from(select.options).map((option) => option.value);
    expect(options).toEqual([...IOC_TYPES]);
  });

  it("renders existing IOCs with type, value and bulletin checkbox", () => {
    setToken("test-token");
    vi.stubGlobal("fetch", routeFetch([]));
    renderWithProviders(
      <IocTable ticketId={TICKET_ID} iocs={[iocFixture()]} />,
    );
    expect(screen.getByRole("cell", { name: "DOMAIN" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "evil.example" })).toBeTruthy();
    const checkbox = screen.getByLabelText(
      "Include evil.example in bulletin",
    ) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it("POSTs the new IOC with type, value and includeInBulletin", async () => {
    setToken("test-token");
    const fetchMock = routeFetch([
      {
        match: (url, method) =>
          method === "POST" && url === `/api/tickets/${TICKET_ID}/iocs`,
        respond: () => jsonResponse(iocFixture(), 201),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(<IocTable ticketId={TICKET_ID} iocs={[]} />);

    fireEvent.change(screen.getByLabelText("IOC type"), {
      target: { value: "URL" },
    });
    fireEvent.change(screen.getByLabelText("IOC value"), {
      target: { value: "https://evil.example/payload" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add IOC" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/tickets/${TICKET_ID}/iocs`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            type: "URL",
            value: "https://evil.example/payload",
            includeInBulletin: true,
          }),
        }),
      ),
    );
  });

  it("PATCHes includeInBulletin when a row checkbox is toggled", async () => {
    setToken("test-token");
    const ioc = iocFixture({ id: "66666666-6666-4666-8666-666666666666" });
    const fetchMock = routeFetch([
      {
        match: (url, method) =>
          method === "PATCH" &&
          url === `/api/tickets/${TICKET_ID}/iocs/${ioc.id}`,
        respond: () => jsonResponse(iocFixture({ includeInBulletin: false })),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(<IocTable ticketId={TICKET_ID} iocs={[ioc]} />);

    fireEvent.click(screen.getByLabelText("Include evil.example in bulletin"));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/tickets/${TICKET_ID}/iocs/${ioc.id}`,
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ includeInBulletin: false }),
        }),
      ),
    );
  });

  it("DELETEs an IOC when its delete button is clicked", async () => {
    setToken("test-token");
    const ioc = iocFixture();
    const fetchMock = routeFetch([
      {
        match: (url, method) =>
          method === "DELETE" && url === `/api/tickets/${TICKET_ID}/iocs/${ioc.id}`,
        respond: () => new Response(null, { status: 204 }),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(<IocTable ticketId={TICKET_ID} iocs={[ioc]} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete evil.example" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/tickets/${TICKET_ID}/iocs/${ioc.id}`,
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
  });
});
