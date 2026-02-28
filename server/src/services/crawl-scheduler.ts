import cron from "node-cron";
import {
  getDueCrawlUrls,
  crawlAndExtract,
  updateLastCrawled,
} from "./live-ticker.service.js";

let task: cron.ScheduledTask | null = null;

export function startCrawlScheduler(): void {
  if (task) return;
  task = cron.schedule("* * * * *", async () => {
    const dueUrls = getDueCrawlUrls();
    for (const config of dueUrls) {
      const result = await crawlAndExtract(config.tournamentId, config.url);
      updateLastCrawled(config.id);
      if (!result.success) {
        console.error(
          `[crawl-scheduler] Failed to crawl ${config.url}: ${result.error}`,
        );
      } else {
        console.log(
          `[crawl-scheduler] Crawled ${config.url}: ${result.entriesUpserted} entries`,
        );
      }
    }
  });
  console.log("[crawl-scheduler] Started (checking every minute)");
}

export function stopCrawlScheduler(): void {
  if (task) {
    task.stop();
    task = null;
  }
}
