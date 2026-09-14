import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createChannel,
  createClient,
  deleteChannel,
  deleteClient,
  listClients,
  updateChannel,
  updateClient,
  type ChannelPatch,
  type ClientInput,
  type ClientPatch,
  type CreateChannelBody,
} from "./clientsApi";

/** React Query bindings for Surface 6 (contract #40-46). Channels are not
 * query-cached — the contract has no list endpoint, so the channels editor
 * owns its session-local list and consumes mutation responses directly. */

export function useClients(page: number, pageSize: number = 20) {
  return useQuery({
    queryKey: ["clients", page, pageSize],
    queryFn: () => listClients({ page, pageSize }),
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ClientInput) => createClient(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

export function useUpdateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ClientPatch }) =>
      updateClient(id, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

export function useDeleteClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteClient(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

/** Channel mutations return the wire Channel; the panel folds it into its
 * local list via onSuccess handlers passed at mutate() call sites. */
export function useCreateChannel(clientId: string) {
  return useMutation({
    mutationFn: (body: CreateChannelBody) => createChannel(clientId, body),
  });
}

export function useUpdateChannel() {
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ChannelPatch }) =>
      updateChannel(id, patch),
  });
}

export function useDeleteChannel() {
  return useMutation({
    mutationFn: (id: string) => deleteChannel(id),
  });
}
