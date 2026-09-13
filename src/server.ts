import { buildApp } from "./app.js";

const port = Number(process.env["PORT"] ?? 3000);
const host = process.env["HOST"] ?? "0.0.0.0";

async function main(): Promise<void> {
  const app = await buildApp();
  try {
    await app.listen({ port, host });
  } catch (err) {
    app.log.error(err, "Failed to start server");
    await app.close();
    process.exit(1);
  }
}

await main();
