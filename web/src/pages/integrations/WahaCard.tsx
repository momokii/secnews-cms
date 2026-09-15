import { FieldsCard, type FieldSpec } from "./FieldsCard";

const WAHA_FIELDS: readonly FieldSpec[] = [
  { key: "baseUrl", label: "Base URL", inputType: "text", plain: (c) => c.baseUrl ?? null },
  { key: "session", label: "Session", inputType: "text", plain: (c) => c.session ?? null },
  {
    key: "apiKey",
    label: "API key",
    inputType: "password",
    masked: (c) => c.maskedApiKey ?? null,
  },
];

/** WAHA gateway card — PUT {baseUrl, session, apiKey}; GET masks the key. */
export function WahaCard() {
  return (
    <FieldsCard
      kind="WAHA"
      title="WAHA"
      description="WhatsApp gateway used to deliver WHATSAPP channels."
      fields={WAHA_FIELDS}
      buildBody={(values) => ({
        baseUrl: values.baseUrl,
        session: values.session,
        apiKey: values.apiKey,
      })}
    />
  );
}
