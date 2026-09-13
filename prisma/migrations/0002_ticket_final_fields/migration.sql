-- TASK-C4: final (client-facing) output fields on Ticket. AI suggestion
-- accept (SUG-01) merges into these columns; PATCH /tickets/:id/fields (C2)
-- writes the same surface.
ALTER TABLE "Ticket" ADD COLUMN "overview" TEXT,
ADD COLUMN "description" TEXT,
ADD COLUMN "recommendations" TEXT,
ADD COLUMN "cveIds" TEXT[],
ADD COLUMN "affectedProduct" TEXT,
ADD COLUMN "affectedVersions" TEXT,
ADD COLUMN "mitigation" TEXT,
ADD COLUMN "threatName" TEXT;
