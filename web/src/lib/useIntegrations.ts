import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getIntegrationConfig,
  listAvailableIntegrations,
  putIntegrationConfig,
  testIntegration,
  type IntegrationKind,
  type PutIntegrationConfigBody,
} from "./integrationsApi";

/** React Query bindings for Surface 5 (contract #37-39). */

export function integrationQueryKey(
  kind: IntegrationKind,
): readonly ["integrations", IntegrationKind] {
  return ["integrations", kind];
}

export function useAvailableIntegrations() {
  return useQuery({
    queryKey: ["integrations", "available"] as const,
    queryFn: listAvailableIntegrations,
  });
}

export function useIntegrationConfig(kind: IntegrationKind) {
  return useQuery({
    queryKey: integrationQueryKey(kind),
    queryFn: () => getIntegrationConfig(kind),
  });
}

export function usePutIntegrationConfig(kind: IntegrationKind) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PutIntegrationConfigBody) =>
      putIntegrationConfig(kind, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: integrationQueryKey(kind),
      });
    },
  });
}

/** Test results are point-in-time probes — never cached. */
export function useTestIntegration(kind: IntegrationKind) {
  return useMutation({
    mutationFn: () => testIntegration(kind),
  });
}
