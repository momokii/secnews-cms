import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getEmailTemplate, putEmailTemplate } from "./emailTemplateApi";

/** React Query bindings for Surface 8b. Saving invalidates the template so
 * the editors refetch the persisted state. */

export function useEmailTemplate() {
  return useQuery({
    queryKey: ["email-template"],
    queryFn: getEmailTemplate,
  });
}

export function useSaveEmailTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ subject, htmlBody }: { subject: string; htmlBody: string }) =>
      putEmailTemplate(subject, htmlBody),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["email-template"] });
    },
  });
}
