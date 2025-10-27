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
  projectType: 'noir' | 'npm' | 'unknown';  // Changed from nargoType
  nargoType?: string;  // Optional, only for Noir projects
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
 * Returns repo names and major orgs for exclusion
 */
async function loadTrackedRepos(filePath: string): Promise<{
  repoNames: string[];
  majorOrgs: string[];
}> {
  const repoNames = new Set<string>();
  const orgCounts = new Map<string, number>();

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
          const fullName = match[1].toLowerCase();
          repoNames.add(fullName);

          // Count repos per org
          const org = fullName.split('/')[0];
          orgCounts.set(org, (orgCounts.get(org) || 0) + 1);
        }
      } catch (e) {
        logger.warn(`Failed to parse line: ${line}`);
      }
    }

    // Get top orgs that have many repos
    const majorOrgs = Array.from(orgCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5) // Top 5 orgs
      .filter(([_, count]) => count >= 10) // Only orgs with 10+ repos
      .map(([org]) => org);

    logger.info(`Loaded ${repoNames.size} tracked repositories from Electric Capital`);
    logger.info(`Major orgs to exclude: ${majorOrgs.join(', ')} (${majorOrgs.reduce((sum, org) => sum + (orgCounts.get(org) || 0), 0)} repos total)`);

    return {
      repoNames: Array.from(repoNames),
      majorOrgs
    };
  } catch (error) {
    logger.error({ error }, "Failed to load tracked repos file");
    throw error;
  }
}

/**
 * Build org exclusion string that fits within query limits
 */
function buildOrgExclusions(majorOrgs: string[], maxLength: number = 100): string {
  let exclusions = '';

  for (const org of majorOrgs) {
    const addition = ` -org:${org} -user:${org}`;
    // Check if adding this would exceed our budget
    if (exclusions.length + addition.length > maxLength) {
      break;
    }
    exclusions += addition;
  }

  return exclusions;
}

/**
 * Search for Aztec ecosystem repositories including:
 * - Noir language projects (with Nargo.toml files)
 * - JavaScript/TypeScript projects using Aztec npm packages
 * Now with org exclusions at API level for better efficiency
 */
