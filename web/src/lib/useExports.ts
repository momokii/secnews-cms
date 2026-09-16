import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import {
  createExport,
  listExportAudits,
  type CreateExportBody,
  type ExportType,
  type ListExportAuditsQuery,
} from "./exportsApi";

/** React Query bindings for the export surfaces. Filter combos own their queryKey slot. */

export function exportAuditsQueryKey(
  query: ListExportAuditsQuery,
): readonly [
  "export-audits",
  string | null,
  string | null,
  string | null,
  string | null,
  string | null,
  number,
  number,
] {
  return [
    "export-audits",
    query.type ?? null,
    query.format ?? null,
    query.status ?? null,
    query.from ?? null,
    query.to ?? null,
    query.page ?? 1,
    query.pageSize ?? 20,
  ];
}

export function useExportAudits(query: ListExportAuditsQuery) {
  return useQuery({
    queryKey: exportAuditsQueryKey(query),
    queryFn: () => listExportAudits(query),
    placeholderData: keepPreviousData,
  });
}

export function useCreateExport() {
  return useMutation({
    mutationFn: ({ type, body }: { type: ExportType; body: CreateExportBody }) =>
      createExport(type, body),
  });
}
