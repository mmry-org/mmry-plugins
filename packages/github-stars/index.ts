import { mmry } from "npm:@mmry-org/sdk";

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
  lastSeenStarTimestamp: null as string | null,
});

console.log(
  `Starting sync. Last seen star timestamp: ${
    state.lastSeenStarTimestamp || "Never"
  }`
);
mmry.status("Fetching repositories...");

let currentPage = 1;
let hasMorePages = true;
let newStarsCount = 0;

while (hasMorePages) {
  console.log(`Fetching page ${currentPage}...`);

  const data = await fetchStarredRepos(currentPage);

  if (!data || data.length === 0) {
    console.log("No more starred repositories found");
    hasMorePages = false;
    break;
  }

  for (const star of data) {
    const repo = star.repo;

    // If we encounter a star we've already seen, we've caught up
    if (
      state.lastSeenStarTimestamp &&
      star.starred_at &&
      star.starred_at <= state.lastSeenStarTimestamp
    ) {
      console.log(
        `Found star from ${star.starred_at}, which we've already seen (last seen: ${state.lastSeenStarTimestamp}). Caught up.`
      );
      hasMorePages = false;
      break;
    }

    console.log(`Processing new star: ${repo.full_name}`);

    // Access repository data from the nested repo property
    const topics = repo?.topics || [];
    const ownerLogin = repo?.owner?.login || "Unknown";
    const repoHtmlUrl = repo?.html_url || "";
    const content = [
      `${repo?.name || "Unknown"}`,
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
    if (repoHtmlUrl) {
      urls.push(repoHtmlUrl);

      // Add README URL if available (most repos have README in root)
      urls.push(
        `${repoHtmlUrl}/blob/${repo.default_branch || "main"}/README.md`
      );
    }

    // Add homepage URL if available
    if (repo?.homepage) {
      urls.push(repo.homepage);
    }

    const itemToAdd = {
      content,
      externalId: repo?.id.toString() || "unknown",
      href: repoHtmlUrl || null,
      createdAt: repo?.created_at || new Date().toISOString(),
      updatedAt:
        star.starred_at || repo?.created_at || new Date().toISOString(),
      urls,
      // Additional metadata
      language: repo?.language || null,
      starCount: repo?.stargazers_count || 0,
      forkCount: repo?.forks_count || 0,
      topics: topics,
      owner: ownerLogin,
      repositoryName: repo?.name || "Unknown",
      fullName: repo?.full_name || "Unknown",
    };

    mmry.add(itemToAdd);

    // Update state after each star to enable resuming
    if (star.starred_at) {
      state.lastSeenStarTimestamp = star.starred_at;
      console.log("Updating state.starred_at to", star.starred_at);
      state.write();
    }

    newStarsCount++;
  }

  // If we got fewer results than the page size, we've reached the end
  if (data.length < PER_PAGE) {
    console.log("Reached end of starred repositories (partial page)");
    hasMorePages = false;
  }

  currentPage++;
}

console.log(`Done. Processed ${newStarsCount} new starred repositories.`);
mmry.status(`${newStarsCount} stars imported`);

// HELPERS

async function fetchStarredRepos(
  page: number
): Promise<GitHubStarredData[] | null> {
  const url = `${GITHUB_API_URL}/user/starred?sort=created&direction=asc&per_page=${PER_PAGE}&page=${page}`;

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3.star+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        mmry.status("Invalid GitHub token");
        console.error("Authentication failed - invalid token");
      } else if (response.status === 403) {
        mmry.status("Rate limit exceeded");
        console.error("GitHub API rate limit exceeded");
      } else {
        mmry.status(`GitHub API error`);
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
