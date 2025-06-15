import { mmry } from "jsr:@mmry-org/sdk";
import { Scraper } from "npm:@the-convocation/twitter-scraper";

const scraper = new Scraper();

console.log("Starting twitter tweet scrape plugin...");

for (const item of mmry.items()) {
  try {
    console.log(`Processing item: ${item.id}`);

    if (item.meta.username) continue; // already scraped

    const tweet = await scraper.getTweet(item.externalId);
    if (!tweet) continue;
    delete tweet.__raw_UNSTABLE;

    item.meta = {
      ...item.meta,
      tweet,
    };

    mmry.update(item);
  } catch (e) {
    console.error(e);
    Deno.exit(1);
  }
}
