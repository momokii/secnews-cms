import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createChannel,
  createClient,
  deleteChannel,
  deleteClient,
  listChannels,
  listClients,
  testChannel,
  updateChannel,
  updateClient,
  type ChannelPatch,
  type ClientInput,
  type ClientPatch,
  type CreateChannelBody,
} from "./clientsApi";

/** React Query bindings for Surface 6 (contract #40-46). The channel list is
 * server-truth (#44b): every mutation invalidates ["channels"] so the editor
 * re-renders from the refetched list — no local channel state. */

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

/** Channel mutations invalidate the persisted list (#44b) so the editor
 * re-renders from the refetched server list. */
export function useChannels(clientId: string) {
  return useQuery({
    queryKey: ["channels", clientId],
    queryFn: () => listChannels(clientId),
  });
}

export function useCreateChannel(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateChannelBody) => createChannel(clientId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["channels", clientId] });
    },
  });
}

export function useUpdateChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ChannelPatch }) =>
      updateChannel(id, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["channels"] });
    },
  });
}

export function useDeleteChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteChannel(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["channels"] });
    },
  });
}

/** Test probes are point-in-time — like integration tests, never cached. */
export function useTestChannel(clientId: string) {
  return useMutation({
    mutationFn: (channelId: string) => testChannel(clientId, channelId),
  });
}
