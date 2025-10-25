#!/usr/bin/env bun

import dotenv from "dotenv";
import { GitHubSearchClient } from "../src/lib/github";
import { logger } from "../src/lib/logger";
import { RateLimitError } from "../src/lib/errors";
import { classifyRepository } from "../src/lib/aztec-classifier";

// Load environment variables
dotenv.config();

interface TrackedRepo {
  url: string;
  sub_ecosystems: string[];
}

interface RepoResult {
  url: string;
  fullName: string;
  isAztec: boolean;
  nargoType: string;
  stars: number;
  description: string;
  nargoFilesChecked: number;
  aztecIndicators: string[];
  apiFailure?: {
    searchFailed: boolean;
    allFetchesFailed: boolean;
    reason: string;
  };
}

/**
 * Load already tracked repositories from Electric Capital export
 */
async function loadTrackedRepos(filePath: string): Promise<Set<string>> {
  const trackedUrls = new Set<string>();

  try {
    const fileContent = await Bun.file(filePath).text();
    const lines = fileContent.trim().split('\n');

    for (const line of lines) {
      try {
        const repo: TrackedRepo = JSON.parse(line);
        const normalizedUrl = repo.url.toLowerCase()
          .replace(/\.git$/, '')
          .replace(/\/$/, '');
        trackedUrls.add(normalizedUrl);

        const match = normalizedUrl.match(/github\.com\/([^\/]+\/[^\/]+)/);
        if (match) {
          trackedUrls.add(match[1].toLowerCase());
        }
      } catch (e) {
        logger.warn(`Failed to parse line: ${line}`);
      }
    }

    logger.info(`Loaded ${trackedUrls.size} tracked repositories from Electric Capital`);
  } catch (error) {
    logger.error({ error }, "Failed to load tracked repos file");
    throw error;
  }

  return trackedUrls;
}

/**
 * Search for repositories containing Nargo.toml files
 */
