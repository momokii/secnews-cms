import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";

/** Wire types + fetch functions for the export surfaces (POST /exports/feeds, POST /exports/tickets, GET /exports/audit). */

export type ExportType = "FEED" | "TICKET" | "feed" | "ticket";
export type ExportFormat = "CSV" | "JSON" | "XLSX";
export type ExportStatus = "SUCCESS" | "FAILED";

export interface ExportAudit {
  readonly id: string;
  readonly actorId: string | null;
  readonly actorName: string | null;
  readonly type: ExportType;
  readonly format: ExportFormat;
  readonly from: string | null;
  readonly to: string | null;
  readonly status: ExportStatus;
  readonly rowCount: number | null;
  readonly error: string | null;
  readonly createdAt: string;
}

export interface Paginated<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface ExportAuditQuery {
  readonly page?: number;
  readonly pageSize?: number;
  readonly type?: ExportType;
  readonly format?: ExportFormat;
  readonly status?: ExportStatus;
  readonly from?: string;
  readonly to?: string;
}

/** Alias for consumers that use the List* name. */
export type ListExportAuditsQuery = ExportAuditQuery;

export interface CreateExportBody {
  readonly format: ExportFormat;
  readonly from?: string;
  readonly to?: string;
}

export interface CreateExportInput {
  readonly type: ExportType;
  readonly format: ExportFormat;
  readonly from?: string;
  readonly to?: string;
}

export interface CreateExportResult {
  readonly blob: Blob;
  readonly filename: string;
  readonly contentType: string;
}

/** Alias for the two-arg consumer. */
export type ExportResult = CreateExportResult;

const FORMAT_EXTENSION: Record<ExportFormat, string> = {
  CSV: "csv",
  JSON: "ndjson",
  XLSX: "xlsx",
};

export function parseContentDisposition(header: string | null): string | null {
  if (header === null || header === "") return null;
  const encodedMatch = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (encodedMatch?.[1] !== undefined) {
    try {
      return decodeURIComponent(encodedMatch[1]);
    } catch {
      return encodedMatch[1];
    }
  }
  const quotedMatch = header.match(/filename="([^"]+)"/i);
  if (quotedMatch?.[1] !== undefined) return quotedMatch[1];
  const bareMatch = header.match(/filename=([^;]+)/i);
  if (bareMatch?.[1] !== undefined) return bareMatch[1].trim().replace(/^"|"$/g, "");
  return null;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded === "" ? "" : `?${encoded}`;
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function normalizeType(type: ExportType): "FEED" | "TICKET" {
  return String(type).toUpperCase() === "FEED" ? "FEED" : "TICKET";
}

function exportPath(type: ExportType): string {
  return normalizeType(type) === "FEED" ? "/exports/feeds" : "/exports/tickets";
}

function defaultFilename(type: ExportType, format: ExportFormat): string {
  return `export-${normalizeType(type).toLowerCase()}.${FORMAT_EXTENSION[format]}`;
}

function triggerDownload(blob: Blob, filename: string): void {
  if (typeof document === "undefined") return;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

// createExport supports both:
//   createExport("FEED", { format, from, to })  -> programmatic / test form
//   createExport({ type, format, from, to })    -> UI dialog form (triggers download)
export async function createExport(
  type: ExportType,
  body: CreateExportBody,
): Promise<CreateExportResult>;
export async function createExport(input: CreateExportInput): Promise<CreateExportResult>;
export async function createExport(
  typeOrInput: ExportType | CreateExportInput,
  body?: CreateExportBody,
): Promise<CreateExportResult> {
  const isSingleArg =
    typeof typeOrInput === "object" && typeOrInput !== null && "type" in typeOrInput;
  const type: ExportType = isSingleArg
    ? (typeOrInput as CreateExportInput).type
    : (typeOrInput as ExportType);
  const resolvedBody: CreateExportBody = isSingleArg
    ? {
        format: (typeOrInput as CreateExportInput).format,
        ...( (typeOrInput as CreateExportInput).from !== undefined && (typeOrInput as CreateExportInput).from !== ""
          ? { from: (typeOrInput as CreateExportInput).from }
          : {}),
        ...( (typeOrInput as CreateExportInput).to !== undefined && (typeOrInput as CreateExportInput).to !== ""
          ? { to: (typeOrInput as CreateExportInput).to }
          : {}),
      }
    : (body as CreateExportBody);

  const payload: Record<string, string> = { format: resolvedBody.format };
  if (resolvedBody.from !== undefined && resolvedBody.from !== "") payload["from"] = resolvedBody.from;
  if (resolvedBody.to !== undefined && resolvedBody.to !== "") payload["to"] = resolvedBody.to;

  const response = await apiFetch(exportPath(type), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const blob = await response.blob();
  const contentType = response.headers.get("Content-Type") ?? "application/octet-stream";
  const disposition = response.headers.get("Content-Disposition");
  const filename =
    parseContentDisposition(disposition) ?? defaultFilename(type, resolvedBody.format);
  if (isSingleArg) triggerDownload(blob, filename);
  return { blob, filename, contentType };
}

export async function listExportAudits(
  query: ExportAuditQuery = {},
): Promise<Paginated<ExportAudit>> {
  const response = await apiFetch(
    `/exports/audit${buildQuery({
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
      type: query.type !== undefined ? normalizeType(query.type) : undefined,
      format: query.format,
      status: query.status,
      from: query.from,
      to: query.to,
    })}`,
    { method: "GET" },
  );
  return readJson<Paginated<ExportAudit>>(response);
}

/** Co-located hook for consumers that import from exportsApi directly. */
export function useExportAudits(query: ExportAuditQuery) {
  return useQuery({
    queryKey: [
      "export-audits",
      query.page ?? 1,
      query.pageSize ?? 20,
      query.type ?? null,
      query.format ?? null,
      query.status ?? null,
      query.from ?? null,
      query.to ?? null,
    ],
    queryFn: () => listExportAudits(query),
    placeholderData: keepPreviousData,
  });
}
