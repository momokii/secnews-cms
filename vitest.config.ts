import "dotenv/config";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Integration tests share one Postgres and mutate the users table
    // (bootstrap requires count=0), so files must not interleave.
    fileParallelism: false,
    server: {
      deps: {
        // Route autoload runs import() natively when externalized; Node's
        // ESM resolver cannot map ".js" specifiers to ".ts" sources. Inlining
        // pushes autoload through vite so route imports resolve correctly.
        inline: [/@fastify\/autoload/],
      },
    },
    env: {
      APP_ENV: "test",
      JWT_SECRET: "test-only-secret-not-used-in-production",
    },
  },
});
