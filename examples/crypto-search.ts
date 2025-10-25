/**
 * Example script: Search for crypto/blockchain repositories
 * This demonstrates how to use the search module for scripting
 */

import {
  searchWithPreset,
  searchRepositories,
  searchByTopics,
  searchRecent,
  searchByOrg,
  createSearchClient,
  displayResults,
  saveResults,
  exportToCSV,
  SEARCH_PRESETS
} from "../search";
import { logger } from "../src/lib/logger";

async function main() {
  logger.info("Starting crypto ecosystem search...");

  // 1. Search using the crypto preset
  logger.info("\n=== Searching top crypto/blockchain projects ===");
  const cryptoRepos = await searchWithPreset("crypto", {
    maxResults: 30,
    save: true
  });
  displayResults(cryptoRepos, 5);

  // 2. Search for DeFi specific projects
  logger.info("\n=== Searching DeFi projects ===");
  const defiRepos = await searchRepositories(
    "defi OR \"decentralized finance\" OR amm OR \"automated market maker\" language:typescript stars:>50",
    {
      maxResults: 20,
      save: true,
      savePrefix: "defi-specific"
    }
  );
  logger.info(`Found ${defiRepos.length} DeFi repositories`);

  // 3. Search by specific blockchain topics
  logger.info("\n=== Searching by blockchain topics ===");
  const topicRepos = await searchByTopics(
    ["ethereum", "smart-contracts", "solidity"],
    {
      language: "javascript",
      maxResults: 15,
      save: true
    }
  );
  logger.info(`Found ${topicRepos.length} repositories with specified topics`);

  // 4. Find recently active Web3 projects (last 30 days)
  logger.info("\n=== Searching recently active Web3 projects ===");
  const recentRepos = await searchRecent(
    "web3 OR blockchain",
    30, // days ago
    {
      maxResults: 20,
      sort: "updated"
    }
  );
  logger.info(`Found ${recentRepos.length} recently updated repositories`);

  // 5. Search specific prominent crypto organizations
  logger.info("\n=== Searching prominent crypto organizations ===");
  const orgs = ["ethereum", "cosmos", "polkadot-js", "chainlink"];

  for (const org of orgs) {
    try {
      const orgRepos = await searchByOrg(org, {
        minStars: 10,
        maxResults: 5
      });
      logger.info(`${org}: Found ${orgRepos.length} repositories`);
    } catch (error) {
      logger.warn(`Could not search org ${org}: ${error}`);
    }
  }

  // 6. Custom search with specific exclusions
  logger.info("\n=== Custom search with exclusions ===");
  const client = createSearchClient({
    excludeOrgs: ["facebook", "google", "microsoft"],
    excludeTopics: ["deprecated", "tutorial", "example"],
    excludeRepos: ["DefinitelyTyped/DefinitelyTyped"]
  });

  const customRepos = await client.searchRepositories(
    "nft OR \"non-fungible token\" language:rust stars:>20",
    {
      maxResults: 15,
      sort: "stars"
    }
  );
  logger.info(`Found ${customRepos.length} NFT repositories in Rust`);

  // 7. Combine and export all results
  logger.info("\n=== Exporting combined results ===");
  const allResults = [
    ...cryptoRepos,
    ...defiRepos,
    ...topicRepos,
    ...recentRepos,
    ...customRepos
  ];

  // Remove duplicates based on full name
  const uniqueResults = Array.from(
    new Map(allResults.map(repo => [repo.fullName, repo])).values()
  );

  await exportToCSV(uniqueResults, "crypto-ecosystem-complete.csv");
  await saveResults(uniqueResults, "crypto-ecosystem-complete");

  logger.info(`\n✅ Search complete! Found ${uniqueResults.length} unique repositories`);

  // Show rate limit status
  const rateLimit = await client.checkRateLimit();
  logger.info(`Rate limit remaining: ${rateLimit.remaining}/${rateLimit.limit}`);
}

// Run the script
main().catch(error => {
  logger.error({ error }, "Script failed");
  process.exit(1);
});