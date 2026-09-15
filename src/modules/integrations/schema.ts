import { z } from "zod/v4";
import { IntegrationKind as PrismaIntegrationKind } from "../../generated/prisma/enums.js";

/** Central integration credentials (AI providers + OTX + SMTP + WAHA gateway).
 * ADMIN-only surface. Everything is stored AES-256-GCM encrypted and NEVER
 * returned in plaintext — responses carry `maskedKey` (e.g. "sk-…ab12") and a
 * `hasKey` flag; SMTP/WAHA additionally expose their non-secret coordinates. */

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

// GET /integrations/:kind — AI/OTX kinds carry model+maskedKey; SMTP carries
// host/port/from/secure + masked password; WAHA carries baseUrl/session +
// masked apiKey. Kinds without a field report null.
export const IntegrationConfigResponseSchema = z.object({
  kind: IntegrationKindEnum,
  /** Free-text model id; AI kinds only (model ids change without code changes). */
  model: z.string().nullable(),
  hasKey: z.boolean(),
  /** SMTP: masked password. WAHA: masked apiKey. AI/OTX: masked api key. */
  maskedKey: z.string().nullable(),
  host: z.string().nullable(),
  port: z.number().int().nullable(),
  from: z.string().nullable(),
  secure: z.boolean().nullable(),
  baseUrl: z.string().nullable(),
  session: z.string().nullable(),
  updatedAt: z.iso.datetime(),
});
export type IntegrationConfigResponse = z.infer<typeof IntegrationConfigResponseSchema>;

// PUT /integrations/:kind — AI kinds (model optional). OTX, SMTP and WAHA are
// re-validated kind-specifically at the route; the route-level body schema
// only needs to admit every kind's shape.
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

/** Central SMTP relay — stored as ONE encrypted JSON blob (password inside). */
export const PutSmtpConfigBodySchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  user: z.string().min(1),
  password: z.string().min(1),
  from: z.string().min(1),
  /** Default when omitted: implicit TLS on 465, STARTTLS otherwise. */
  secure: z.boolean().optional(),
});
export type PutSmtpConfigBody = z.infer<typeof PutSmtpConfigBodySchema>;

/** WAHA gateway — stored as ONE encrypted JSON blob (apiKey inside). */
export const PutWahaConfigBodySchema = z.object({
  baseUrl: z.string().url(),
  session: z.string().min(1),
  apiKey: z.string().min(1),
});
export type PutWahaConfigBody = z.infer<typeof PutWahaConfigBodySchema>;

/** Route-level body validation for PUT /integrations/:kind: a union so every
 * kind passes wire validation; the handler re-parses with the kind's schema. */
export const PutAnyIntegrationBodySchema = z.union([
  PutSmtpConfigBodySchema,
  PutWahaConfigBodySchema,
  PutIntegrationConfigBodySchema,
  PutOtxConfigBodySchema,
]);

/** Decrypted at-rest shapes (typed views of the JSON blobs). */
export type AiStoredConfig = { apiKey: string; model?: string };
export type SmtpStoredConfig = z.infer<typeof PutSmtpConfigBodySchema>;
export type WahaStoredConfig = z.infer<typeof PutWahaConfigBodySchema>;

// POST /integrations/:kind/test
export const TestConnectionResponseSchema = z.object({
  ok: z.boolean(),
  detail: z.string().optional(),
  latencyMs: z.number().int().min(0).optional(),
});
