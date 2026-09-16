import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setToken } from "../../lib/tokenStore";
import {
  TICKET_ID,
  jsonResponse,
  renderWithProviders,
  routeFetch,
  ticketDetailFixture,
} from "./testUtils";
import { FinalFieldsForm } from "./FinalFieldsForm";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("FE-FLD-01: final-fields form", () => {
  it("prefills from the ticket", () => {
    setToken("test-token");
    vi.stubGlobal("fetch", routeFetch([]));
    renderWithProviders(
      <FinalFieldsForm
        ticket={ticketDetailFixture({
          overview: "Existing overview",
          tlp: "GREEN",
          references: ["https://openssl.org/advisory"],
        })}
      />,
    );
    expect(
      (screen.getByLabelText("Overview") as HTMLTextAreaElement).value,
    ).toBe("Existing overview");
    expect((screen.getByLabelText("TLP") as HTMLSelectElement).value).toBe("GREEN");
    expect(
      (screen.getByLabelText("References (one per line)") as HTMLTextAreaElement)
        .value,
    ).toBe("https://openssl.org/advisory");
  });

  it("PATCHes edited fields to /tickets/:id/fields", async () => {
    setToken("test-token");
    const fetchMock = routeFetch([
      {
        match: (url, method) =>
          method === "PATCH" && url === `/api/tickets/${TICKET_ID}/fields`,
        respond: () => jsonResponse(ticketDetailFixture()),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(
      <FinalFieldsForm ticket={ticketDetailFixture()} />,
    );

    fireEvent.change(screen.getByLabelText("Overview"), {
      target: { value: "New overview" },
    });
    fireEvent.change(screen.getByLabelText("TLP"), {
      target: { value: "AMBER" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save fields" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/tickets/${TICKET_ID}/fields`,
        expect.objectContaining({
          method: "PATCH",
        }),
      ),
    );
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    ) as Record<string, unknown>;
    expect(body.overview).toBe("New overview");
    expect(body.tlp).toBe("AMBER");
  });

  it("turns the references textarea lines into a url array", async () => {
    setToken("test-token");
    const fetchMock = routeFetch([
      {
        match: (url, method) =>
          method === "PATCH" && url === `/api/tickets/${TICKET_ID}/fields`,
        respond: () => jsonResponse(ticketDetailFixture()),
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(
      <FinalFieldsForm ticket={ticketDetailFixture()} />,
    );

    fireEvent.change(screen.getByLabelText("References (one per line)"), {
      target: { value: "https://a.example\n\nhttps://b.example\n" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save fields" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    ) as { references: string[] };
    expect(body.references).toEqual(["https://a.example", "https://b.example"]);
  });

  it("shows a saved confirmation after a successful PATCH", async () => {
    setToken("test-token");
    vi.stubGlobal(
      "fetch",
      routeFetch([
        {
          match: (url, method) =>
            method === "PATCH" && url === `/api/tickets/${TICKET_ID}/fields`,
          respond: () => jsonResponse(ticketDetailFixture()),
        },
      ]),
    );
    renderWithProviders(
      <FinalFieldsForm ticket={ticketDetailFixture()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save fields" }));

    expect(await screen.findByText("Saved.")).toBeTruthy();
  });
});

describe("TASK-UXT: taller final-field editors", () => {
  it("starts Overview, Description and Recommendations tall but resizable", () => {
    // Given: the final-fields form renders with empty ticket fields
    setToken("test-token");
    vi.stubGlobal("fetch", routeFetch([]));
    renderWithProviders(<FinalFieldsForm ticket={ticketDetailFixture()} />);

    // When: the long-form textareas render
    const overview = screen.getByLabelText("Overview") as HTMLTextAreaElement;
    const description = screen.getByLabelText("Description") as HTMLTextAreaElement;
    const recommendations = screen.getByLabelText(
      "Recommendations",
    ) as HTMLTextAreaElement;

    // Then: rows are 8/12/8 and every editor is vertically resizable
    expect(overview.rows).toBe(8);
    expect(description.rows).toBe(12);
    expect(recommendations.rows).toBe(8);
    expect(overview.className).toContain("resize-y");
    expect(description.className).toContain("resize-y");
    expect(recommendations.className).toContain("resize-y");
  });
});
