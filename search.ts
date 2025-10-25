import dotenv from "dotenv";
import { GitHubSearchClient, type RepositorySearchResult, type SearchOptions } from "./src/lib/github";
import { logger } from "./src/lib/logger";
import { SearchTimeoutError, RateLimitError, AbuseLimitError } from "./src/lib/errors";

// Load environment variables
dotenv.config();

/**
 * Predefined search configurations for common use cases
 */
export const SEARCH_PRESETS = {
  crypto: {
    query: "crypto OR blockchain OR web3 language:typescript stars:>100",
    description: "Crypto/blockchain TypeScript repositories",
  },
  defi: {
    query: "defi OR decentralized finance language:javascript stars:>50",
    description: "DeFi projects in JavaScript",
  },
  nft: {
    query: "nft OR non-fungible token created:>2023-01-01 stars:>10",
    description: "Recent NFT projects",
  },
  smart_contracts: {
    query: "smart contract OR solidity language:javascript",
    description: "Smart contract related JavaScript projects",
  },
  web3_tools: {
    query: "web3 tool OR library in:description language:typescript",
    description: "Web3 tools and libraries in TypeScript",
  },
};

/**
 * Format and display repository results
 */
export function displayResults(results: RepositorySearchResult[], limit: number = 10) {
  logger.info(`Found ${results.length} repositories:`);

  results.slice(0, limit).forEach((repo, index) => {
    console.log(`\n${index + 1}. ${repo.fullName}`);
    console.log(`   ⭐ Stars: ${repo.stars.toLocaleString()}`);
    console.log(`   🍴 Forks: ${repo.forks.toLocaleString()}`);
    console.log(`   💻 Language: ${repo.language || "Not specified"}`);
    console.log(`   📝 Description: ${repo.description?.substring(0, 100) || "No description"}`);
    if (repo.topics && repo.topics.length > 0) {
      console.log(`   🏷️  Topics: ${repo.topics.slice(0, 5).join(", ")}`);
    }
    console.log(`   🔗 URL: ${repo.url}`);
    if (repo.isArchived) {
      console.log(`   ⚠️  ARCHIVED`);
    }
  });

  if (results.length > limit) {
    console.log(`\n... and ${results.length - limit} more repositories`);
  }
}

/**
 * Save results to a JSON file with timestamp
 */
