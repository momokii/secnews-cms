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
  includeInBulletin: boolean;
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

/** "- TYPE defanged-value" lines for the included IOCs, in input order. */
function renderIocBlock(iocs: BulletinIoc[]): string {
  return iocs
    .filter((ioc) => ioc.includeInBulletin)
    .map((ioc) => `- ${ioc.type} ${defangIoc(ioc.type, ioc.value)}`)
    .join("\n");
}

type SectionValues = Record<
  "title" | "overview" | "description" | "ioc_block" | "recommendations" | "references",
  string
>;

function sectionValues(data: BulletinData): SectionValues {
  const references = data.references.join("\n");
  return {
    title: data.title,
    overview: nonBlank(data.overview),
    description: nonBlank(data.description),
    recommendations: nonBlank(data.recommendations),
    references,
    ioc_block: renderIocBlock(data.iocs),
  };
}

const PLACEHOLDER = /\{\{(title|overview|description|ioc_block|recommendations|references)\}\}/g;

function placeholderKeys(line: string): (keyof SectionValues)[] {
  const found = line.match(PLACEHOLDER);
  return (found ?? []).map((name) => name.slice(2, -2) as keyof SectionValues);
}

/** Render the template: substitute placeholders. A line whose placeholders all
 * resolve to "" is dropped, together with a trailing-colon label line directly
 * above it — unfilled optional sections leave no orphan headers and no
 * fabricated text (BUL-01); blank runs collapse. */
export function renderBulletin(template: string, data: BulletinData): string {
  const values = sectionValues(data);
  const output: string[] = [];
  for (const line of template.split("\n")) {
    const keys = placeholderKeys(line);
    if (keys.length > 0 && keys.every((key) => values[key] === "")) {
      const previous = output[output.length - 1];
      if (previous !== undefined && previous.trimEnd().endsWith(":")) {
        output.pop();
      }
      continue;
    }
    output.push(line.replace(PLACEHOLDER, (_match, key: keyof SectionValues) => values[key]));
  }
  return output.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
