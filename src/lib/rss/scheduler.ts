import { validate, schedule, type ScheduledTask } from "node-cron";
import type { FastifyInstance } from "fastify";
import { pollAllFeeds, type FeedParser } from "./poller.js";

/** Starts the RSS poll cron when FEED_POLL_CRON is configured; the caller
 * (src/server.ts) owns the lifecycle — closing the app destroys the task.
 * The tick funnels both fulfillment and rejection into the logger, so a
 * failing sweep never surfaces as an unhandled rejection. */
export function startFeedPollScheduler(
  app: FastifyInstance,
  opts: { parser?: FeedParser } = {},
): ScheduledTask | null {
  const expression = process.env["FEED_POLL_CRON"];
  if (expression === undefined || expression.trim() === "") {
    return null;
  }
  if (!validate(expression)) {
    throw new Error(`Invalid FEED_POLL_CRON expression: ${expression}`);
  }
  const task = schedule(
    expression,
    () => {
      pollAllFeeds(opts.parser).then(
        (stats) => app.log.info(stats, "feed poll tick complete"),
        (err: unknown) => app.log.error({ err }, "feed poll tick failed"),
      );
    },
    { name: "feed-poll" },
  );
  app.addHook("onClose", async () => {
    await task.destroy();
  });
  return task;
}
