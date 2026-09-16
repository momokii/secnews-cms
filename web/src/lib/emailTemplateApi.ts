import { apiFetch } from "./api";

/** Wire types + fetch functions for Surface 8b — the org-wide HTML email
 * template (contract #57/#58). */

export interface EmailTemplate {
  subject: string;
  htmlBody: string;
  updatedAt: string;
}

export async function getEmailTemplate(): Promise<EmailTemplate> {
  const response = await apiFetch("/email-template", { method: "GET" });
  return (await response.json()) as EmailTemplate;
}

export async function putEmailTemplate(
  subject: string,
  htmlBody: string,
): Promise<EmailTemplate> {
  const response = await apiFetch("/email-template", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subject, htmlBody }),
  });
  return (await response.json()) as EmailTemplate;
}
