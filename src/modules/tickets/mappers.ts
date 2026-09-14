import type { Ioc, Ticket, TicketSource } from "../../generated/prisma/client.js";
import type { Ioc as IocWire, Ticket as TicketWire, TicketSource as TicketSourceWire } from "./schema.js";

/** DB row → wire DTO: the only place Date fields become ISO strings, so
 * response schemas (z.iso.datetime) validate without a second mapping. */

type TicketWithTakenBy = Ticket & { takenBy?: { name: string } | null };

/** `activityFallbackName` resolves legacy rows whose takenBy relation is
 * empty but whose TAKEN/CREATED audit trail names an actor (see taken-by.ts). */
export function toTicketDto(row: TicketWithTakenBy, activityFallbackName?: string | null): TicketWire {
  return {
    id: row.id,
    title: row.title,
    origin: row.origin,
    findingType: row.findingType,
    status: row.status,
    cveIds: row.cveIds,
    affectedProduct: row.affectedProduct,
    affectedVersions: row.affectedVersions,
    mitigation: row.mitigation,
    threatName: row.threatName,
    overview: row.overview,
    description: row.description,
    recommendations: row.recommendations,
    references: row.references,
    tlp: row.tlp,
    feedItemId: row.feedItemId,
    otxPulseId: row.otxPulseId,
    otxPulseUrl: row.otxPulseUrl,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    takenByName: row.takenBy?.name ?? activityFallbackName ?? null,
  };
}

export function toTicketSourceDto(row: TicketSource): TicketSourceWire {
  return {
    id: row.id,
    ticketId: row.ticketId,
    url: row.url,
    note: row.note,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toIocDto(row: Ioc): IocWire {
  return {
    id: row.id,
    ticketId: row.ticketId,
    type: row.type,
    value: row.value,
    context: row.context,
    origin: row.origin,
    includeInBulletin: row.includeInBulletin,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
  };
}
