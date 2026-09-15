import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listPrompts, listPromptHistory, putPrompt } from "./promptsApi";
import type { PromptKind } from "./promptsApi";

/** React Query bindings for the AI prompt templates. Saving invalidates the
 * list so both editors refetch the persisted state — mirrors useBulletin. */

export function usePrompts() {
  return useQuery({
    queryKey: ["prompts"],
    queryFn: listPrompts,
  });
}

export function usePromptHistory({
  kind,
  page,
  pageSize,
  enabled,
}: {
  readonly kind: PromptKind;
  readonly page: number;
  readonly pageSize: number;
  readonly enabled: boolean;
}) {
  return useQuery({
    queryKey: ["prompts", "history", kind, page, pageSize],
    queryFn: () => listPromptHistory(kind, page, pageSize),
    enabled,
  });
}

export function useSavePrompt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, content }: { kind: PromptKind; content: string }) =>
      putPrompt(kind, content),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["prompts"] });
    },
  });
}
