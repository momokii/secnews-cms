import { z } from "zod/v4";

/**
 * Shared list-query and paginated-envelope primitives.
 * Every list endpoint composes these so page semantics stay identical API-wide.
 */

/** URL query params: strings over the wire, coerced to ints here. */
export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PageQuery = z.infer<typeof pageQuery>;

/** Shared `:id` path param — every model PK is a uuid string (B1 schema). */
export const idParam = z.object({
  id: z.uuid(),
});

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

/** Wrap an item schema into the standard page envelope. */
export function paginated<T extends z.ZodType>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    total: z.number().int().min(0),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
  }) satisfies z.ZodType<Paginated<z.output<T>>>;
}
