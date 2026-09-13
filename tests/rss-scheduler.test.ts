import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { getTasks } from "node-cron";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { startFeedPollScheduler } from "../src/lib/rss/scheduler.js";
import type { FeedParser, RssItem } from "../src/lib/rss/poller.js";
import { prisma } from "../src/lib/db.js";

/** CRON-01: a tick writes feed items; closing the app destroys the cron task.
 * The tick also never rejects unhandled, even when the parser fails. */
describe("feed poll scheduler (CRON-01)", () => {
  let app: FastifyInstance;
  const tag = randomUUID();
  let feedId: string;
  const originalCron = process.env["FEED_POLL_CRON"];

  const feedUrl = `https://cron.example/${tag}/feed.xml`;

  /** Url-scoped so a tick sweeping other active sources (concurrent test
   * files) writes nothing outside our feed. */
  const parserFor = (items: RssItem[]): FeedParser => ({
    parseURL: async (url: string) => {
      if (url !== feedUrl) return { items: [] };
      return { items };
    },
  });

  beforeAll(async () => {
    process.env["FEED_POLL_CRON"] = "* * * * *";
    app = await buildApp();
    const source = await prisma.feedSource.create({
      data: { name: `cron-${tag}`, url: `https://cron.example/${tag}/feed.xml` },
    });
    feedId = source.id;
  });

  afterAll(async () => {
    await prisma.feedItem.deleteMany({ where: { feedId } });
    await prisma.feedSource.deleteMany({ where: { id: feedId } });
    await app.close();
    await prisma.$disconnect();
    if (originalCron === undefined) {
      delete process.env["FEED_POLL_CRON"];
    } else {
      process.env["FEED_POLL_CRON"] = originalCron;
    }
  });

  it("CRON-01: an executed tick writes items from the parser", async () => {
    // Given: a running scheduler with a mocked parser serving one item
    const task = startFeedPollScheduler(app, {
      parser: parserFor([{ title: "cron item", link: `https://cron.example/${tag}/one`, guid: "c-1" }]),
    });
    expect(task).not.toBeNull();

    // When: the tick is executed deterministically
    await task?.execute();

    // Then: the item was written
    const count = await prisma.feedItem.count({ where: { feedId, guid: "c-1" } });
    expect(count).toBe(1);
  });

  it("CRON-01: a failing parser does not reject the tick unhandled", async () => {
    // Given: a scheduler whose parser always rejects
    const task = startFeedPollScheduler(app, {
      parser: {
        parseURL: async () => {
          throw new Error("upstream down");
        },
      },
    });

    // When: the tick executes
    // Then: it resolves (no unhandled rejection) and writes nothing
    await task?.execute();
    const count = await prisma.feedItem.count({ where: { feedId, guid: "c-1" } });
    expect(count).toBe(1);
  });

  it("CRON-01: closing the app destroys the scheduled task", async () => {
    // Given: two live scheduler tasks registered on the app
    const first = startFeedPollScheduler(app, { parser: parserFor([]) });
    const second = startFeedPollScheduler(app, { parser: parserFor([]) });
    const firstId = first?.id;
    const secondId = second?.id;
    if (firstId === undefined || secondId === undefined) {
      throw new Error("scheduler returned no task");
    }
    expect(getTasks().has(firstId)).toBe(true);
    expect(getTasks().has(secondId)).toBe(true);

    // When: the app closes
    await app.close();

    // Then: both cron tasks are gone from the global registry
    expect(getTasks().has(firstId)).toBe(false);
    expect(getTasks().has(secondId)).toBe(false);
  });

  it("returns null and schedules nothing when FEED_POLL_CRON is unset", async () => {
    // Given: no FEED_POLL_CRON in the environment
    delete process.env["FEED_POLL_CRON"];
    const freshApp = await buildApp();

    // When: the scheduler is started
    const task = startFeedPollScheduler(freshApp);

    // Then: no task is created
    expect(task).toBeNull();
    await freshApp.close();
    process.env["FEED_POLL_CRON"] = "* * * * *";
  });
});
