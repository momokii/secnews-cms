import { FieldsCard, type FieldSpec } from "./FieldsCard";

const SMTP_FIELDS: readonly FieldSpec[] = [
  { key: "host", label: "Host", inputType: "text", plain: (c) => c.host ?? null },
  {
    key: "port",
    label: "Port",
    inputType: "number",
    plain: (c) => (c.port === null || c.port === undefined ? null : String(c.port)),
  },
  { key: "user", label: "User", inputType: "text", plain: (c) => c.user ?? null },
  {
    key: "password",
    label: "Password",
    inputType: "password",
    masked: (c) => c.maskedPassword ?? null,
  },
  { key: "from", label: "From", inputType: "text", plain: (c) => c.from ?? null },
];

/** SMTP relay card — PUT {host, port, user, password, from}; GET masks the password. */
export function SmtpCard() {
  return (
    <FieldsCard
      kind="SMTP"
      title="SMTP"
      description="Mail relay used to deliver EMAIL channel digests and alerts."
      fields={SMTP_FIELDS}
      buildBody={(values) => ({
        host: values.host,
        port: Number(values.port),
        user: values.user,
        password: values.password,
        from: values.from,
      })}
    />
  );
}
