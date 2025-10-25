#!/usr/bin/env bun

import dotenv from "dotenv";
import { GitHubSearchClient } from "../src/lib/github";
import { createFileLogger } from "../src/lib/logger";
import { RateLimitError } from "../src/lib/errors";
import { classifyRepository } from "../src/lib/aztec-classifier";
import { config } from "../src/lib/config";
import * as path from "path";
import * as fs from "fs";

// Load environment variables
dotenv.config();

// Create logger with file output if LOG_TO_FILE env is set
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

// Ensure logs directory exists if logging to file
if (process.env.LOG_TO_FILE === 'true') {
  if (!fs.existsSync('./logs')) {
    fs.mkdirSync('./logs', { recursive: true });
  }
}

const logFile = process.env.LOG_TO_FILE === 'true'
  ? path.join('./logs', `find-aztec-repos-${timestamp}.log`)
  : undefined;

const logger = logFile
  ? createFileLogger(logFile, process.env.LOG_LEVEL || "info", process.env.NODE_ENV !== "production")
  : createFileLogger(undefined, process.env.LOG_LEVEL || "info", process.env.NODE_ENV !== "production");

if (logFile) {
  logger.info({ logFile }, "Logging to file");
}

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
 * Returns an array of repo names in "owner/repo" format for GitHub API exclusion
 */
async function loadTrackedRepos(filePath: string): Promise<string[]> {
  const repoNames = new Set<string>();

  try {
    const fileContent = await Bun.file(filePath).text();
    const lines = fileContent.trim().split('\n');

    for (const line of lines) {
      try {
        const repo: TrackedRepo = JSON.parse(line);
        const normalizedUrl = repo.url.toLowerCase()
          .replace(/\.git$/, '')
          .replace(/\/$/, '');

        // Extract owner/repo format from GitHub URLs
        const match = normalizedUrl.match(/github\.com\/([^\/]+\/[^\/]+)/);
        if (match) {
          repoNames.add(match[1].toLowerCase());
        }
      } catch (e) {
        logger.warn(`Failed to parse line: ${line}`);
      }
    }

    logger.info(`Loaded ${repoNames.size} tracked repositories from Electric Capital`);
  } catch (error) {
    logger.error({ error }, "Failed to load tracked repos file");
    throw error;
  }

  return Array.from(repoNames);
}

/**
 * Search for repositories containing Nargo.toml files
 * Tracked repos are automatically excluded at the GitHub API level via search query filters
 */
