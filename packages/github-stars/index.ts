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
  lastSyncedPage: 1,
  lastSyncTimestamp: null as string | null,
});

console.log(`Starting sync from page ${state.lastSyncedPage}`);
mmry.status("Fetching starred repositories...");

let currentPage = state.lastSyncedPage;
let hasMorePages = true;
let newStarsCount = 0;

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

  for (const repo of data) {
    // Debug: Log repo structure for first few items
    if (newStarsCount < 3) {
      console.log(`Debug repo structure:`, JSON.stringify(repo, null, 2));
    }
    
    // Skip if we've already processed this star based on timestamp
    if (state.lastSyncTimestamp && repo.starred_at && 
        new Date(repo.starred_at) <= new Date(state.lastSyncTimestamp)) {
      continue;
    }

    foundNewStars = true;
    newStarsCount++;

    // Construct comprehensive content
    const topics = repo.topics || [];
    const ownerLogin = repo.owner?.login || 'Unknown';
    const content = [
      `Title: ${repo.name || 'Unknown'}`,
      `Description: ${repo.description || 'No description'}`,
      `Language: ${repo.language || 'Not specified'}`,
      `Stars: ${repo.stargazers_count || 0}`,
      `Forks: ${repo.forks_count || 0}`,
      topics.length > 0 ? `Topics: ${topics.join(', ')}` : '',
      `Owner: ${ownerLogin}`,
    ].filter(Boolean).join('\n');

    // Build URLs array
    const urls: string[] = [];
    if (repo.html_url) {
      urls.push(repo.html_url);
      
      // Add README URL if available (most repos have README in root)
      urls.push(`${repo.html_url}/blob/${repo.default_branch || 'main'}/README.md`);
    }

    // Add homepage URL if available
    if (repo.homepage) {
      urls.push(repo.homepage);
    }

    mmry.add({
      content,
      externalId: `github-star-${repo.id}`,
      createdAt: repo.starred_at || repo.created_at,
      updatedAt: repo.updated_at,
      urls,
      collection: "github-stars",
      // Additional metadata
      language: repo.language,
      starCount: repo.stargazers_count || 0,
      forkCount: repo.forks_count || 0,
      topics: topics,
      owner: ownerLogin,
      repositoryName: repo.name || 'Unknown',
      fullName: repo.full_name || 'Unknown',
    });

    // Update state with latest star timestamp
    if (repo.starred_at) {
      state.lastSyncTimestamp = repo.starred_at;
    }
  }

  // Update page tracking
  state.lastSyncedPage = currentPage;
  state.write();

  // If we found new stars or got a full page, continue
  if (data.length < PER_PAGE) {
    hasMorePages = false;
  } else if (!foundNewStars && state.lastSyncTimestamp) {
    // If we didn't find any new stars in this page and we have a timestamp,
    // we've likely caught up with our previous sync
    console.log("Caught up with previous sync - no new stars found");
    hasMorePages = false;
  }

  currentPage++;
}

// Reset page counter for next sync if we reached the end
if (!hasMorePages) {
  state.lastSyncedPage = 1;
  state.write();
}

console.log(`Sync complete. Processed ${newStarsCount} new starred repositories.`);
mmry.status(`Sync complete - ${newStarsCount} new stars imported`);

// HELPERS

async function fetchStarredRepos(page: number): Promise<GitHubStarredRepo[] | null> {
  const url = `${GITHUB_API_URL}/user/starred?sort=created&direction=desc&per_page=${PER_PAGE}&page=${page}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.star+json',
        'X-GitHub-Api-Version': '2022-11-28',
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
        console.error(`GitHub API error: ${response.status} ${response.statusText}`);
      }
      return null;
    }

    const data = await response.json() as GitHubStarredRepo[];
    console.log(`Fetched ${data.length} repositories from page ${page}`);
    
    // Log each repository for debugging
    data.forEach((repo, index) => {
      console.log(`Repo ${index + 1}:`, JSON.stringify(repo, null, 2));
    });
    
    return data;
    
  } catch (error) {
    console.error(`Failed to fetch starred repos: ${error}`);
    mmry.status("Failed to fetch starred repositories");
    return null;
  }
}

// TYPES

interface GitHubStarredRepo {
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
  starred_at?: string; // Available when using star+json accept header
  default_branch?: string;
  owner?: {
    login?: string;
    avatar_url?: string;
    html_url?: string;
  };
}