import { mmry } from "jsr:@mmry-org/sdk@0.0.4";

const GITHUB_API_URL = "https://api.github.com";
const PER_PAGE = 100; // Maximum allowed by GitHub API

console.log("GitHub Stars plugin starting...");

const token = mmry.input("GITHUB_TOKEN")?.value;
if (!token) {
  mmry.status("GitHub token is required");
  Deno.exit(1);
}

// Initialize state to track sync progress
const state = mmry.state({
  lastSyncTimestamp: null as string | null,
});

console.log(
  `Starting sync. Last sync timestamp: ${state.lastSyncTimestamp || "Never"}`
);
mmry.status("Fetching starred repositories...");

let currentPage = 1;
let hasMorePages = true;
let newStarsCount = 0;
let newestStarTimestamp: string | null = null;
let processedForDebugCount = 0;
const DEBUG_ITEM_LIMIT = 10;

while (hasMorePages) {
  console.log(`Fetching page ${currentPage}...`);
  mmry.status(`Fetching page ${currentPage} of starred repositories...`);

  const data = await fetchStarredRepos(currentPage);

  if (!data || data.length === 0) {
    console.log("No more starred repositories found");
    hasMorePages = false;
    break;
  }

  let foundNewStars = false;

  for (const star of data) {
    const repo = star.repo;

    // If we encounter a star older than our last sync, we've caught up
    if (
      state.lastSyncTimestamp &&
      star.starred_at &&
      new Date(star.starred_at) <= new Date(state.lastSyncTimestamp)
    ) {
      console.log(
        `Found star from ${star.starred_at}, older than last sync ${state.lastSyncTimestamp}. Caught up.`
      );
      hasMorePages = false;
      break;
    }

    newStarsCount++;
    processedForDebugCount++;
    console.log(
      `Processing new star #${processedForDebugCount} (${repo.full_name})`
    );

    // Track the newest star timestamp for state updates
    if (
      !newestStarTimestamp ||
      (star.starred_at && star.starred_at > newestStarTimestamp)
    ) {
      newestStarTimestamp = star.starred_at;
    }

    // Access repository data from the nested repo property
    const topics = repo?.topics || [];
    const ownerLogin = repo?.owner?.login || "Unknown";
    const content = [
      `Title: ${repo?.name || "Unknown"}`,
      `Description: ${repo?.description || "No description"}`,
      `Language: ${repo?.language || "Not specified"}`,
      `Stars: ${repo?.stargazers_count || 0}`,
      `Forks: ${repo?.forks_count || 0}`,
      topics.length > 0 ? `Topics: ${topics.join(", ")}` : "",
      `Owner: ${ownerLogin}`,
    ]
      .filter(Boolean)
      .join("\n");

    // Build URLs array
    const urls: string[] = [];
    if (repo?.html_url) {
      urls.push(repo.html_url);

      // Add README URL if available (most repos have README in root)
      urls.push(
        `${repo.html_url}/blob/${repo.default_branch || "main"}/README.md`
      );
    }

    // Add homepage URL if available
    if (repo?.homepage) {
      urls.push(repo.homepage);
    }

    const itemToAdd = {
      content,
      externalId: `github-star-${repo?.id}`,
      createdAt: star.starred_at || new Date().toISOString(),
      updatedAt: repo?.updated_at || new Date().toISOString(),
      urls,
      collection: "github-stars",
      // Additional metadata
      language: repo?.language || null,
      starCount: repo?.stargazers_count || 0,
      forkCount: repo?.forks_count || 0,
      topics: topics,
      owner: ownerLogin,
      repositoryName: repo?.name || "Unknown",
      fullName: repo?.full_name || "Unknown",
    };

    console.log("Adding item to mmry:", JSON.stringify(itemToAdd, null, 2));
    mmry.add(itemToAdd);

    // Hard stop for debugging
    if (processedForDebugCount >= DEBUG_ITEM_LIMIT) {
      console.log(
        `\n--- DEBUG: Hit item limit of ${DEBUG_ITEM_LIMIT}. Stopping sync. ---\n`
      );
      hasMorePages = false;
      break;
    }
  }

  // If we got fewer results than the page size, we've reached the end
  if (data.length < PER_PAGE) {
    console.log("Reached end of starred repositories (partial page)");
    hasMorePages = false;
  }

  // Persist state after each page
  if (newestStarTimestamp) {
    state.lastSyncTimestamp = newestStarTimestamp;
    state.write();
    console.log(`Updated last sync timestamp to: ${newestStarTimestamp}`);
  }

  currentPage++;
}

console.log(
  `Sync complete. Processed ${newStarsCount} new starred repositories.`
);
mmry.status(`Sync complete - ${newStarsCount} new stars imported`);

// HELPERS

async function fetchStarredRepos(
  page: number
): Promise<GitHubStarredData[] | null> {
  const url = `${GITHUB_API_URL}/user/starred?sort=created&direction=desc&per_page=${PER_PAGE}&page=${page}`;

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.star+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        mmry.status("Invalid GitHub token - check your permissions");
        console.error("Authentication failed - invalid token");
      } else if (response.status === 403) {
        mmry.status("Rate limit exceeded - try again later");
        console.error("GitHub API rate limit exceeded");
      } else {
        mmry.status(`GitHub API error: ${response.status}`);
        console.error(
          `GitHub API error: ${response.status} ${response.statusText}`
        );
      }
      return null;
    }

    const data = (await response.json()) as GitHubStarredData[];
    console.log(`Fetched ${data.length} repositories from page ${page}`);

    return data;
  } catch (error) {
    console.error(`Failed to fetch starred repos: ${error}`);
    mmry.status("Failed to fetch starred repositories");
    return null;
  }
}

// TYPES

interface GitHubStarredData {
  starred_at: string;
  repo: GitHubRepo;
}

interface GitHubRepo {
  id: number;
  name?: string;
  full_name?: string;
  description?: string | null;
  html_url?: string;
  homepage?: string | null;
  language?: string | null;
  stargazers_count?: number;
  forks_count?: number;
  topics?: string[];
  created_at?: string;
  updated_at?: string;
  default_branch?: string;
  owner?: {
    login?: string;
    avatar_url?: string;
    html_url?: string;
  };
}
