import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  getBulletinTemplate,
  listOtxPulses,
  previewBulletin,
  putBulletinTemplate,
} from "./bulletinApi";

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

export function useOtxPulses(page: number) {
  return useQuery({
    queryKey: ["otx-pulses", page],
    queryFn: () => listOtxPulses(page),
    placeholderData: keepPreviousData,
  });
}
