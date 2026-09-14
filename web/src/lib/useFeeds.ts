import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createFeed,
  deleteFeed,
  listFeedItems,
  listFeeds,
  takeFeedItem,
  updateFeed,
  viewFeedItem,
  type FeedItemsQuery,
  type FeedSourceInput,
  type FeedSourcePatch,
} from "./feedsApi";

/** React Query bindings for Surface 2. Filter combos own their queryKey slot. */

export function feedItemsQueryKey(
  filters: FeedItemsQuery,
): readonly ["feed-items", string | null, string | null, string | null, string | null, number, number] {
  return [
    "feed-items",
    filters.status ?? null,
    filters.q ?? null,
    filters.from ?? null,
    filters.to ?? null,
    filters.page ?? 1,
    filters.pageSize ?? 20,
  ];
}

export function useFeedSources(page: number) {
  return useQuery({
    queryKey: ["feeds", page],
    queryFn: () => listFeeds({ page }),
  });
}

export function useFeedItems(filters: FeedItemsQuery) {
  return useQuery({
    queryKey: feedItemsQueryKey(filters),
    queryFn: () => listFeedItems(filters),
    placeholderData: keepPreviousData,
  });
}

export function useCreateFeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: FeedSourceInput) => createFeed(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["feeds"] });
    },
  });
}

export function useUpdateFeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: FeedSourcePatch }) =>
      updateFeed(id, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["feeds"] });
    },
  });
}

export function useDeleteFeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteFeed(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["feeds"] });
    },
  });
}

export function useViewFeedItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => viewFeedItem(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["feed-items"] });
    },
  });
}

export function useTakeFeedItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => takeFeedItem(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["feed-items"] });
    },
  });
}
