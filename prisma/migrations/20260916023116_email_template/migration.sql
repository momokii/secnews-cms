-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "htmlBody" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_name_key" ON "EmailTemplate"("name");

-- Seed the single org-wide row with the built-in default HTML email — the
-- exact same string as DEFAULT_EMAIL_HTML / DEFAULT_EMAIL_SUBJECT in
-- src/modules/email-template/render.ts (verbatim move, not a rewrite; the
-- runtime falls back to those built-ins when the row is missing).

INSERT INTO "EmailTemplate" ("id", "name", "subject", "htmlBody", "createdAt", "updatedAt") VALUES
(
  gen_random_uuid()::text,
  'default',
  $subject$Security Bulletin: {{title}}$subject$,
  $html$<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{{title}}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f1f5f9;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:24px 12px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="background-color:#4f46e5;padding:20px 24px;">
                <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#c7d2fe;">Security bulletin</p>
                <h1 style="margin:0;font-size:20px;line-height:1.35;color:#ffffff;">{{title}}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 24px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#475569;">
                <strong>TLP:{{tlp}}</strong> &middot; {{findingType}}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 24px 0;">
                <h2 style="margin:0 0 6px;font-size:14px;color:#0f172a;">Overview</h2>
                <p style="margin:0;font-size:14px;line-height:1.6;color:#334155;">{{overview}}</p>
                <h2 style="margin:18px 0 6px;font-size:14px;color:#0f172a;">Description</h2>
                <p style="margin:0;font-size:14px;line-height:1.6;color:#334155;">{{description}}</p>
                <h2 style="margin:18px 0 6px;font-size:14px;color:#0f172a;">Indicators of Compromise (defanged)</h2>
                <pre style="margin:0;padding:12px;background-color:#0f172a;color:#e2e8f0;border-radius:6px;font-family:'SFMono-Regular',Consolas,monospace;font-size:12px;line-height:1.6;white-space:pre-wrap;word-break:break-all;">{{iocs}}</pre>
                <h2 style="margin:18px 0 6px;font-size:14px;color:#0f172a;">Recommendations</h2>
                <p style="margin:0;font-size:14px;line-height:1.6;color:#334155;">{{recommendations}}</p>
                <h2 style="margin:18px 0 6px;font-size:14px;color:#0f172a;">References</h2>
                <p style="margin:0;font-size:13px;line-height:1.6;color:#4f46e5;word-break:break-all;">{{references}}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;border-top:1px solid #e2e8f0;">
                <p style="margin:0;font-size:11px;line-height:1.6;color:#94a3b8;">Delivered by SecNews CMS. Handle per TLP:{{tlp}} — do not redistribute beyond the marked handling caveats.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>$html$,
  NOW(),
  NOW()
);
