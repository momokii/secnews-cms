import { z } from "zod/v4";
import { IntegrationKind as PrismaIntegrationKind } from "../../generated/prisma/enums.js";

/** Central integration credentials (AI providers + OTX). ADMIN-only surface.
 * Keys are stored AES-256-GCM encrypted and NEVER returned in plaintext —
 * responses carry `maskedKey` (e.g. "sk-…ab12") and a `hasKey` flag. */

export const IntegrationKindEnum = z.enum(PrismaIntegrationKind);
export type IntegrationKind = z.infer<typeof IntegrationKindEnum>;

// GET /integrations/available — per-kind dropdown info for the fill/enrich
// client (WORK-readable). Model + hasKey only; never any key material.
export const AvailableIntegrationSchema = z.object({
  kind: IntegrationKindEnum,
  model: z.string().nullable(),
  hasKey: z.boolean(),
});
export type AvailableIntegration = z.infer<typeof AvailableIntegrationSchema>;

// GET /integrations/:kind
export const IntegrationConfigResponseSchema = z.object({
  kind: IntegrationKindEnum,
  /** Free-text model id; AI kinds only (model ids change without code changes). */
  model: z.string().nullable(),
  hasKey: z.boolean(),
  maskedKey: z.string().nullable(),
  updatedAt: z.iso.datetime(),
});
export type IntegrationConfigResponse = z.infer<typeof IntegrationConfigResponseSchema>;

// PUT /integrations/:kind — AI kinds (model optional). For kind=OTX the route
// validates with PutOtxConfigBodySchema instead (no model).
export const PutIntegrationConfigBodySchema = z.object({
  apiKey: z.string().min(1),
  model: z.string().min(1).optional(),
});
export type PutIntegrationConfigBody = z.infer<typeof PutIntegrationConfigBodySchema>;

/** Kind-specific refinement applied at the route (param carries the kind):
 * kind=OTX forbids `model`. Exported so C4 composes it without re-declaring. */
export const PutOtxConfigBodySchema = z.object({
  apiKey: z.string().min(1),
});
export type PutOtxConfigBody = z.infer<typeof PutOtxConfigBodySchema>;

// POST /integrations/:kind/test
export const TestConnectionResponseSchema = z.object({
  ok: z.boolean(),
  detail: z.string().optional(),
  latencyMs: z.number().int().min(0).optional(),
});
