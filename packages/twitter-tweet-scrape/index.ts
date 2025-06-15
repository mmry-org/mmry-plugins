import { Scraper } from "npm:@the-convocation/twitter-scraper";

const ids = [
  "1931751180536795612",
  "1931764215439593766",
  "1931813239329116288",
];

const scraper = new Scraper();

for (const id of ids) {
  console.log(`Fetching tweet with ID: ${id}`);
  const tweet = await scraper.getTweet(id);
  if (!tweet) continue;
  delete tweet.__raw_UNSTABLE;

  console.log(`Tweet ${id}:`, tweet);
}
