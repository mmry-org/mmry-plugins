import { mmry } from "/Users/jannik/Documents/Dropbox/Files/Active/Repositories/mmry-plugins/mmry/index.ts";
import process from "node:process";

const RAINDROP_API_URL = "https://api.raindrop.io/rest/v1";
const RAINDROP_PER_PAGE = 50; // Max allowed by Raindrop API

console.log("Raindrop plugin starting...");

const token = mmry.input("RAINDROP_API_TOKEN")?.value;
// if (!token) {
//   console.error(
//     "Raindrop API token (RAINDROP_API_TOKEN) is missing. Please configure it in the plugin settings."
//   );
//   process.exit(1);
// }

// Initialize state and get the state object
const state = mmry.state({
  collections: {} as Record<number, CollectionSyncStatus>,
});

console.log("state", state);
console.log("state.collections", state.collections);

// Log initial state (optional, adjust as needed)
console.log(
  `Initial collection sync statuses: ${JSON.stringify(state.collections)}`
);

const collectionsRoot = await fetchRaindropCollections();
const collectionsChildren = await fetchRaindropCollectionChildren();

const collections = [
  ...(collectionsRoot?.items ?? []),
  ...(collectionsChildren?.items ?? []),
].filter((c) => c._id > 0); // Filter out system collections like -1 (Unsorted) and -99 (Trash);

if (collections.length === 0) {
  console.log("No user collections found to sync.");
  process.exit(0);
}

console.log(`Starting sync for ${collections.length} collections...`);

for (const collection of collections) {
  const { _id: cid, title } = collection;
  console.log(`\n--- Syncing Collection: ${title} (ID: ${cid}) ---`);

  if (!state.collections[cid]) {
    console.log(`No previous state found for collection ${cid}. Initializing.`);
    state.collections[cid] = {
      lastSyncedTimestamp: null,
      lastSyncedPage: 0,
    };
    state.write();
  }

  console.log(
    `State for collection ${cid}. Last sync timestamp: ${
      state.collections[cid].lastSyncedTimestamp || "None"
    }. Last synced page: ${state.collections[cid].lastSyncedPage}`
  );

  let page = state.collections[cid].lastSyncedPage;
  while (true) {
    console.log(`Fetching: collection ${collection._id}, page ${page}`);
    const data = await fetchRaindropBookmarks({
      collectionId: collection._id,
      page,
    });
    console.log(
      `Fetched: collection ${collection._id}: ${
        data?.items?.length ?? 0
      } bookmarks, `
    );

    if (!data || !data.result || !data.items) {
      console.warn(
        `Failed to fetch or invalid data on page ${page} for collection ${collection._id}. Stopping sync for this collection.`
      );
      break; // Skip this collection
    }

    const bookmarks: RaindropBookmark[] = data.items;
    if (bookmarks.length === 0) {
      console.log(`Reached end of raindrops for collection ${collection._id}.`);
      // Reset page number for next sync run if we reached the end *successfully*
      state.collections[cid].lastSyncedPage = page;
      state.write();
      break; // No more items available from API for this collection
    }

    let foundUnseenBookmarkInPage = false;

    for (const bookmark of bookmarks) {
      if (bookmark.collection.$id !== collection._id) {
        console.warn(
          `Incorrect collection ID (${bookmark.collection.$id} != ${collection._id}). This should never happen.`
        );
        continue;
      }

      const isNewerThanLastSynced =
        !state.collections[cid].lastSyncedTimestamp ||
        new Date(bookmark.created) >
          new Date(state.collections[cid].lastSyncedTimestamp ?? "");
      if (!isNewerThanLastSynced) continue;

      foundUnseenBookmarkInPage = true;
      mmry.add({
        externalId: `raindrop-${bookmark._id}`,
        content: `Title: ${bookmark.title}\nURL: ${bookmark.link}\nExcerpt: ${
          bookmark.excerpt || ""
        }\nNote: ${bookmark.note || ""}\nTags: ${(bookmark.tags || []).join(
          ", "
        )}`,
        createdAt: bookmark.created,
        updatedAt: bookmark.lastUpdate,
        href: bookmark.link,
      });
      state.collections[cid].lastSyncedTimestamp = bookmark.created;
      state.collections[cid].lastSyncedPage = page;
      state.write();
    }

    // If we processed a full page but found no items newer than the last sync timestamp for *this collection*,
    // we can assume we've caught up for this collection.
    if (!foundUnseenBookmarkInPage && bookmarks.length === RAINDROP_PER_PAGE) {
      console.log(`No unseen items: collection ${cid}, page, ${page}.`);
      break;
    }

    page++;
  }
}

console.log("\nFinished syncing all collections.");

// HELPERS

async function fetchRaindropCollections(): Promise<CollectionsApiResponse | null> {
  const url = `${RAINDROP_API_URL}/collections`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    console.error(
      `Failed to fetch collections: ${response.status} ${response.statusText}`
    );
    return null;
  }
  return response.json();
}

async function fetchRaindropCollectionChildren(): Promise<CollectionsApiResponse | null> {
  const url = `${RAINDROP_API_URL}/collections/childrens`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    console.error(
      `Failed to fetch collections: ${response.status} ${response.statusText}`
    );
    return null;
  }
  return response.json();
}

async function fetchRaindropBookmarks(opts: {
  collectionId: string | number;
  page: number;
}): Promise<RaindropsApiResponse | null> {
  const url = `${RAINDROP_API_URL}/raindrops/${opts.collectionId}?sort=created&page=${opts.page}&perpage=${RAINDROP_PER_PAGE}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    console.error(
      `Failed to fetch ${url}: ${response.status} ${response.statusText}`
    );
    return null;
  }
  return response.json();
}

// TYPES

interface RaindropBookmark {
  _id: number;
  collection: { $id: number };
  created: string; // ISO Date String
  lastUpdate: string; // ISO Date String
  link: string;
  title: string;
  excerpt?: string;
  note?: string;
  tags?: string[];
}

interface RaindropCollection {
  _id: number;
  title: string;
}

interface RaindropApiResponse<T> {
  result: boolean;
  items: T[];
  // Potentially other fields like count
}

type RaindropsApiResponse = RaindropApiResponse<RaindropBookmark>;
type CollectionsApiResponse = RaindropApiResponse<RaindropCollection>;

interface CollectionSyncStatus {
  lastSyncedTimestamp: string | null;
  lastSyncedPage: number;
}