async function findNoirAztecRepos(
  excludedRepoNames: string[],
  majorOrgs: string[]
): Promise<RepoResult[]> {
  logger.info(`Loaded ${excludedRepoNames.length} tracked repos for post-filtering`);

  // Build org exclusions that fit within query limits
  const orgExclusions = buildOrgExclusions(majorOrgs);
  if (orgExclusions) {
    logger.info(`Will exclude at API level: ${orgExclusions}`);
  }

  const client = new GitHubSearchClient({
    searchTimeoutMs: config.timeout.searchTimeout,
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
    logger.info("Searching for Aztec ecosystem repositories (Noir contracts and npm package users)...");

    // Search queries to maximize coverage
    // IMPORTANT: GitHub limits each search to 1000 results, so we use multiple queries
    // to catch different subsets of repositories
    // NOW WITH ORG EXCLUSIONS to get more NEW repos per search!

    // Add org exclusions to each query (being careful about length limits)
    const searchQueries = [
      // Primary search - will hit 1000 limit but gets most repos
      `filename:Nargo.toml${orgExclusions}`,

      // Aztec-specific searches to catch repos missed in general search
      `Nargo.toml aztec${orgExclusions}`,
      `Nargo.toml contract${orgExclusions}`,
      `filename:Nargo.toml aztec${orgExclusions}`,
      `filename:Nargo.toml "type = \\"contract\\""${orgExclusions}`,

      // Date-based searches - monthly granularity to avoid 1k limit
      // 2025 (current year up to end of year) - add exclusions to recent dates
      `filename:Nargo.toml created:2025-10-01..2026-01-01${orgExclusions}`,
      `filename:Nargo.toml created:2025-09-01..2025-10-01${orgExclusions}`,
      `filename:Nargo.toml created:2025-08-01..2025-09-01${orgExclusions}`,
      `filename:Nargo.toml created:2025-07-01..2025-08-01${orgExclusions}`,
      `filename:Nargo.toml created:2025-06-01..2025-07-01${orgExclusions}`,
      'filename:Nargo.toml created:2025-05-01..2025-06-01',
      'filename:Nargo.toml created:2025-04-01..2025-05-01',
      'filename:Nargo.toml created:2025-03-01..2025-04-01',
      'filename:Nargo.toml created:2025-02-01..2025-03-01',
      'filename:Nargo.toml created:2025-01-01..2025-02-01',

      // 2024 - add exclusions to recent months
      `filename:Nargo.toml created:2024-12-01..2025-01-01${orgExclusions}`,
      `filename:Nargo.toml created:2024-11-01..2024-12-01${orgExclusions}`,
      `filename:Nargo.toml created:2024-10-01..2024-11-01${orgExclusions}`,
      `filename:Nargo.toml created:2024-09-01..2024-10-01${orgExclusions}`,
      `filename:Nargo.toml created:2024-08-01..2024-09-01${orgExclusions}`,
      `filename:Nargo.toml created:2024-07-01..2024-08-01${orgExclusions}`,
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
      `filename:Nargo.toml pushed:>2024-06-01${orgExclusions}`,

      // ========================================
      // NPM PACKAGE USERS (JavaScript/TypeScript)
      // ========================================
      // Classification priority:
      // 1. If ANY @aztec packages → Aztec project (even if also has @noir-lang)
      // 2. If ONLY @noir-lang packages → Noir project
      // This is because Aztec projects often use both packages together

      // Search for Aztec packages in package.json files
      `filename:package.json "@aztec/aztec"${orgExclusions}`,
      `filename:package.json "@aztec/aztec.js"${orgExclusions}`,
      `filename:package.json "@aztec/accounts"${orgExclusions}`,
      `filename:package.json "@aztec/aztec-sandbox"${orgExclusions}`,
      `filename:package.json "@aztec/sdk"${orgExclusions}`,
      `filename:package.json "@aztec/circuits"${orgExclusions}`,
      `filename:package.json "@aztec/foundation"${orgExclusions}`,
      `filename:package.json "@aztec/noir-contracts"${orgExclusions}`,

      // Search for Noir packages in package.json files
      `filename:package.json "@noir-lang"${orgExclusions}`,
      `filename:package.json "@noir-lang/noir_js"${orgExclusions}`,
      `filename:package.json "@noir-lang/backend_barretenberg"${orgExclusions}`,
      `filename:package.json "@noir-lang/acvm_js"${orgExclusions}`,
      `filename:package.json "@noir-lang/types"${orgExclusions}`,

      // Search for imports in TypeScript/JavaScript files
      '"@aztec/aztec" language:typescript',
      '"@aztec/aztec" language:javascript',
      '"from \'@aztec" language:typescript',
      '"require(\'@aztec" language:javascript',

      // Search for Noir imports
      '"@noir-lang" language:typescript',
      '"@noir-lang" language:javascript',
      '"from \'@noir-lang" language:typescript',
      '"require(\'@noir-lang" language:javascript',

      // Search for specific Aztec contract imports
      '"@aztec/noir-contracts" extension:ts',
      '"@aztec/accounts" extension:ts',
      '"aztec.js" "createAccount" language:typescript',

      // Search for Aztec-specific code patterns
      '"AztecAddress" language:typescript',
      '"deployL2Contract" language:typescript',
      '"createPXEClient" language:typescript',
      '"createWallet" "@aztec" language:typescript',

      // Search for Aztec in specific periods (npm packages are newer)
      'filename:package.json "@aztec" created:>2024-01-01',
      'filename:package.json "@aztec" pushed:>2024-06-01',
      '"@aztec/aztec" created:>2023-06-01'
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

          // Check if this is a tracked repo (post-search filtering)
          if (excludedRepoNames.includes(repoFullName)) {
            logger.debug(`Skipping tracked repo: ${repoFullName}`);
            continue;
          }

          const repoUrl = `https://github.com/${repoFullName}`;
          const [owner, repo] = repoFullName.split('/');

          // Determine if this is a Noir project or npm package user
          const isNpmSearch = query.includes('package.json') ||
                             query.includes('@aztec') ||
                             query.includes('@noir-lang') ||
                             query.includes('typescript') ||
                             query.includes('javascript');

          if (isNpmSearch) {
            // Determine if it's Aztec or Noir npm packages based on the search query
            // Priority: If ANY @aztec package is found, it's an Aztec project
            // Only classify as Noir if ONLY @noir-lang packages are found

            const hasAztecPackage = query.includes('@aztec') ||
                                   query.includes('AztecAddress') ||
                                   query.includes('createPXEClient') ||
                                   query.includes('deployL2Contract') ||
                                   query.includes('createWallet');
            const hasNoirPackage = query.includes('@noir-lang');

            // Aztec takes precedence - if any Aztec packages are found, it's an Aztec project
            // This is because Aztec projects often use both @aztec and @noir-lang packages
            const isAztec = hasAztecPackage;

            let indicators: string[];
            if (hasAztecPackage && hasNoirPackage) {
              indicators = ['Uses Aztec npm packages', 'Uses Noir npm packages'];
            } else if (hasAztecPackage) {
              indicators = ['Uses Aztec npm packages'];
            } else if (hasNoirPackage) {
              indicators = ['Uses Noir npm packages (no Aztec dependencies)'];
            } else {
              // For general searches, default to Aztec since they're more likely in pattern searches
              indicators = ['Uses related npm packages'];
            }

            logger.debug(`Found npm package user: ${repoFullName} (${isAztec ? 'Aztec' : 'Noir'}) - Query: ${query}`);

            results.push({
              url: repoUrl,
              fullName: codeResult.repository.full_name,
              isAztec: isAztec,
              projectType: 'npm',
              stars: codeResult.repository.stargazers_count || 0,
              description: codeResult.repository.description || '',
              nargoFilesChecked: 0,
              aztecIndicators: indicators,
              apiFailure: undefined
            });

            const ecosystem = isAztec ? 'Aztec' : 'Noir';
            logger.info(`Found ${ecosystem} npm project: ${repoFullName} (${indicators.join(', ')})`);
          } else {
            // Use the shared classification logic for Noir projects
            logger.debug(`Analyzing Noir repository ${repoFullName}...`);
            const classification = await classifyRepository(owner, repo, token);

            results.push({
              url: repoUrl,
              fullName: codeResult.repository.full_name,
              isAztec: classification.isAztec,
              projectType: 'noir',
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
            logger.info(`Found ${repoType} Noir repo: ${repoFullName} (type: ${classification.nargoType}, checked ${classification.filesChecked} files)${indicators}${apiIssueWarning}`);
          }

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

  lines.push("# Electric Capital Migration Commands for Aztec Ecosystem Repositories");
  lines.push(`# Generated: ${new Date().toISOString()}`);
  lines.push(`# Total new repositories found: ${results.length}`);
  lines.push("");

  // Separate by project type and Aztec affiliation
  const aztecNoirRepos = results.filter(r => r.isAztec && r.projectType === 'noir').sort((a, b) => b.stars - a.stars);
  const aztecNpmRepos = results.filter(r => r.isAztec && r.projectType === 'npm').sort((a, b) => b.stars - a.stars);
  const pureNoirRepos = results.filter(r => !r.isAztec && r.projectType === 'noir').sort((a, b) => b.stars - a.stars);
  const noirNpmRepos = results.filter(r => !r.isAztec && r.projectType === 'npm').sort((a, b) => b.stars - a.stars);

  // Add Aztec Noir repositories
  if (aztecNoirRepos.length > 0) {
    lines.push(`# Aztec Protocol - Noir Contracts (${aztecNoirRepos.length} found)`);
    lines.push("# Repositories with Noir contracts using Aztec.nr");
    for (const repo of aztecNoirRepos) {
      lines.push(`repadd "Aztec Protocol" ${repo.url} #zkp #zk-circuit #noir #aztec`);
    }
    lines.push("");
  }

  // Add Aztec npm package users
  if (aztecNpmRepos.length > 0) {
    lines.push(`# Aztec Protocol - JavaScript/TypeScript Projects (${aztecNpmRepos.length} found)`);
    lines.push("# Repositories using Aztec npm packages (@aztec/*)");
    lines.push("# Note: May also include @noir-lang packages as Aztec builds on Noir");
    for (const repo of aztecNpmRepos) {
      lines.push(`repadd "Aztec Protocol" ${repo.url} #zkp #aztec #javascript #typescript`);
    }
    lines.push("");
  }

  // Add pure Noir repositories
  if (pureNoirRepos.length > 0) {
    lines.push(`# Noir Lang - Pure Noir Projects (${pureNoirRepos.length} found)`);
    lines.push("# Repositories using Noir without Aztec dependencies");
    for (const repo of pureNoirRepos) {
      lines.push(`repadd "Noir Lang" ${repo.url} #zkp #zk-circuit #noir`);
    }
    lines.push("");
  }

  // Add Noir npm package users
  if (noirNpmRepos.length > 0) {
    lines.push(`# Noir Lang - JavaScript/TypeScript Projects (${noirNpmRepos.length} found)`);
    lines.push("# Repositories using ONLY Noir npm packages (@noir-lang/*), no Aztec dependencies");
    for (const repo of noirNpmRepos) {
      lines.push(`repadd "Noir Lang" ${repo.url} #zkp #noir #javascript #typescript`);
    }
  }

  return lines.join('\n');
}

/**
 * Main execution
 */
async function main() {
  try {
    logger.info("Starting Aztec/Noir ecosystem discovery (including npm packages)...");

    // Ensure output directory exists
    if (!fs.existsSync('./output')) {
      fs.mkdirSync('./output', { recursive: true });
      logger.info("Created output directory");
    }

    // Load already tracked repositories and major orgs
    const { repoNames: excludedRepoNames, majorOrgs } = await loadTrackedRepos('./static/Aztec-Protocol-export.jsonl');

    // Find new repositories (major orgs excluded at API level, rest filtered post-search)
    const newRepos = await findNoirAztecRepos(excludedRepoNames, majorOrgs);

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
    const aztecNoirCount = newRepos.filter(r => r.isAztec && r.projectType === 'noir').length;
    const aztecNpmCount = newRepos.filter(r => r.isAztec && r.projectType === 'npm').length;
    const pureNoirCount = newRepos.filter(r => !r.isAztec && r.projectType === 'noir').length;
    const noirNpmCount = newRepos.filter(r => !r.isAztec && r.projectType === 'npm').length;
    const unknownCount = newRepos.filter(r => r.projectType === 'unknown').length;
    const filesCheckedTotal = newRepos.reduce((sum, r) => sum + r.nargoFilesChecked, 0);

    // API failure statistics
    const apiFailureRepos = newRepos.filter(r => r.apiFailure);
    const searchFailedRepos = apiFailureRepos.filter(r => r.apiFailure?.searchFailed);
    const allFetchesFailedRepos = apiFailureRepos.filter(r => r.apiFailure?.allFetchesFailed);

    console.log("\n=== Summary - Aztec/Noir Ecosystem Discovery ===");
    console.log(`Total repositories already tracked by Electric Capital: ${excludedRepoNames.length}`);
    console.log(`Total NEW repositories found: ${newRepos.length}`);
    console.log(`\nBreakdown by ecosystem and type:`);
    console.log(`  Aztec Protocol:`);
    console.log(`    - Noir Contracts: ${aztecNoirCount}`);
    console.log(`    - JS/TS Projects: ${aztecNpmCount}`);
    console.log(`  Noir Lang:`);
    console.log(`    - Pure Noir Projects: ${pureNoirCount}`);
    console.log(`    - JS/TS Projects: ${noirNpmCount}`);
    if (unknownCount > 0) {
      console.log(`  - Unknown type: ${unknownCount}`);
    }

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

    // Show some examples of repos by type
    if (aztecNoirCount > 0) {
      console.log("\nExample Aztec Noir contracts found:");
      newRepos.filter(r => r.isAztec && r.projectType === 'noir').slice(0, 3).forEach(repo => {
        console.log(`  - ${repo.fullName}: ${repo.aztecIndicators.join('; ')}`);
      });
    }

    if (aztecNpmCount > 0) {
      console.log("\nExample Aztec JS/TS projects found:");
      newRepos.filter(r => r.isAztec && r.projectType === 'npm').slice(0, 3).forEach(repo => {
        console.log(`  - ${repo.fullName}: ${repo.aztecIndicators.join(', ')}`);
      });
    }

    if (noirNpmCount > 0) {
      console.log("\nExample Noir JS/TS projects found:");
      newRepos.filter(r => !r.isAztec && r.projectType === 'npm').slice(0, 3).forEach(repo => {
        console.log(`  - ${repo.fullName}: ${repo.aztecIndicators.join(', ')}`);
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