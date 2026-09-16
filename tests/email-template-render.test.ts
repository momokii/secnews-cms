import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  renderEmailTemplate,
  type EmailTemplateTicket,
} from "../src/modules/email-template/render.js";

/** Pure rendering contract for the HTML email template: escaping before
 * substitution (XSS), defanged IOC block, unknown tokens stay literal. */

const HTML_TEMPLATE = `<p>Hello {{title}} &lt;tag&gt;</p><p>{{overview}}</p><p>{{description}}</p><p>{{recommendations}}</p><pre>{{iocs}}</pre><p>{{references}}</p><p>{{unknown}}</p>`;

function ticketFixture(): EmailTemplateTicket {
  return {
    title: 'Evil <script>',
    findingType: "THREAT_CAMPAIGN",
    tlp: "AMBER",
    overview: "Adversaries target\nthe sector.",
    description: "Details & narrative",
    recommendations: "Patch now",
    references: ["https://example.com/a", "https://example.com/b"],
    iocs: [
      { type: "DOMAIN", value: "evil.com", includeInBulletin: true },
      { type: "MD5", value: "deadbeef", includeInBulletin: false },
    ],
  };
}

describe("renderEmailTemplate (pure rendering)", () => {
  it("escapes ticket values before they enter the HTML and defangs the IOC block", () => {
    // Given: a template carrying every supported placeholder
    const template = {
      subject: "Bulletin: {{title}} TLP:{{tlp}} {{findingType}}",
      htmlBody: HTML_TEMPLATE,
    };

    // When: it is rendered for the fixture ticket
    const rendered = renderEmailTemplate(template, ticketFixture());

    // Then: values are escaped, multi-lines become <br />, references join
    // with <br />, excluded IOCs are dropped, unknown stays literal
    expect(rendered.html).toContain("Evil &lt;script&gt;");
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).toContain("Adversaries target<br />the sector.");
    expect(rendered.html).toContain("Details &amp; narrative");
    expect(rendered.html).toContain("- DOMAIN evil[.]com");
    expect(rendered.html).not.toContain("deadbeef");
    expect(rendered.html).toContain(
      "https://example.com/a<br />https://example.com/b",
    );
    // Subject is a plain-text header — substituted raw, never HTML-escaped
    expect(rendered.subject).toBe("Bulletin: Evil <script> TLP:AMBER THREAT_CAMPAIGN");
  });

  it("leaves unknown placeholders literal and substitutes empty strings for missing optional fields", () => {
    // Given: a template with an unsupported token and a ticket with no optionals
    const rendered = renderEmailTemplate(
      { subject: "s", htmlBody: "<p>{{title}}</p><p>{{overview}}</p><p>{{nope}}</p>" },
      { ...ticketFixture(), overview: null, description: null, recommendations: null, references: [] },
    );

    // Then: {{nope}} survives verbatim; the empty optional collapses to ""
    expect(rendered.html).toContain("{{nope}}");
    expect(rendered.html).toContain("<p></p>");
    expect(rendered.html).not.toContain("null");
  });

  it("escapeHtml covers the five dangerous characters", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });
});
