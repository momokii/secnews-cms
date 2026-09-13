import "dotenv/config";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    env: {
      APP_ENV: "test",
      JWT_SECRET: "test-only-secret-not-used-in-production",
    },
  },
});
