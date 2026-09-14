import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TicketStatus } from "../../lib/ticketsApi";
import { TransitionActionBar } from "./TransitionActionBar";

describe("FE-TRN-01: action bar renders only legal, role-permitted transitions", () => {
  it("offers Start research + Close ticket to an EDITOR on OPEN", () => {
    render(
      <TransitionActionBar status="OPEN" role="EDITOR" onTransition={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Start research" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close ticket" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mark ready" })).toBeNull();
  });

  it("hides all buttons for an ANALYST on READY (send/close are MGR-only)", () => {
    render(
      <TransitionActionBar status="READY" role="ANALYST" onTransition={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: "Mark sent" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Close ticket" })).toBeNull();
  });

  it("offers Mark sent + Close ticket to an EDITOR on READY", () => {
    render(
      <TransitionActionBar status="READY" role="EDITOR" onTransition={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Mark sent" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close ticket" })).toBeTruthy();
  });

  it("renders nothing on the terminal CLOSED state", () => {
    const { container } = render(
      <TransitionActionBar status="CLOSED" role="ADMIN" onTransition={vi.fn()} />,
    );
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });

  it("renders nothing without a known role", () => {
    const { container } = render(
      <TransitionActionBar status="OPEN" role={null} onTransition={vi.fn()} />,
    );
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });

  it("emits the target status when a button is clicked", () => {
    const onTransition = vi.fn();
    render(
      <TransitionActionBar
        status={"READY" satisfies TicketStatus}
        role="ADMIN"
        onTransition={onTransition}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Mark sent" }));
    expect(onTransition).toHaveBeenCalledWith("SENT");
  });

  it("disables buttons while a transition request is pending", () => {
    render(
      <TransitionActionBar
        status="OPEN"
        role="EDITOR"
        onTransition={vi.fn()}
        pending
      />,
    );
    const button = screen.getByRole("button", { name: "Start research" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });
});