async function findNoirAztecRepos(trackedRepos: Set<string>): Promise<RepoResult[]> {
  const client = new GitHubSearchClient({
    searchTimeoutMs: 60000,
    excludeRepos: [],
    excludeOrgs: [],
    excludeTopics: []
  });

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN environment variable is required");
  }

  const results: RepoResult[] = [];
  const processedRepos = new Set<string>();

  try {
    logger.info("Searching for repositories with Nargo.toml files...");

    // Search queries to maximize coverage
    // IMPORTANT: GitHub limits each search to 1000 results, so we use multiple queries
    // to catch different subsets of repositories
    const searchQueries = [
      // Primary search - will hit 1000 limit but gets most repos
      'filename:Nargo.toml',

      // Aztec-specific searches to catch repos missed in general search
      'Nargo.toml aztec',
      'Nargo.toml "aztec.nr"',
      'Nargo.toml contract',
      'filename:Nargo.toml aztec',
      'filename:Nargo.toml "type = \\"contract\\""',

      // Date-based searches to get repos by creation time
      'filename:Nargo.toml created:>2024-06-01',
      'filename:Nargo.toml created:2024-01-01..2024-06-01',
      'filename:Nargo.toml created:2023-06-01..2024-01-01',
      'filename:Nargo.toml created:2023-01-01..2023-06-01',

      // Star-based searches to catch repos by popularity
      'filename:Nargo.toml stars:>50',
      'filename:Nargo.toml stars:10..50',
      'filename:Nargo.toml stars:1..10',

      // Organization-specific searches for known Aztec/Noir orgs
      'filename:Nargo.toml org:AztecProtocol',
      'filename:Nargo.toml org:noir-lang',

      // Language-specific searches
      'filename:Nargo.toml language:Rust',

      // Recent updates to catch active projects
      'filename:Nargo.toml pushed:>2024-06-01'
    ];

    logger.info(`Will run ${searchQueries.length} search queries to maximize coverage`);
    let totalSearchResults = 0;

    for (const query of searchQueries) {
      logger.info(`Searching with query: ${query} (processed ${processedRepos.size} unique repos so far)`);

      try {
        const searchResults = await client.searchCode(query, {
          maxResults: 1000
        });

        totalSearchResults += searchResults.length;
        logger.info(`Found ${searchResults.length} code results for query: ${query}`);

        for (const codeResult of searchResults) {
          const repoFullName = codeResult.repository.full_name.toLowerCase();

          // Skip if already processed
          if (processedRepos.has(repoFullName)) {
            continue;
          }
          processedRepos.add(repoFullName);

          // Skip if already tracked by Electric Capital
          const repoUrl = `https://github.com/${repoFullName}`;
          if (trackedRepos.has(repoFullName) || trackedRepos.has(repoUrl.toLowerCase())) {
            logger.debug(`Skipping already tracked repo: ${repoFullName}`);
            continue;
          }

          const [owner, repo] = repoFullName.split('/');

          // Use the shared classification logic
          logger.debug(`Analyzing repository ${repoFullName}...`);
          const classification = await classifyRepository(owner, repo, token);

          results.push({
            url: repoUrl,
            fullName: codeResult.repository.full_name,
            isAztec: classification.isAztec,
            nargoType: classification.nargoType,
            stars: codeResult.repository.stargazers_count || 0,
            description: codeResult.repository.description || '',
            nargoFilesChecked: classification.filesChecked,
            aztecIndicators: classification.aztecIndicators,
            apiFailure: classification.apiFailure
          });

          const repoType = classification.isAztec ? 'Aztec' : 'Noir';
          const indicators = classification.aztecIndicators.length > 0 ?
            ` [${classification.aztecIndicators.join('; ')}]` : '';
          const apiIssueWarning = classification.apiFailure ?
            ` ⚠️ API ISSUES: ${classification.apiFailure.reason}` : '';
          logger.info(`Found ${repoType} repo: ${repoFullName} (type: ${classification.nargoType}, checked ${classification.filesChecked} files)${indicators}${apiIssueWarning}`);

          // Rate limit pause
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Longer pause between search queries
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        if (error instanceof RateLimitError) {
          logger.warn("Rate limited, waiting before continuing...");
          await new Promise(resolve => setTimeout(resolve, 60000));
        } else {
          logger.error({ error }, `Failed to search with query: ${query}`);
        }
      }
    }

  } catch (error) {
    logger.error({ error }, "Error during repository search");
    throw error;
  }

  logger.info(`Search complete: Examined ${totalSearchResults} total search results, found ${processedRepos.size} unique repositories`);
  return results;
}

/**
 * Generate Electric Capital migration format
 */
function generateMigrationOutput(results: RepoResult[]): string {
  const lines: string[] = [];

  lines.push("# Electric Capital Migration Commands for Noir/Aztec Repositories");
  lines.push(`# Generated: ${new Date().toISOString()}`);
  lines.push(`# Total new repositories found: ${results.length}`);
  lines.push("");

  // Separate and sort
  const aztecRepos = results.filter(r => r.isAztec).sort((a, b) => b.stars - a.stars);
  const noirRepos = results.filter(r => !r.isAztec).sort((a, b) => b.stars - a.stars);

  // Add Aztec repositories
  if (aztecRepos.length > 0) {
    lines.push(`# Aztec Protocol Repositories (${aztecRepos.length} found)`);
    lines.push("# Repositories with type=contract or Aztec.nr dependencies");
    for (const repo of aztecRepos) {
      const desc = repo.description ? ` # ${repo.description.substring(0, 50)}` : '';
      const indicators = repo.aztecIndicators.length > 0 ?
        ` # Indicators: ${repo.aztecIndicators.join('; ')}` : '';
      lines.push(`repadd "Aztec Protocol" ${repo.url} #zkp #zk-circuit #noir #aztec${desc}`);
    }
    lines.push("");
  }

  // Add Noir repositories
  if (noirRepos.length > 0) {
    lines.push(`# Noir Lang Repositories (${noirRepos.length} found)`);
    lines.push("# Repositories with type=bin or type=lib (no Aztec dependencies)");
    for (const repo of noirRepos) {
      const desc = repo.description ? ` # ${repo.description.substring(0, 50)}` : '';
      lines.push(`repadd "Noir Lang" ${repo.url} #zkp #zk-circuit #noir #aztec${desc}`);
    }
  }

  return lines.join('\n');
}

