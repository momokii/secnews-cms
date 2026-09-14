import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Pagination } from "./Pagination";

function renderFooter(overrides: Partial<Parameters<typeof Pagination>[0]> = {}): void {
  render(
    <Pagination
      page={1}
      pageSize={20}
      total={45}
      itemLabel="items"
      onPageChange={vi.fn()}
      onPageSizeChange={vi.fn()}
      {...overrides}
    />,
  );
}

describe("Pagination", () => {
  it("shows the page position, total, and all four page-size options", () => {
    renderFooter();
    expect(screen.getByText("Page 1 of 3 — 45 items")).toBeTruthy();
    const select = screen.getByLabelText("Items per page") as HTMLSelectElement;
    expect(
      Array.from(select.options).map((option) => option.value),
    ).toEqual(["10", "20", "50", "100"]);
    expect(select.value).toBe("20");
  });

  it("reports page-size changes as a number", () => {
    const onPageSizeChange = vi.fn();
    renderFooter({ onPageSizeChange });
    fireEvent.change(screen.getByLabelText("Items per page"), {
      target: { value: "50" },
    });
    expect(onPageSizeChange).toHaveBeenCalledWith(50);
  });

  it("clamps Previous at page 1 and disables Next on the last page", () => {
    const onPageChange = vi.fn();
    renderFooter({ page: 3, total: 45, onPageChange });
    expect(screen.getByRole("button", { name: "Previous" }).hasAttribute("disabled")).toBe(
      false,
    );
    const next = screen.getByRole("button", { name: "Next" });
    expect(next.hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("disables every control while disabled", () => {
    renderFooter({ disabled: true });
    expect(screen.getByRole("button", { name: "Previous" }).hasAttribute("disabled")).toBe(
      true,
    );
    expect(screen.getByRole("button", { name: "Next" }).hasAttribute("disabled")).toBe(true);
    expect(
      (screen.getByLabelText("Items per page") as HTMLSelectElement).hasAttribute("disabled"),
    ).toBe(true);
  });
});
