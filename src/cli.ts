#!/usr/bin/env bun

import dotenv from "dotenv";
import { GitHubSearchClient, type RepositorySearchResult } from "./lib/github";
import { logger } from "./lib/logger";
import { SearchTimeoutError, RateLimitError, AbuseLimitError } from "./lib/errors";
import { SEARCH_PRESETS, displayResults, saveResults } from "./search";

// Load environment variables
dotenv.config();

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    preset: null as keyof typeof SEARCH_PRESETS | null,
    query: null as string | null,
    maxResults: 50,
    save: false,
    excludeOrgs: [] as string[],
    excludeRepos: [] as string[],
    excludeTopics: [] as string[],
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case "--preset":
      case "-p":
        options.preset = args[++i] as keyof typeof SEARCH_PRESETS;
        break;
      case "--query":
      case "-q":
        options.query = args[++i];
        break;
      case "--max":
      case "-m":
        options.maxResults = parseInt(args[++i]);
        break;
      case "--save":
      case "-s":
        options.save = true;
        break;
      case "--exclude-org":
        options.excludeOrgs.push(args[++i]);
        break;
      case "--exclude-repo":
        options.excludeRepos.push(args[++i]);
        break;
      case "--exclude-topic":
        options.excludeTopics.push(args[++i]);
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
    }
  }

  return options;
}

/**
 * Print help message
 */
function printHelp() {
  console.log(`
GitHub Repository Search Tool - CLI

Usage:
  bun run cli.ts [options]

Options:
  -p, --preset <name>      Use a predefined search preset
  -q, --query <query>      Custom search query
  -m, --max <number>       Maximum results (default: 50)
  -s, --save               Save results to JSON file
  --exclude-org <name>     Exclude organization from results (can be repeated)
  --exclude-repo <name>    Exclude repository from results (can be repeated)
  --exclude-topic <topic>  Exclude topic from results (can be repeated)
  -h, --help               Show this help message

Available Presets:
${Object.entries(SEARCH_PRESETS).map(([key, value]) =>
  `  ${key}: ${value.description}`
).join("\n")}

Examples:
  # Use a preset
  bun run cli.ts --preset crypto --max 100 --save

  # Custom query
  bun run cli.ts --query "ethereum solidity stars:>500" --save

  # With exclusions
  bun run cli.ts --preset defi --exclude-org facebook --exclude-topic deprecated

  # Quick search with default preset
  bun run cli.ts
`);
}

/**
 * Simple confirm prompt
 */
async function confirm(message: string): Promise<boolean> {
  console.log(`${message} (y/n): `);

  for await (const line of console) {
    const answer = line.trim().toLowerCase();
    return answer === 'y' || answer === 'yes';
  }

  return false;
}

/**
 * Main CLI function
 */
async function main() {
  const options = parseArgs();

  // Determine the search query
  let searchQuery: string;
  if (options.preset) {
    if (!SEARCH_PRESETS[options.preset]) {
      logger.error(`Invalid preset: ${options.preset}`);
      console.log(`Available presets: ${Object.keys(SEARCH_PRESETS).join(", ")}`);
      process.exit(1);
    }
    searchQuery = SEARCH_PRESETS[options.preset].query;
    logger.info(`Using preset: ${options.preset} - ${SEARCH_PRESETS[options.preset].description}`);
  } else if (options.query) {
    searchQuery = options.query;
    logger.info(`Using custom query: ${searchQuery}`);
  } else {
    logger.info("No query specified. Using default crypto search.");
    searchQuery = SEARCH_PRESETS.crypto.query;
  }

  // Initialize the search client
  const searchClient = new GitHubSearchClient({
    searchTimeoutMs: 30000, // 30 seconds timeout
    excludeRepos: [
      ...options.excludeRepos,
      // Default exclusions
      "torvalds/linux",
      "microsoft/TypeScript",  // Usually not what we want
    ],
    excludeOrgs: [
      ...options.excludeOrgs,
      // Default exclusions for common non-crypto orgs
    ],
    excludeTopics: [
      ...options.excludeTopics,
      // Default exclusions
      "deprecated",
      "archived",
      "obsolete",
    ],
  });

  try {
    // Check rate limit before searching
    const rateLimit = await searchClient.checkRateLimit();

    if (rateLimit.remaining < 5) {
      const resetTime = new Date(rateLimit.reset * 1000);
      logger.warn(`Low rate limit remaining: ${rateLimit.remaining}. Resets at ${resetTime.toISOString()}`);

      const shouldContinue = await confirm("Rate limit is low. Continue anyway?");
      if (!shouldContinue) {
        logger.info("Search cancelled");
        process.exit(0);
      }
    }

    // Perform the search
    logger.info("Starting repository search...");
    const results = await searchClient.searchWithRetry(
      searchQuery,
      {
        maxResults: options.maxResults,
        sort: "stars",
        order: "desc",
      },
      3 // max retries
    );

    // Display results
    displayResults(results);

    // Save results if requested
    if (options.save) {
      const filename = await saveResults(
        results,
        options.preset || "custom"
      );
      logger.info(`✅ Search complete. Results saved to ${filename}`);
    } else {
      logger.info("✅ Search complete");
    }

    // Show final rate limit status
    const finalRateLimit = await searchClient.checkRateLimit();
    logger.info(`Rate limit remaining: ${finalRateLimit.remaining}/${finalRateLimit.limit}`);

  } catch (error) {
    if (error instanceof SearchTimeoutError) {
      logger.error("⏱️  Search timed out. Consider reducing the number of results or using a more specific query.");
    } else if (error instanceof RateLimitError) {
      logger.error("🚫 Rate limited by GitHub. Please wait before retrying.");
      const rateLimit = await searchClient.checkRateLimit();
      const resetTime = new Date(rateLimit.reset * 1000);
      logger.info(`Rate limit resets at: ${resetTime.toISOString()}`);
    } else if (error instanceof AbuseLimitError) {
      logger.error("⚠️  Abuse detection triggered. Please wait at least 1 minute before retrying.");
    } else {
      logger.error({ error }, "❌ Unexpected error occurred");
    }
    process.exit(1);
  }
}

// Run if this is the main module
if (import.meta.main) {
  main();
}