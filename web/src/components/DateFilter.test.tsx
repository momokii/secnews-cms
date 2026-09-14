import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DateFilter } from "./DateFilter";

const ACTIVE_RANGE = {
  from: "2026-09-13T17:00:00.000Z",
  to: "2026-09-14T16:59:59.999Z",
};

describe("DateFilter danger styling", () => {
  it("renders the Clear button with red danger classes when a range is active", () => {
    // Given: a from/to range is applied
    render(<DateFilter value={ACTIVE_RANGE} onChange={vi.fn()} />);

    // Then: Clear carries the red-600 border/text and red-50 hover tokens
    const clear = screen.getByRole("button", { name: "Clear" });
    expect(clear.className).toContain("border-red-600");
    expect(clear.className).toContain("text-red-600");
    expect(clear.className).toContain("hover:bg-red-50");
  });

  it("hides Clear when no range is set", () => {
    // Given: the filter is empty
    render(<DateFilter value={{}} onChange={vi.fn()} />);

    // Then: there is nothing to clear
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
  });
});

describe("DateFilter custom inputs", () => {
  it("adorns the From and To date inputs with a calendar icon", () => {
    // Given: the custom range row is open
    render(<DateFilter value={{}} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));

    // Then: each native date input sits in a label whose label row carries an
    // aria-hidden calendar SVG
    for (const inputLabel of ["From date", "To date"]) {
      const input = screen.getByLabelText(inputLabel);
      const label = input.closest("label");
      expect(label).not.toBeNull();
      const icon = label?.querySelector("svg[aria-hidden='true']");
      expect(icon).not.toBeNull();
    }
  });

  it("keeps the native date picker and still emits range bounds", () => {
    // Given: the custom range row is open
    const onChange = vi.fn();
    render(<DateFilter value={{}} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));

    // When: a from date is typed into the native input
    fireEvent.change(screen.getByLabelText("From date"), {
      target: { value: "2026-09-01" },
    });

    // Then: the input stays type=date and the jakarta day bounds are emitted
    expect(screen.getByLabelText("From date").getAttribute("type")).toBe("date");
    expect(onChange).toHaveBeenCalledWith({
      from: "2026-08-31T17:00:00.000Z",
    });
  });
});
