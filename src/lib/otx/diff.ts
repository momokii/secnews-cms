/**
 * TASK-OTXDIFF — the ONE canonical indicator comparison for the updatePulse
 * diff. OTX renames pushed indicator types when it stores them (a pushed
 * "domain" reads back as "hostname"; case drifts: "ipv4" vs "IPv4") and
 * normalizes values (absolute FQDN "whatsapp.com.", casing). Diffing the
 * exact wire strings made every re-push re-add what it had already pushed
 * and skip stale rows. Both sides therefore collapse through the same
 * canonical key: type lowercased + aliased, value trimmed + lowercased, with
 * a single trailing dot stripped from hostnames.
 */

/** OTX wire indicator as pushed (create bodies and PATCH add ops). */
export type OtxWireIndicator = { indicator: string; type: string };

/** One row as read back from GET /pulses/:id (id = OTX's own row id). */
export type OtxDetailIndicator = { id: string | number | null; value: string; type: string };

/** Sibling type names OTX treats as one indicator family (keys/values
 * lowercase; aliases from OTX-Python-SDK IndicatorTypes.py: hostname/domain,
 * URI/URL, Path/FilePath). Unknown types fall through lowercased so both
 * sides still compare consistently. */
const TYPE_ALIASES: Record<string, string> = {
  hostname: "domain",
  uri: "url",
  path: "filepath",
};

export function canonicalOtxType(type: string): string {
  const lowered = type.trim().toLowerCase();
  return TYPE_ALIASES[lowered] ?? lowered;
}

function canonicalOtxValue(value: string, canonicalType: string): string {
  const lowered = value.trim().toLowerCase();
  return canonicalType === "domain" && lowered.endsWith(".") ? lowered.slice(0, -1) : lowered;
}

function canonicalKey(value: string, type: string): string {
  const canonicalType = canonicalOtxType(type);
  return `${canonicalOtxValue(value, canonicalType)}\u0000${canonicalType}`;
}

export type IndicatorDiff = {
  /** Wire objects missing upstream — deduped by canonical key. */
  add: OtxWireIndicator[];
  /** Stale upstream rows named by their real ids (never null ids). */
  remove: Array<{ id: string | number }>;
};

/** Diff the desired wire set against the live pulse rows. A row matches
 * when the canonical keys are equal — aliasing and normalization are applied
 * to BOTH sides, so OTX's stored shape never spawns a phantom diff. */
export function diffIndicators(desired: OtxWireIndicator[], current: OtxDetailIndicator[]): IndicatorDiff {
  const currentKeys = new Set(current.map((row) => canonicalKey(row.value, row.type)));
  const desiredKeys = new Set(desired.map((row) => canonicalKey(row.indicator, row.type)));

  const add: OtxWireIndicator[] = [];
  const seen = new Set<string>();
  for (const row of desired) {
    const key = canonicalKey(row.indicator, row.type);
    if (seen.has(key) || currentKeys.has(key)) {
      continue;
    }
    seen.add(key);
    add.push(row);
  }

  const remove = current
    .filter(
      (row): row is OtxDetailIndicator & { id: string | number } =>
        row.id !== null && !desiredKeys.has(canonicalKey(row.value, row.type)),
    )
    .map((row) => ({ id: row.id }));
  return { add, remove };
}
