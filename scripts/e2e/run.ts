import "dotenv/config";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../../src/lib/db.js";
import { clearState } from "./lib.js";

/**
 * E2E runner (npm run test:e2e): guards to the dev stack, truncates every
 * table (fresh DB per run), spawns the transport-stubbed server, then runs
 * s1..s5 sequentially — each as its own process whose exit code must be 0.
 * Run is fail-fast; the server log is surfaced when anything fails. The DB is
 * truncated again on every exit path so suite residue (e.g. S5's active
 * channels, which the unit suite resolves globally via {all:true}) never
 * leaks into a later `npm test`.
 */

const SCRIPTS = ["s1-happy.ts", "s2-block.ts", "s3-inactive.ts", "s4-rbac.ts", "s5-delivery-otx.ts"];

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const HEALTH_TIMEOUT_MS = 30_000;

function fail(message: string): never {
  console.error(`E2E RUNNER: ${message}`);
  process.exit(1);
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

async function truncateAll(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "DeliveryAudit", "AiSuggestion", "Ioc", "TicketSource", "Ticket",
     "FeedItem", "FeedSource", "Channel", "Client", "BulletinTemplate",
     "IntegrationConfig", "User" CASCADE`,
  );
}

function spawnTsx(script: string, env: NodeJS.ProcessEnv, pipeOutput: boolean): ChildProcess {
  return spawn("npx", ["tsx", join("scripts", "e2e", script)], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: pipeOutput ? ["ignore", "pipe", "pipe"] : "inherit",
  });
}

async function waitForHealth(baseUrl: string, server: ChildProcess): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      fail(`stub server exited early with code ${server.exitCode}`);
    }
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // not up yet — retry
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  fail(`server did not become healthy within ${HEALTH_TIMEOUT_MS}ms at ${baseUrl}`);
}

async function stopServer(server: ChildProcess): Promise<void> {
  server.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      server.kill("SIGKILL");
      resolve();
    }, 3000);
    server.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function main(): Promise<number> {
  // Dev-only guard: this suite truncates the database.
  const appEnv = process.env["APP_ENV"];
  const dbUrl = process.env["DATABASE_URL"] ?? "";
  if (appEnv !== "development" && appEnv !== "test") {
    fail(`refusing to run outside dev/test (APP_ENV=${String(appEnv)})`);
  }
  if (!dbUrl.includes(":5433")) {
    fail(`refusing to truncate a non-dev database (DATABASE_URL host must be :5433)`);
  }

  console.log("[run] truncating dev database …");
  await truncateAll();
  clearState();

  const serverPort = await freePort();
  const ctrlPort = await freePort();
  const smtpPort = await freePort();
  const baseUrl = `http://127.0.0.1:${serverPort}`;
  const ctrlUrl = `http://127.0.0.1:${ctrlPort}`;
  const childEnv = {
    PORT: String(serverPort),
    HOST: "127.0.0.1",
    E2E_CTRL_PORT: String(ctrlPort),
    E2E_SMTP_PORT: String(smtpPort),
    E2E_BASE_URL: baseUrl,
    E2E_CTRL_URL: ctrlUrl,
  };

  console.log(`[run] starting stubbed server on ${baseUrl} …`);
  const server = spawnTsx("stub-server.ts", childEnv, true);
  const serverLog: string[] = [];
  server.stdout?.on("data", (chunk: Buffer) => process.stdout.write(`[server] ${chunk}`));
  server.stderr?.on("data", (chunk: Buffer) => {
    serverLog.push(chunk.toString());
    process.stderr.write(`[server] ${chunk}`);
  });

  let exitCode = 0;
  try {
    await waitForHealth(baseUrl, server);
    clearState(); // s1 mints a fresh state file; stale files from prior runs must not leak

    for (const script of SCRIPTS) {
      console.log(`\n[run] ▶ ${script}`);
      const exit = await new Promise<number>((resolve) => {
        const child = spawnTsx(script, childEnv, false);
        child.once("exit", (code) => resolve(code ?? 1));
      });
      if (exit !== 0) {
        console.error(`\n[run] ✗ ${script} exited ${exit} — server log tail:`);
        console.error(serverLog.slice(-40).join(""));
        exitCode = exit;
        break;
      }
    }
  } finally {
    await stopServer(server);
    clearState();
    console.log("[run] cleaning dev database …");
    await truncateAll();
    await prisma.$disconnect();
  }

  if (exitCode === 0) {
    console.log("\n[run] E2E-S1…S5 all passed ✓");
  }
  return exitCode;
}

process.exit(await main());
