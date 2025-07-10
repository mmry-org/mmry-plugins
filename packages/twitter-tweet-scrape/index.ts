import { mmry } from "npm:@mmry-org/sdk";
import { Scraper } from "npm:@the-convocation/twitter-scraper";

const scraper = new Scraper();

console.log("Starting twitter tweet scrape plugin...");

let count = 0;
for (const item of mmry.items()) {
  try {
    if (item?.collection !== "twitter:like") continue; // wrong item type
    if (!item?.externalId) continue; // invalid
    if (item?.username) continue; // already scraped

    const tweet = await scraper.getTweet(item.externalId);
    if (!tweet) continue;
    delete tweet.__raw_UNSTABLE;

    mmry.update({ ...tweet, ...item });
    count++;

    mmry.status(`Processed ${count} tweets`);
  } catch (e) {
    console.error(e);
    Deno.exit(1);
  }
}
