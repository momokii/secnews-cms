import type { IocType } from "../../generated/prisma/enums.js";

/**
 * Bulletin renderer (Surface 8): fills the org-wide template placeholders and
 * defangs every client-facing IOC value per docs/STATES.md §3. Optional
 * sections with no content drop their whole line — the renderer never
 * fabricates placeholders, "null" or "undefined" output.
 *
 * Placeholders: {{title}} {{overview}} {{description}} {{ioc_block}}
 * {{recommendations}} {{references}}.
 */

export type BulletinIoc = {
  type: IocType;
  value: string;
  includeInBulletin: boolean;
};

export type BulletinInput = {
  title: string;
  overview: string | null;
  description: string | null;
  recommendations: string | null;
  references: string[];
  iocs: BulletinIoc[];
};

/** STATES.md §3 defangs only the final IP separator ("1.2.3[.]4" analog) —
 * not all of them, unlike the conventional style. */
function defangLastSeparator(value: string, sep: string): string {
  const last = value.lastIndexOf(sep);
  if (last === -1) {
    return value;
  }
  return `${value.slice(0, last)}[${sep}]${value.slice(last + sep.length)}`;
}

/** Defang rules per IOC type (STATES.md §3). Verbatim types pass through. */
export function defangIoc(type: IocType, value: string): string {
  switch (type) {
    case "DOMAIN":
      return value.replaceAll(".", "[.]");
    case "IPV4":
      return defangLastSeparator(value, ".");
    case "IPV6":
      return defangLastSeparator(value, ":");
    case "URL": {
      const isHttps = value.startsWith("https://");
      const isHttp = !isHttps && value.startsWith("http://");
      const scheme = isHttps ? "hxxps://" : isHttp ? "hxxp://" : "";
      const rest = value.slice(scheme === "" ? 0 : isHttps ? 8 : 7);
      return scheme + rest.replaceAll(".", "[.]");
    }
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
  }
}

/** "- TYPE: defanged-value" lines for the included IOCs, in input order. */
export function renderIocBlock(iocs: BulletinIoc[]): string {
  return iocs
    .filter((ioc) => ioc.includeInBulletin)
    .map((ioc) => `- ${ioc.type}: ${defangIoc(ioc.type, ioc.value)}`)
    .join("\n");
}

/** Fallback body used when no active BulletinTemplate row exists. */
export const DEFAULT_BULLETIN_TEMPLATE = [
  "{{title}}",
  "",
  "Overview: {{overview}}",
  "",
  "Description: {{description}}",
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

type SectionValues = Record<
  "title" | "overview" | "description" | "ioc_block" | "recommendations" | "references",
  string | null
>;

function sectionValues(input: BulletinInput): SectionValues {
  const iocBlock = renderIocBlock(input.iocs);
  return {
    title: input.title,
    overview: input.overview,
    description: input.description,
    ioc_block: iocBlock === "" ? null : iocBlock,
    recommendations: input.recommendations,
    references: input.references.length === 0 ? null : input.references.join("\n"),
  };
}

const PLACEHOLDER = /\{\{(title|overview|description|ioc_block|recommendations|references)\}\}/g;

function placeholderKeys(line: string): (keyof SectionValues)[] {
  const found = line.match(PLACEHOLDER);
  return (found ?? []).map((name) => name.slice(2, -2) as keyof SectionValues);
}

/** Render the bulletin body. A line whose placeholders all resolve to null is
 * dropped, together with a trailing-colon label line directly above it —
 * unfilled optional sections leave no orphan headers and no fabricated text. */
export function renderBulletin(template: string, input: BulletinInput): string {
  const values = sectionValues(input);
  const output: string[] = [];
  for (const line of template.split("\n")) {
    const keys = placeholderKeys(line);
    if (keys.length > 0 && keys.every((key) => values[key] === null)) {
      const previous = output[output.length - 1];
      if (previous !== undefined && previous.trimEnd().endsWith(":")) {
        output.pop();
      }
      continue;
    }
    output.push(line.replace(PLACEHOLDER, (_match, key: keyof SectionValues) => values[key] ?? ""));
  }
  return output.join("\n");
}
