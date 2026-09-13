import type { Client } from "../../generated/prisma/client.js";
import type { Client as ClientWire } from "./schema.js";

/** DB row → wire DTO: the only place Date fields become ISO strings. */

export function toClientWire(row: Client): ClientWire {
  return {
    id: row.id,
    name: row.name,
    active: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
