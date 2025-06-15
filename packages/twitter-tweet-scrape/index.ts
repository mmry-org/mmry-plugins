import { mmry } from "jsr:@mmry-org/sdk@0.0.4";
import { Scraper } from "npm:@the-convocation/twitter-scraper";

const scraper = new Scraper();

console.log("Starting twitter tweet scrape plugin...");

for (const item of mmry.items()) {
  try {
    console.log(`Processing item: ${item.id}`);

    if (item?.collection !== "twitter:likes") continue; // wrong item type
    if (!item?.externalId) continue; // invalid
    if (item?.username) continue; // already scraped

    const tweet = await scraper.getTweet(item.externalId);
    if (!tweet) continue;
    delete tweet.__raw_UNSTABLE;

    mmry.update({ ...tweet, ...item });
  } catch (e) {
    console.error(e);
    Deno.exit(1);
  }
}
