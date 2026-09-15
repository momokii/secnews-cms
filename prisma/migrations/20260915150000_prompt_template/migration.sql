-- TASK-PROMPT: ADMIN-managed AI prompt templates (fill/enrich). Additive
-- only: new enum + table, no changes to existing models. Rows are seeded
-- with the legacy hardcoded prompts verbatim (verbatim move, not a rewrite);
-- the runtime also falls back to these built-ins when a row is missing.

CREATE TYPE "PromptKind" AS ENUM ('FILL', 'ENRICH');

CREATE TABLE "PromptTemplate" (
    "id" TEXT NOT NULL,
    "kind" "PromptKind" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromptTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PromptTemplate_kind_key" ON "PromptTemplate"("kind");

INSERT INTO "PromptTemplate" ("id", "kind", "content", "createdAt", "updatedAt") VALUES
(
  gen_random_uuid()::text,
  'FILL',
  $fill$Ticket context:
{{ticketContext}}

Draft content for ONLY these missing final fields: {{missingFields}}.
Do not include fields that already have content. JSON only.$fill$,
  NOW(),
  NOW()
),
(
  gen_random_uuid()::text,
  'ENRICH',
  $enrich$Ticket context:
{{ticketContext}}

Propose a full rewrite for EVERY final field listed below with its current value:
{{currentFields}}
JSON only.$enrich$,
  NOW(),
  NOW()
);
