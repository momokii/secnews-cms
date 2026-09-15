import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listPrompts, putPrompt } from "./promptsApi";
import type { PromptKind } from "./promptsApi";

/** React Query bindings for the AI prompt templates. Saving invalidates the
 * list so both editors refetch the persisted state — mirrors useBulletin. */

export function usePrompts() {
  return useQuery({
    queryKey: ["prompts"],
    queryFn: listPrompts,
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
