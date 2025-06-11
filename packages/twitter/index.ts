import { mmry } from "/Users/jannik/Documents/Dropbox/Files/Active/Repositories/mmry-plugins/mmry/index.ts";

console.log("Hello, world! Twitter plugin index.ts");

console.log("mmry env");
console.log(mmry.env());

console.log(mmry.inputs());
console.log(mmry.input("twitter-data-export"));

const file = mmry.inputFile("twitter-data-export");
if (!file) Deno.exit(1); // todo: error messages to UI

if (file.stat.isDirectory) console.log("isDirectory");
if (file.stat.isFile) console.log("isFile");

const likes = JSON.parse(
  Deno.readTextFileSync(`${file.path}/data/like.js`).replace(
    /window.YTD.[a-z]*.part0 =/,
    ""
  )
);

const items = likes.map((l: any) => ({
  externalId: l.like.tweetId,
  content: l.like.fullText,
  username: l.like.username,
  collection: "twitter:likes", // todo: make syntax work
}));

// mmry.addMany(items.slice(0, 10));
mmry.addMany(items);
