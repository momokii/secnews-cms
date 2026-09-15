import nodemailer from "nodemailer";
import { defaultFetch, type FetchLike } from "../ai/providers/types.js";
import type { SmtpStoredConfig, WahaStoredConfig } from "./schema.js";

/**
 * Connectivity probes for the Integrations menu (#39) and the channel test
 * endpoint (#46b). Every probe answers {ok, detail?} — upstream failure is a
 * RESULT, never a thrown error. Secrets travel to their upstream only and are
 * never embedded in details. All probes carry a hard timeout so a hung
 * connection cannot stall the request.
 */

export type ProbeOutcome = { ok: boolean; detail?: string };

export type SmtpTransportFactory = (options: Parameters<typeof nodemailer.createTransport>[0]) => { verify: () => Promise<true> };

const PROBE_TIMEOUT_MS = 10_000;

/** SMTP: nodemailer's verify() — connects, STARTTLS/implicit TLS and authenticates,
 * without sending a message. */
export async function probeSmtp(
  config: SmtpStoredConfig,
  createTransport: SmtpTransportFactory = (options) => nodemailer.createTransport(options),
): Promise<ProbeOutcome> {
  const transport = createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure ?? config.port === 465,
    auth: { user: config.user, pass: config.password },
  });
  try {
    await Promise.race([
      transport.verify(),
      new Promise<never>((_, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`SMTP verify timed out after ${PROBE_TIMEOUT_MS}ms`)),
          PROBE_TIMEOUT_MS,
        );
        timer.unref();
      }),
    ]);
    return { ok: true };
  } catch (error) {
    return { ok: false, detail: (error as Error).message };
  }
}

/** WAHA: probe the configured session first (proves gateway AND session), then
 * fall back to the gateway-level /api/health for older gateways that 404 the
 * per-session route. */
export async function probeWaha(config: WahaStoredConfig, fetchImpl: FetchLike = defaultFetch): Promise<ProbeOutcome> {
  const headers: Record<string, string> = config.apiKey === undefined ? {} : { "X-Api-Key": config.apiKey };
  try {
    let response = await fetchImpl(`${config.baseUrl}/api/sessions/${encodeURIComponent(config.session)}`, {
      headers,
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (response.status === 404) {
      response = await fetchImpl(`${config.baseUrl}/api/health`, {
        headers,
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
    }
    if (response.ok) {
      return { ok: true };
    }
    return { ok: false, detail: `waha request failed with upstream status ${response.status}` };
  } catch (error) {
    return { ok: false, detail: `waha request failed: ${(error as Error).message}` };
  }
}

/** Telegram: getMe validates the bot token without sending any message. */
export async function probeTelegram(token: string, fetchImpl: FetchLike = defaultFetch): Promise<ProbeOutcome> {
  try {
    const response = await fetchImpl(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { ok: false, detail: `telegram getMe failed with upstream status ${response.status}` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, detail: `telegram getMe failed: ${(error as Error).message}` };
  }
}
