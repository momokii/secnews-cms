import { describe, expect, it } from "vitest";
import {
  DEFAULT_BULLETIN_TEMPLATE,
  defangIoc,
  renderBulletin,
  type BulletinInput,
} from "../src/lib/bulletin/render.js";

/** BUL-01 placeholders + optional-section dropping, BUL-02 defang map +
 * includeInBulletin exclusion (docs/STATES.md §3). Pure-function suite. */

function input(overrides: Partial<BulletinInput> = {}): BulletinInput {
  return {
    title: "SSH brute force campaign",
    overview: "Overview text",
    description: "Description text",
    recommendations: "Rotate credentials",
    references: ["https://example.com/advisory"],
    iocs: [],
    ...overrides,
  };
}

describe("bulletin renderer (BUL-01)", () => {
  it("BUL-01: fills every placeholder from ticket fields and IOCs", () => {
    // Given: a template using all six placeholders and a fully filled ticket
    const template = [
      "Title: {{title}}",
      "Overview: {{overview}}",
      "Description: {{description}}",
      "IOCs:",
      "{{ioc_block}}",
      "Recommendations: {{recommendations}}",
      "References:",
      "{{references}}",
    ].join("\n");
    const data = input({
      iocs: [{ type: "DOMAIN", value: "evil.com", includeInBulletin: true }],
    });

    // When: the bulletin is rendered
    const rendered = renderBulletin(template, data);

    // Then: every placeholder carries its value
    expect(rendered).toContain("Title: SSH brute force campaign");
    expect(rendered).toContain("Overview: Overview text");
    expect(rendered).toContain("Description: Description text");
    expect(rendered).toContain("- DOMAIN: evil[.]com");
    expect(rendered).toContain("Recommendations: Rotate credentials");
    expect(rendered).toContain("https://example.com/advisory");
  });

  it("BUL-01: drops lines of unfilled optional sections instead of fabricating them", () => {
    // Given: a template whose optional sections map to null/empty values
    const template = [
      "Title: {{title}}",
      "Overview: {{overview}}",
      "Description: {{description}}",
      "Recommendations: {{recommendations}}",
      "References:",
      "{{references}}",
    ].join("\n");
    const data = input({
      overview: null,
      description: null,
      recommendations: null,
      references: [],
    });

    // When: the bulletin is rendered
    const rendered = renderBulletin(template, data);

    // Then: only the title line survives; no placeholder echoes or nulls
    expect(rendered).toBe("Title: SSH brute force campaign");
    expect(rendered).not.toContain("{{");
    expect(rendered).not.toContain("null");
    expect(rendered).not.toContain("undefined");
  });

  it("BUL-01: the default template renders a usable bulletin body", () => {
    // Given: the built-in default template and a minimal ticket
    const data = input({
      iocs: [{ type: "IPV4", value: "1.2.3.4", includeInBulletin: true }],
    });

    // When: the default template is rendered
    const rendered = renderBulletin(DEFAULT_BULLETIN_TEMPLATE, data);

    // Then: title and defanged IOC appear
    expect(rendered).toContain("SSH brute force campaign");
    expect(rendered).toContain("1.2.3[.]4");
  });
});

describe("bulletin defang map (BUL-02)", () => {
  it("BUL-02: defangs DOMAIN, IPV4, IPV6, URL and EMAIL per the STATES map", () => {
    // Given: one IOC per defangable type
    // When: each is defanged
    // Then: separators are bracketed / schemes rewritten exactly as documented
    expect(defangIoc("DOMAIN", "evil.com")).toBe("evil[.]com");
    expect(defangIoc("IPV4", "1.2.3.4")).toBe("1.2.3[.]4");
    expect(defangIoc("IPV6", "2001:db8::1")).toBe("2001:db8:[:]1");
    expect(defangIoc("URL", "https://evil.com/payload")).toBe("hxxps://evil[.]com/payload");
    expect(defangIoc("URL", "http://evil.com/payload")).toBe("hxxp://evil[.]com/payload");
    expect(defangIoc("EMAIL", "user@evil.com")).toBe("user(at)evil[.]com");
  });

  it("BUL-02: emits hashes, filepaths, mutexes, CIDR and OTHER verbatim", () => {
    // Given: one IOC per verbatim type
    // When: each is defanged
    // Then: the value passes through unchanged
    expect(defangIoc("MD5", "d41d.8cd9")).toBe("d41d.8cd9");
    expect(defangIoc("SHA1", "a9993e364706816aba3e25717850c26c9cd0d89d")).toBe(
      "a9993e364706816aba3e25717850c26c9cd0d89d",
    );
    expect(defangIoc("SHA256", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(defangIoc("FILEPATH", "C:\\Windows\\temp\\evil.dll")).toBe("C:\\Windows\\temp\\evil.dll");
    expect(defangIoc("MUTEX", "Global\\evil")).toBe("Global\\evil");
    expect(defangIoc("CIDR", "10.0.0.0/8")).toBe("10.0.0.0/8");
    expect(defangIoc("OTHER", "anything.at.all")).toBe("anything.at.all");
  });

  it("BUL-02: excludes IOCs flagged includeInBulletin=false from the ioc_block", () => {
    // Given: an IOC set where one member opted out of the bulletin
    const data = input({
      iocs: [
        { type: "DOMAIN", value: "included.example", includeInBulletin: true },
        { type: "DOMAIN", value: "excluded.example", includeInBulletin: false },
      ],
    });

    // When: the ioc_block is rendered
    const rendered = renderBulletin(DEFAULT_BULLETIN_TEMPLATE, data);

    // Then: only the opted-in IOC appears
    expect(rendered).toContain("included[.]example");
    expect(rendered).not.toContain("excluded.example");
    expect(rendered).not.toContain("excluded[.]example");
  });
});
