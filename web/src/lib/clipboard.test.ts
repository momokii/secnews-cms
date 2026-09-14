import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "./clipboard";

/** jsdom has no navigator.clipboard and no document.execCommand; tests install
 * mocks on the instances and delete them afterwards. */
function installClipboard(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(window.navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
}

function installExecCommand(impl: () => boolean): void {
  Object.defineProperty(document, "execCommand", {
    value: vi.fn(impl),
    configurable: true,
  });
}

function installedExecCommand(): ReturnType<typeof vi.fn> {
  return document.execCommand as unknown as ReturnType<typeof vi.fn>;
}

afterEach(() => {
  Reflect.deleteProperty(window.navigator, "clipboard");
  Reflect.deleteProperty(document, "execCommand");
  vi.restoreAllMocks();
});

describe("copyText", () => {
  it("writes the exact string via navigator.clipboard when available", async () => {
    // Given: a working async clipboard
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    installClipboard(writeText);
    const body = "# Title\n\nhxxp://203[.]0[.]113[.]7\n\ndone";

    // When: the text is copied
    const ok = await copyText(body);

    // Then: the clipboard receives the raw string, newlines intact
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith(body);
  });

  it("falls back to a textarea execCommand copy when clipboard is unavailable", async () => {
    // Given: no navigator.clipboard and a working execCommand
    installExecCommand(() => true);

    // When: the text is copied
    const ok = await copyText("line one\nline two");

    // Then: the execCommand path reports success
    expect(ok).toBe(true);
    expect(installedExecCommand()).toHaveBeenCalledWith("copy");
  });

  it("falls back to execCommand when the async clipboard write rejects", async () => {
    // Given: a clipboard whose writeText rejects
    const writeText = vi.fn<(text: string) => Promise<void>>().mockRejectedValue(new Error("denied"));
    installClipboard(writeText);
    installExecCommand(() => true);

    // When: the text is copied
    const ok = await copyText("fallback\nplease");

    // Then: the fallback still succeeds
    expect(ok).toBe(true);
    expect(installedExecCommand()).toHaveBeenCalledWith("copy");
  });

  it("returns false when every strategy fails", async () => {
    // Given: no clipboard and an execCommand that reports failure
    installExecCommand(() => false);

    // When: the text is copied
    const ok = await copyText("anything");

    // Then: the failure is reported instead of pretending success
    expect(ok).toBe(false);
  });
});
