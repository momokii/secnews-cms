import type { IocType } from "../../generated/prisma/enums.js";

/**
 * Bulletin rendering (pure): placeholder substitution + IOC defanging per
 * docs/STATES.md §3. Placeholders (bulletin/schema.ts): {{title}}
 * {{overview}} {{description}} {{ioc_block}} {{recommendations}}
 * {{references}}. Missing required final fields are reported before render
 * (PREV-02); an unfilled optional section line is dropped, never fabricated.
 */

export const DEFAULT_TEMPLATE = [
  "Security Bulletin: {{title}}",
  "",
  "Overview:",
  "{{overview}}",
  "",
  "Description:",
  "{{description}}",
  "",
  "Indicators of Compromise:",
  "{{ioc_block}}",
  "",
  "Recommendations:",
  "{{recommendations}}",
  "",
  "References:",
  "{{references}}",
].join("\n");

/** The org-wide template row is pinned to name "default". */
export const DEFAULT_TEMPLATE_NAME = "default";

/** Final fields a client-facing bulletin cannot ship without (PREV-02). */
export const REQUIRED_PREVIEW_FIELDS = ["overview", "description", "recommendations", "references"] as const;
export type RequiredPreviewField = (typeof REQUIRED_PREVIEW_FIELDS)[number];

export type BulletinIoc = {
  type: IocType;
  value: string;
};

export type BulletinData = {
  title: string;
  overview: string | null;
  description: string | null;
  recommendations: string | null;
  references: string[];
  iocs: BulletinIoc[];
};

function nonBlank(value: string | null): string {
  if (value === null || value.trim() === "") {
    return "";
  }
  return value;
}

/** Defang one IOC value by type (STATES.md §3 map). Verbatim types pass through. */
export function defangIoc(type: IocType, value: string): string {
  switch (type) {
    case "DOMAIN":
    case "IPV4":
      return value.replaceAll(".", "[.]");
    case "IPV6":
      return value.replaceAll(":", "[:]");
    case "URL":
      return value
        .replace(/^http:\/\//, "hxxp://")
        .replace(/^https:\/\//, "hxxps://")
        .replaceAll(".", "[.]");
    case "EMAIL":
      return value.replaceAll("@", "(at)").replaceAll(".", "[.]");
    case "MD5":
    case "SHA1":
    case "SHA256":
    case "FILEPATH":
    case "MUTEX":
    case "CIDR":
    case "OTHER":
      return value;
    default: {
      const unreachable: never = type;
      return unreachable;
    }
  }
}

/** Final fields with no usable content yet — the PREV-02 report payload. */
export function missingPreviewFields(data: BulletinData): RequiredPreviewField[] {
  const empty: Record<RequiredPreviewField, string> = {
    overview: nonBlank(data.overview),
    description: nonBlank(data.description),
    recommendations: nonBlank(data.recommendations),
    references: data.references.length > 0 ? "present" : "",
  };
  return REQUIRED_PREVIEW_FIELDS.filter((field) => empty[field] === "");
}

/** Render the template: substitute placeholders, drop lines whose only
 * content is an unfilled placeholder, collapse the resulting blank runs. */
export function renderBulletin(template: string, data: BulletinData): string {
  const iocBlock = data.iocs.map((ioc) => `- ${ioc.type} ${defangIoc(ioc.type, ioc.value)}`).join("\n");
  const values: Record<string, string> = {
    title: data.title,
    overview: nonBlank(data.overview),
    description: nonBlank(data.description),
    recommendations: nonBlank(data.recommendations),
    references: data.references.join("\n"),
    ioc_block: iocBlock,
  };

  let out = template;
  for (const [key, value] of Object.entries(values)) {
    const token = `{{${key}}}`;
    if (value === "") {
      out = out
        .split("\n")
        .filter((line) => line.trim() !== token)
        .join("\n")
        .replaceAll(token, "");
    } else {
      out = out.replaceAll(token, value);
    }
  }
  return out.replace(/\n{3,}/g, "\n\n").trim();
}