/**
 * Main execution
 */
async function main() {
  try {
    logger.info("Starting Noir/Aztec repository discovery (v4 - using shared classifier)...");

    // Load already tracked repositories
    const trackedRepos = await loadTrackedRepos('./static/Aztec-Protocol-export.jsonl');

    // Find new repositories
    const newRepos = await findNoirAztecRepos(trackedRepos);

    if (newRepos.length === 0) {
      logger.info("No new repositories found");
      return;
    }

    // Generate migration output
    const migrationOutput = generateMigrationOutput(newRepos);

    // Save to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputPath = `output/electric-capital-migration-v4-${timestamp}.txt`;
    await Bun.write(outputPath, migrationOutput);

    logger.info(`Migration file saved to: ${outputPath}`);

    // Summary statistics
    const aztecCount = newRepos.filter(r => r.isAztec).length;
    const noirCount = newRepos.filter(r => !r.isAztec).length;
    const unknownCount = newRepos.filter(r => r.nargoType === 'unknown').length;
    const filesCheckedTotal = newRepos.reduce((sum, r) => sum + r.nargoFilesChecked, 0);

    // API failure statistics
    const apiFailureRepos = newRepos.filter(r => r.apiFailure);
    const searchFailedRepos = apiFailureRepos.filter(r => r.apiFailure?.searchFailed);
    const allFetchesFailedRepos = apiFailureRepos.filter(r => r.apiFailure?.allFetchesFailed);

    console.log("\n=== Summary (V4 - Shared Classifier with API Failure Tracking) ===");
    console.log(`Total repositories already tracked by Electric Capital: ${trackedRepos.size}`);
    console.log(`Total NEW repositories found: ${newRepos.length}`);
    console.log(`  - Aztec Protocol: ${aztecCount}`);
    console.log(`  - Noir Lang: ${noirCount}`);
    console.log(`  - Unknown type: ${unknownCount}`);

    if (apiFailureRepos.length > 0) {
      console.log(`\n⚠️  API Issues detected in ${apiFailureRepos.length} repositories:`);
      console.log(`  - Search API failed: ${searchFailedRepos.length}`);
      console.log(`  - All fetch attempts failed: ${allFetchesFailedRepos.length}`);
      console.log(`  These repos may be misclassified due to API issues!`);
    }

    console.log(`\nTotal Nargo.toml files analyzed: ${filesCheckedTotal}`);
    console.log(`Migration commands saved to: ${outputPath}`);

    // Save detailed JSON for analysis
    const jsonPath = `output/noir-aztec-repos-v4-${timestamp}.json`;
    await Bun.write(jsonPath, JSON.stringify(newRepos, null, 2));
    console.log(`Detailed results saved to: ${jsonPath}`);

    // Show some examples of repos that were classified as Aztec
    if (aztecCount > 0) {
      console.log("\nExample Aztec repositories found:");
      newRepos.filter(r => r.isAztec).slice(0, 5).forEach(repo => {
        console.log(`  - ${repo.fullName}: ${repo.aztecIndicators.join('; ')}`);
      });
    }

    // Show repos with API failures for manual review
    if (apiFailureRepos.length > 0) {
      console.log("\n⚠️  Repositories with API issues (need manual review):");
      apiFailureRepos.slice(0, 10).forEach(repo => {
        const classificationNote = repo.nargoType === 'unknown' ? ' [UNKNOWN - likely misclassified]' : '';
        console.log(`  - ${repo.fullName}: ${repo.apiFailure?.reason}${classificationNote}`);
      });
      if (apiFailureRepos.length > 10) {
        console.log(`  ... and ${apiFailureRepos.length - 10} more`);
      }
    }

  } catch (error) {
    logger.error({ error }, "Failed to complete repository discovery");
    process.exit(1);
  }
}

// Run the script
if (import.meta.main) {
  main();
}