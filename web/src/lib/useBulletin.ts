import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  getBulletinTemplate,
  getOtxPulse,
  listOtxPulses,
  previewBulletin,
  putBulletinTemplate,
} from "./bulletinApi";
import type { OtxPulsesQuery } from "./bulletinApi";

/** React Query bindings for Surface 8. Saving invalidates the template so the
 * editor refetches persisted state; pulses keep previous rows while paging. */

export function useBulletinTemplate() {
  return useQuery({
    queryKey: ["bulletin-template"],
    queryFn: getBulletinTemplate,
  });
}

export function useSaveBulletinTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (template: string) => putBulletinTemplate(template),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["bulletin-template"] });
    },
  });
}

export function useBulletinPreview() {
  return useMutation({
    mutationFn: (ticketId: string) => previewBulletin(ticketId),
  });
}

export function useOtxPulses(query: OtxPulsesQuery) {
  return useQuery({
    queryKey: ["otx-pulses", query.source, query.page, query.pageSize ?? 20, query.q ?? ""],
    queryFn: () =>
      listOtxPulses({
        ...query,
        q: query.q === "" ? undefined : query.q,
      }),
    placeholderData: keepPreviousData,
  });
}

export function useOtxPulseDetail(id: string) {
  return useQuery({
    queryKey: ["otx-pulse-detail", id],
    queryFn: () => getOtxPulse(id),
  });
}
