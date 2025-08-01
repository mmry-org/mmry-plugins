import { mmry } from "npm:@mmry-org/sdk";

const file = mmry.inputFile("twitter-data-export");
if (!file) {
  mmry.status("Twitter data export files not found");
  Deno.exit(1);
}

if (file.stat.isDirectory) console.log("isDirectory");
if (file.stat.isFile) console.log("isFile");

if (!file.stat.isDirectory) {
  mmry.status("Expected a directory, got a file");
  Deno.exit(1);
}

const likes = JSON.parse(
  Deno.readTextFileSync(`${file.path}/data/like.js`).replace(
    /window.YTD.[a-z]*.part0 =/,
    ""
  )
);

const items = likes.map((l: any) => ({
  externalId: l.like.tweetId,
  href: `https://twitter.com/username/status/${l.like.tweetId}`,
  content: l.like.fullText,
  username: l.like.username,
  collection: "twitter:like",
  createdAt: getTweetDate(l.like.tweetId),
  urls: l.like.fullText
    .split(/\s+/)
    .filter(
      (word: string) =>
        word.startsWith("http://") || word.startsWith("https://")
    ),
}));

mmry.addMany(items);

// HELPERS

function getTweetDate(tweetId: string): Date {
  const id = BigInt(tweetId);
  const twitterEpoch = BigInt(1288834974657);
  const timestampMs = id >> BigInt(22);
  const createdTime = timestampMs + twitterEpoch;
  return new Date(Number(createdTime));
}