async function findNoirAztecRepos(excludedRepoNames: string[]): Promise<RepoResult[]> {
  logger.info(`Initializing GitHub client with ${excludedRepoNames.length} excluded repos (filtered at API level)`);

  const client = new GitHubSearchClient({
    searchTimeoutMs: config.timeout.searchTimeout,
    excludeRepos: excludedRepoNames, // These repos will be filtered out by the API using -repo: filters
    excludeOrgs: [],
    excludeTopics: [],
    useTokenRotation: process.env.USE_TOKEN_ROTATION === 'true'
  });

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN environment variable is required");
  }

  const results: RepoResult[] = [];
  const processedRepos = new Set<string>();
  let totalSearchResults = 0; // Move this outside the try block

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
      'Nargo.toml contract',
      'filename:Nargo.toml aztec',
      'filename:Nargo.toml "type = \\"contract\\""',

      // Date-based searches - monthly granularity to avoid 1k limit
      // 2025 (current year up to end of year)
      'filename:Nargo.toml created:2025-10-01..2026-01-01',
      'filename:Nargo.toml created:2025-09-01..2025-10-01',
      'filename:Nargo.toml created:2025-08-01..2025-09-01',
      'filename:Nargo.toml created:2025-07-01..2025-08-01',
      'filename:Nargo.toml created:2025-06-01..2025-07-01',
      'filename:Nargo.toml created:2025-05-01..2025-06-01',
      'filename:Nargo.toml created:2025-04-01..2025-05-01',
      'filename:Nargo.toml created:2025-03-01..2025-04-01',
      'filename:Nargo.toml created:2025-02-01..2025-03-01',
      'filename:Nargo.toml created:2025-01-01..2025-02-01',

      // 2024
      'filename:Nargo.toml created:2024-12-01..2025-01-01',
      'filename:Nargo.toml created:2024-11-01..2024-12-01',
      'filename:Nargo.toml created:2024-10-01..2024-11-01',
      'filename:Nargo.toml created:2024-09-01..2024-10-01',
      'filename:Nargo.toml created:2024-08-01..2024-09-01',
      'filename:Nargo.toml created:2024-07-01..2024-08-01',
      'filename:Nargo.toml created:2024-06-01..2024-07-01',
      'filename:Nargo.toml created:2024-05-01..2024-06-01',
      'filename:Nargo.toml created:2024-04-01..2024-05-01',
      'filename:Nargo.toml created:2024-03-01..2024-04-01',
      'filename:Nargo.toml created:2024-02-01..2024-03-01',
      'filename:Nargo.toml created:2024-01-01..2024-02-01',

      // 2023
      'filename:Nargo.toml created:2023-12-01..2024-01-01',
      'filename:Nargo.toml created:2023-11-01..2023-12-01',
      'filename:Nargo.toml created:2023-10-01..2023-11-01',
      'filename:Nargo.toml created:2023-09-01..2023-10-01',
      'filename:Nargo.toml created:2023-08-01..2023-09-01',
      'filename:Nargo.toml created:2023-07-01..2023-08-01',
      'filename:Nargo.toml created:2023-06-01..2023-07-01',
      'filename:Nargo.toml created:2023-05-01..2023-06-01',
      'filename:Nargo.toml created:2023-04-01..2023-05-01',
      'filename:Nargo.toml created:2023-03-01..2023-04-01',
      'filename:Nargo.toml created:2023-02-01..2023-03-01',
      'filename:Nargo.toml created:2023-01-01..2023-02-01',

      // Pre-2023 (quarterly to cover older repos)
      'filename:Nargo.toml created:2022-10-01..2023-01-01',
      'filename:Nargo.toml created:2022-07-01..2022-10-01',
      'filename:Nargo.toml created:2022-04-01..2022-07-01',
      'filename:Nargo.toml created:2022-01-01..2022-04-01',
      'filename:Nargo.toml created:2021-01-01..2022-01-01',
      'filename:Nargo.toml created:<2021-01-01',

      // Star-based searches to catch repos by popularity
      'filename:Nargo.toml stars:>50',
      'filename:Nargo.toml stars:10..50',
      'filename:Nargo.toml stars:1..10',

      // Organization-specific searches for known Aztec/Noir orgs
      'filename:Nargo.toml org:AztecProtocol',
      'filename:Nargo.toml org:noir-lang',

      // Language-specific searches
      'filename:Nargo.toml language:Noir',
      // 'filename:Nargo.toml language:Rust',

      // Recent updates to catch active projects
      'filename:Nargo.toml pushed:>2024-06-01'
    ];

    logger.info(`Will run ${searchQueries.length} search queries to maximize coverage`);

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

          // Note: Tracked repos are already excluded at the API level via -repo: filters
          // No need for manual checking here

          const repoUrl = `https://github.com/${repoFullName}`;
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
          await new Promise(resolve => setTimeout(resolve, config.rateLimit.repoProcessingDelay));
        }

        // Longer pause between search queries
        await new Promise(resolve => setTimeout(resolve, config.rateLimit.searchQueryDelay));

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
      lines.push(`repadd "Aztec Protocol" ${repo.url} #zkp #zk-circuit #noir #aztec`);
    }
    lines.push("");
  }

  // Add Noir repositories
  if (noirRepos.length > 0) {
    lines.push(`# Noir Lang Repositories (${noirRepos.length} found)`);
    lines.push("# Repositories with type=bin or type=lib (no Aztec dependencies)");
    for (const repo of noirRepos) {
      lines.push(`repadd "Noir Lang" ${repo.url} #zkp #zk-circuit #noir #aztec`);
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

    // Ensure output directory exists
    if (!fs.existsSync('./output')) {
      fs.mkdirSync('./output', { recursive: true });
      logger.info("Created output directory");
    }

    // Load already tracked repositories
    const excludedRepoNames = await loadTrackedRepos('./static/Aztec-Protocol-export.jsonl');

    // Find new repositories (tracked repos are excluded at API level)
    const newRepos = await findNoirAztecRepos(excludedRepoNames);

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
    console.log(`Total repositories already tracked by Electric Capital: ${excludedRepoNames.length}`);
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

    // Log file location message
    if (logFile) {
      console.log(`\n📝 Full log saved to: ${logFile}`);
    }

  } catch (error) {
    logger.error({
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : error
    }, "Failed to complete repository discovery");
    if (logFile) {
      console.log(`\n📝 Error log saved to: ${logFile}`);
    }
    console.error("Error details:", error);
    process.exit(1);
  }
}

// Run the script
if (import.meta.main) {
  main();
}