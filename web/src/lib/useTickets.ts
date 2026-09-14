import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  acceptSuggestion,
  addIoc,
  addTicketSource,
  aiEnrich,
  aiFill,
  deleteIoc,
  deleteTicketSource,
  getTicket,
  listDeliveryAudit,
  listSuggestions,
  listTickets,
  patchTicketFields,
  pushOtx,
  rejectSuggestion,
  sendTicket,
  transitionTicket,
  updateIoc,
  type CreateIocBody,
  type OtxPushResponse,
  type PatchTicketFieldsBody,
  type SendResponse,
  type SuggestionStatus,
  type TicketsQuery,
  type TicketStatus,
  type UpdateIocBody,
} from "./ticketsApi";

/** React Query bindings for the ticket workflow. Filter combos own their
 * queryKey slot; every mutation invalidates its ticket detail + the list. */

export function useTickets(filters: TicketsQuery) {
  return useQuery({
    queryKey: [
      "tickets",
      filters.q ?? null,
      filters.status ?? null,
      filters.origin ?? null,
      filters.findingType ?? null,
      filters.page ?? 1,
      filters.pageSize ?? 20,
    ],
    queryFn: () => listTickets(filters),
    placeholderData: keepPreviousData,
  });
}

export function useTicket(id: string) {
  return useQuery({
    queryKey: ["ticket", id],
    queryFn: () => getTicket(id),
  });
}

function useTicketMutation<TVariables, TData>(
  ticketId: (variables: TVariables) => string,
  mutationFn: (variables: TVariables) => Promise<TData>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["ticket", ticketId(variables)] });
      void queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });
}

export function useTransitionTicket() {
  return useTicketMutation(
    ({ id }: { id: string; to: TicketStatus }) => id,
    ({ id, to }: { id: string; to: TicketStatus }) => transitionTicket(id, to),
  );
}

export function usePatchTicketFields() {
  return useTicketMutation(
    ({ id }: { id: string; patch: PatchTicketFieldsBody }) => id,
    ({ id, patch }: { id: string; patch: PatchTicketFieldsBody }) =>
      patchTicketFields(id, patch),
  );
}

export function useAddTicketSource() {
  return useTicketMutation(
    ({ id }: { id: string; body: { url?: string; note?: string } }) => id,
    ({ id, body }: { id: string; body: { url?: string; note?: string } }) =>
      addTicketSource(id, body),
  );
}

export function useDeleteTicketSource() {
  return useTicketMutation(
    ({ id }: { id: string; sourceId: string }) => id,
    ({ id, sourceId }: { id: string; sourceId: string }) =>
      deleteTicketSource(id, sourceId),
  );
}

export function useAddIoc() {
  return useTicketMutation(
    ({ id }: { id: string; body: CreateIocBody }) => id,
    ({ id, body }: { id: string; body: CreateIocBody }) => addIoc(id, body),
  );
}

export function useUpdateIoc() {
  return useTicketMutation(
    ({ id }: { id: string; iocId: string; patch: UpdateIocBody }) => id,
    ({ id, iocId, patch }: { id: string; iocId: string; patch: UpdateIocBody }) =>
      updateIoc(id, iocId, patch),
  );
}

export function useDeleteIoc() {
  return useTicketMutation(
    ({ id }: { id: string; iocId: string }) => id,
    ({ id, iocId }: { id: string; iocId: string }) => deleteIoc(id, iocId),
  );
}

// ---- AI assist ----

export function useSuggestions(id: string, status?: SuggestionStatus) {
  return useQuery({
    queryKey: ["suggestions", id, status ?? null],
    queryFn: () => listSuggestions(id, status),
  });
}

function useSuggestionAction(action: "accept" | "reject") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, suggestionId }: { id: string; suggestionId: string }) =>
      action === "accept"
        ? acceptSuggestion(id, suggestionId)
        : rejectSuggestion(id, suggestionId),
    onSuccess: (_data, { id }) => {
      // Accept merges the value into final fields and changes pendingSuggestions.
      void queryClient.invalidateQueries({ queryKey: ["ticket", id] });
      void queryClient.invalidateQueries({ queryKey: ["suggestions", id] });
    },
  });
}

export function useAcceptSuggestion() {
  return useSuggestionAction("accept");
}

export function useRejectSuggestion() {
  return useSuggestionAction("reject");
}

function useAiRun(path: "ai/fill" | "ai/enrich") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      path === "ai/fill" ? aiFill(id) : aiEnrich(id),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: ["ticket", id] });
      void queryClient.invalidateQueries({ queryKey: ["suggestions", id] });
    },
  });
}

export function useAiFill() {
  return useAiRun("ai/fill");
}

export function useAiEnrich() {
  return useAiRun("ai/enrich");
}

// ---- Delivery ----

export function useSendTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: { channelIds?: string[]; all?: boolean };
    }): Promise<SendResponse> => sendTicket(id, body),
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ["ticket", id] });
      void queryClient.invalidateQueries({ queryKey: ["delivery-audit", id] });
      void queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });
}

export function useDeliveryAudit(id: string, page: number) {
  return useQuery({
    queryKey: ["delivery-audit", id, page],
    queryFn: () => listDeliveryAudit(id, page),
    placeholderData: keepPreviousData,
  });
}

export function usePushOtx() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string): Promise<OtxPushResponse> => pushOtx(id),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: ["ticket", id] });
    },
  });
}