export async function saveResults(results: RepositorySearchResult[], prefix: string = "search"): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${prefix}-results-${timestamp}.json`;

  await Bun.write(filename, JSON.stringify(results, null, 2));
  logger.info(`Results saved to ${filename}`);

  return filename;
}

/**
 * Create a GitHub search client with default settings
 */
export function createSearchClient(options: {
  excludeRepos?: string[];
  excludeOrgs?: string[];
  excludeTopics?: string[];
  timeoutMs?: number;
} = {}): GitHubSearchClient {
  return new GitHubSearchClient({
    searchTimeoutMs: options.timeoutMs || 30000,
    excludeRepos: [
      ...(options.excludeRepos || []),
      // Common exclusions
      "torvalds/linux",
      "microsoft/TypeScript",
    ],
    excludeOrgs: options.excludeOrgs || [],
    excludeTopics: [
      ...(options.excludeTopics || []),
      // Default exclusions
      "deprecated",
      "archived",
      "obsolete",
    ],
  });
}

/**
 * Quick search with a preset
 */
export async function searchWithPreset(
  preset: keyof typeof SEARCH_PRESETS,
  options?: SearchOptions & { save?: boolean; client?: GitHubSearchClient }
): Promise<RepositorySearchResult[]> {
  const searchConfig = SEARCH_PRESETS[preset];
  if (!searchConfig) {
    throw new Error(`Invalid preset: ${preset}. Available: ${Object.keys(SEARCH_PRESETS).join(", ")}`);
  }

  const client = options?.client || createSearchClient();
  logger.info(`Searching with preset: ${preset} - ${searchConfig.description}`);

  const results = await client.searchWithRetry(searchConfig.query, {
    maxResults: options?.maxResults || 50,
    sort: options?.sort || "stars",
    order: options?.order || "desc",
  });

  if (options?.save) {
    await saveResults(results, preset);
  }

  return results;
}

/**
 * Custom search with query
 */
export async function searchRepositories(
  query: string,
  options?: SearchOptions & {
    save?: boolean;
    savePrefix?: string;
    client?: GitHubSearchClient;
    excludeRepos?: string[];
    excludeOrgs?: string[];
    excludeTopics?: string[];
  }
): Promise<RepositorySearchResult[]> {
  const client = options?.client || createSearchClient({
    excludeRepos: options?.excludeRepos,
    excludeOrgs: options?.excludeOrgs,
    excludeTopics: options?.excludeTopics,
  });

  logger.info(`Searching: ${query}`);

  const results = await client.searchWithRetry(query, {
    maxResults: options?.maxResults || 50,
    sort: options?.sort || "stars",
    order: options?.order || "desc",
  });

  if (options?.save) {
    await saveResults(results, options.savePrefix || "search");
  }

  return results;
}

/**
 * Get repositories by topics
 */
export async function searchByTopics(
  topics: string[],
  options?: SearchOptions & { save?: boolean; language?: string }
): Promise<RepositorySearchResult[]> {
  const topicsQuery = topics.map(t => `topic:${t}`).join(" ");
  const languageQuery = options?.language ? ` language:${options.language}` : "";
  const query = `${topicsQuery}${languageQuery}`;

  return searchRepositories(query, {
    ...options,
    savePrefix: `topics-${topics.join("-")}`,
  });
}

/**
 * Find repositories by organization
 */
export async function searchByOrg(
  org: string,
  options?: SearchOptions & { save?: boolean; language?: string; minStars?: number }
): Promise<RepositorySearchResult[]> {
  const starsQuery = options?.minStars ? ` stars:>${options.minStars}` : "";
  const languageQuery = options?.language ? ` language:${options.language}` : "";
  const query = `org:${org}${languageQuery}${starsQuery}`;

  return searchRepositories(query, {
    ...options,
    savePrefix: `org-${org}`,
  });
}

/**
 * Search for recently updated repositories
 */
export async function searchRecent(
  query: string,
  daysAgo: number = 7,
  options?: SearchOptions & { save?: boolean }
): Promise<RepositorySearchResult[]> {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  const dateStr = date.toISOString().split('T')[0];

  const fullQuery = `${query} pushed:>${dateStr}`;

  return searchRepositories(fullQuery, {
    ...options,
    sort: "updated",
    savePrefix: `recent-${daysAgo}days`,
  });
}

/**
 * Export results to CSV format
 */
export async function exportToCSV(results: RepositorySearchResult[], filename?: string): Promise<string> {
  const headers = [
    "Name",
    "Full Name",
    "Owner",
    "Stars",
    "Forks",
    "Language",
    "Description",
    "URL",
    "Created",
    "Updated",
    "Topics"
  ].join(",");

  const rows = results.map(repo => [
    repo.name,
    repo.fullName,
    repo.owner,
    repo.stars,
    repo.forks,
    repo.language || "",
    `"${(repo.description || "").replace(/"/g, '""')}"`,
    repo.url,
    repo.createdAt,
    repo.updatedAt,
    (repo.topics || []).join(";")
  ].join(","));

  const csv = [headers, ...rows].join("\n");
  const outputFile = filename || `search-results-${Date.now()}.csv`;

  await Bun.write(outputFile, csv);
  logger.info(`CSV exported to ${outputFile}`);

  return outputFile;
}

// Example usage when running directly
if (import.meta.main) {
  // Example: Search for Web3 tools
  async function exampleSearch() {
    try {
      logger.info("Running example search for Web3 tools...");

      // Search using a preset
      const results = await searchWithPreset("web3_tools", {
        maxResults: 20,
        save: true
      });

      // Display the results
      displayResults(results, 5);

      // Also export to CSV
      await exportToCSV(results, "web3-tools.csv");

      logger.info("Example search completed!");
    } catch (error) {
      logger.error({ error }, "Example search failed");
    }
  }

  exampleSearch();
}