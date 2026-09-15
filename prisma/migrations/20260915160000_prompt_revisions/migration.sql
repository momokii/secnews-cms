-- TASK-PROMPT: append-only prompt revision history and replacement of the
-- migration-seeded legacy defaults. Existing edited rows are left untouched.

CREATE TABLE "PromptRevision" (
    "id" TEXT NOT NULL,
    "promptKind" "PromptKind" NOT NULL,
    "content" TEXT NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromptRevision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PromptRevision_promptKind_createdAt_idx" ON "PromptRevision"("promptKind", "createdAt");

ALTER TABLE "PromptRevision" ADD CONSTRAINT "PromptRevision_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "PromptTemplate"
SET "content" = $fill$# Role
You are a security-intelligence analyst drafting a factual ticket from the supplied evidence.

# Instructions
Use the finding type to weave the analysis appropriately: vulnerability, threat campaign, or other.
Never invent IOCs, CVE IDs, product versions, sources, or claims. If evidence is missing, omit it rather than fabricate it.
Defang every IOC in prose and lists (for example, example[.]com and hxxps://example[.]com).
Keep the tone concise, precise, and suitable for analyst sign-off.

# Output contract
Return JSON with only the requested missing fields: {{missingFields}}.
The final content model uses these exact sections when applicable: Overview, Description, IOC, Recommendations, References.
Include an analyst sign-off note only when the evidence supports it; do not imply review that did not happen.
Do not rewrite fields that already contain content.

# Evidence
{{ticketContext}}$fill$
WHERE "kind" = 'FILL' AND "content" = $oldfill$Ticket context:
{{ticketContext}}

Draft content for ONLY these missing final fields: {{missingFields}}.
Do not include fields that already have content. JSON only.$oldfill$;

UPDATE "PromptTemplate"
SET "content" = $enrich$# Role
You are a senior security-intelligence analyst producing a concise, evidence-bound draft for analyst sign-off.

# Instructions
Use the finding type to shape the narrative: explain vulnerability impact and affected versions, connect campaign behavior and threat names, or state what is known for other findings.
Never invent IOCs, CVE IDs, product versions, sources, or facts. Omit unsupported details; do not fabricate plausible values.
Defang every IOC in prose and lists (for example, example[.]com and hxxps://example[.]com).
Clearly separate enrichment or analyst inference from supplied evidence, and label uncertainty.

# Output contract
Return JSON with fields whose values are concise strings or arrays as appropriate.
Use these exact sections: Overview, Description, IOC, Recommendations, References.
Recommendations must be actionable and evidence-based. References must contain only supplied or explicitly verified sources.
End with a sign-off status such as `Analyst sign-off: required` rather than claiming approval.

# Current ticket and evidence
{{ticketContext}}
{{currentFields}}$enrich$
WHERE "kind" = 'ENRICH' AND "content" = $oldenrich$Ticket context:
{{ticketContext}}

Propose a full rewrite for EVERY final field listed below with its current value:
{{currentFields}}
JSON only.$oldenrich$;
