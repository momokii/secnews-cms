import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  FEED_PARSER_OPTIONS,
  pollAllFeeds,
  pollFeedSource,
  type FeedParser,
  type RssItem,
} from "../src/lib/rss/poller.js";
import { prisma } from "../src/lib/db.js";

/** ING-02: malformed feed items are skipped, never persisted, never thrown.
 * Also locks poller-level re-poll dedupe on (feedId, guid). */
describe("RSS poller (ING-02)", () => {
  const tag = randomUUID();
  let feedId: string;

  const feedUrl = () => `https://poller.example/${tag}/feed.xml`;

  /** Only serves items for our feed url, so concurrent test files' active
   * sources polled by pollAllFeeds receive nothing. */
  const fakeParser = (items: RssItem[]): FeedParser => ({
    parseURL: async (url: string) => {
      if (url !== feedUrl()) throw new Error(`unexpected feed url: ${url}`);
      return { items };
    },
  });

  beforeAll(async () => {
    const source = await prisma.feedSource.create({
      data: { name: `poller-${tag}`, url: `https://poller.example/${tag}/feed.xml` },
    });
    feedId = source.id;
  });

  afterAll(async () => {
    await prisma.feedItem.deleteMany({ where: { feedId } });
    await prisma.feedSource.deleteMany({ where: { id: feedId } });
    await prisma.$disconnect();
  });

  it("ING-02: skips items without title or link and stores the rest", async () => {
    // Given: a parser serving one good item, one without a title, one without a link,
    // and one with an unparseable pubDate
    const parser = fakeParser([
      { title: "good item", link: `https://poller.example/${tag}/good`, guid: "g-1", isoDate: "2026-04-01T00:00:00.000Z" },
      { link: `https://poller.example/${tag}/no-title`, guid: "g-2" },
      { title: "no link item", guid: "g-3" },
      { title: "bad date item", link: `https://poller.example/${tag}/bad-date`, guid: "g-4", pubDate: "not-a-date" },
    ]);

    // When: the feed is polled
    const stats = await pollFeedSource({ id: feedId, url: feedUrl() }, parser);

    // Then: 2 stored (good + bad-date), 2 skipped, nothing thrown
    expect(stats).toEqual({ fetched: 4, stored: 2, skipped: 2 });
    const rows = await prisma.feedItem.findMany({ where: { feedId } });
    expect(rows).toHaveLength(2);
    const good = rows.find((row) => row.guid === "g-1");
    expect(good).toMatchObject({
      title: "good item",
      url: `https://poller.example/${tag}/good`,
    });
    expect(good?.publishedAt).toEqual(new Date("2026-04-01T00:00:00.000Z"));
    expect(typeof good?.raw).toBe("object");
    const badDate = rows.find((row) => row.guid === "g-4");
    expect(badDate?.publishedAt).toBeNull();
  });

  it("ING-02: a feed-level parser failure is swallowed, not thrown", async () => {
    // Given: a parser that always rejects
    const parser: FeedParser = {
      parseURL: async () => {
        throw new Error("connection refused");
      },
    };

    // When: the failing feed is polled
    const stats = await pollFeedSource({ id: feedId, url: feedUrl() }, parser);

    // Then: zeros reported, no rejection, DB untouched
    expect(stats).toEqual({ fetched: 0, stored: 0, skipped: 0 });
    expect(await prisma.feedItem.count({ where: { feedId } })).toBe(2);
  });

  it("ING-01: re-polling the same feed upserts in place instead of duplicating", async () => {
    // Given: one already-stored item
    const parser = fakeParser([
      { title: "dedupe item", link: `https://poller.example/${tag}/dedupe`, guid: "g-dup" },
    ]);
    await pollFeedSource({ id: feedId, url: feedUrl() }, parser);

    // When: the same item is polled again with an updated title
    const again = fakeParser([
      { title: "dedupe item v2", link: `https://poller.example/${tag}/dedupe`, guid: "g-dup" },
    ]);
    const stats = await pollFeedSource({ id: feedId, url: feedUrl() }, again);

    // Then: one row with the refreshed title
    expect(stats.stored).toBe(1);
    const rows = await prisma.feedItem.findMany({ where: { guid: "g-dup" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toBe("dedupe item v2");
  });

  it("ING-D: a duplicate title under the same feed counts as skipped, not stored", async () => {
    // Given: an item already stored under its guid
    const title = `poller dupe ${tag}`;
    const first = fakeParser([
      { title, link: `https://poller.example/${tag}/dupe-a`, guid: "g-dupe-a" },
    ]);
    await pollFeedSource({ id: feedId, url: feedUrl() }, first);

    // When: the same title arrives under a different guid on the next poll
    const again = fakeParser([
      { title, link: `https://poller.example/${tag}/dupe-b`, guid: "g-dupe-b" },
    ]);
    const stats = await pollFeedSource({ id: feedId, url: feedUrl() }, again);

    // Then: the poll reports the item as skipped and no new row exists
    expect(stats).toEqual({ fetched: 1, stored: 0, skipped: 1 });
    const rows = await prisma.feedItem.findMany({ where: { feedId, title } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.guid).toBe("g-dupe-a");
  });

  it("pollAllFeeds aggregates across active sources only and never rejects", async () => {
    // Given: an active source and a parser serving one item for every url
    const parser = fakeParser([
      { title: "bulk item", link: `https://poller.example/${tag}/bulk`, guid: "g-bulk" },
    ]);

    // When: all feeds are polled
    const stats = await pollAllFeeds(parser);

    // Then: at least our item was stored and the call resolved
    expect(stats.stored).toBeGreaterThanOrEqual(1);
    expect(await prisma.feedItem.count({ where: { feedId, guid: "g-bulk" } })).toBe(1);
  });

  it("uses a 10s timeout and the SecNews/1.0 user agent", async () => {
    // Given/When: the canonical parser options
    // Then: the wire contract for upstream fetches is pinned
    expect(FEED_PARSER_OPTIONS.timeout).toBe(10_000);
    expect(FEED_PARSER_OPTIONS.headers["User-Agent"]).toBe("SecNews/1.0");
  });
});
