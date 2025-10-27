#!/usr/bin/env bun

/**
 * IMPROVED Noir and Aztec Repository Discovery Script
 *
 * Key improvements:
 * 1. Excludes major orgs at API level (fits in query limit)
 * 2. Uses date-based searches to avoid old tracked repos
 * 3. Gets MORE new repos per search (avoids 1k limit waste)
 */

import { GitHubSearchClient } from '../src/lib/github/search-client';
import { config } from '../src/lib/config';
import { logger } from '../src/lib/logger';
import { classifyRepository, type ClassificationResult } from '../src/lib/aztec-classifier';
import type { ClassificationDetails } from '../src/lib/aztec-classifier';

interface TrackedRepo {
  url: string;
  sub_ecosystems: string[];
}

interface RepoResult {
  url: string;
  name: string;
  owner: string;
  stars: number;
  description: string | null;
  classification: ClassificationResult;
  classificationDetails?: ClassificationDetails;
}

/**
 * Analyze tracked repos to find major organizations to exclude
 */
async function analyzeTrackedRepos(filePath: string): Promise<{
  totalRepos: number;
  majorOrgs: string[];
  reposByOrg: Map<string, number>;
}> {
  const reposByOrg = new Map<string, number>();

  try {
    const fileContent = await Bun.file(filePath).text();
    const lines = fileContent.trim().split('\n');

    for (const line of lines) {
      try {
        const repo: TrackedRepo = JSON.parse(line);
        const match = repo.url.match(/github\.com\/([^\/]+)\//);
        if (match) {
          const org = match[1].toLowerCase();
          reposByOrg.set(org, (reposByOrg.get(org) || 0) + 1);
        }
      } catch (e) {
        // Skip invalid lines
      }
    }

    // Sort orgs by repo count
    const sortedOrgs = Array.from(reposByOrg.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10) // Top 10 orgs
      .map(([org]) => org);

    logger.info(`Tracked repos analysis:
    - Total: ${lines.length} repos
    - Unique orgs: ${reposByOrg.size}
    - Top org: ${sortedOrgs[0]} with ${reposByOrg.get(sortedOrgs[0])} repos`);

    return {
      totalRepos: lines.length,
      majorOrgs: sortedOrgs,
      reposByOrg
    };
  } catch (error) {
    logger.error({ error }, "Failed to analyze tracked repos");
    throw error;
  }
}

/**
 * Build optimized search queries that exclude major orgs
 */
function buildOptimizedQueries(majorOrgs: string[]): string[] {
  // Take top orgs that fit in query limit (~200 chars to be safe)
  const orgsToExclude: string[] = [];
  let queryLength = 30; // Base query length estimate

  for (const org of majorOrgs) {
    const exclusion = ` -org:${org} -user:${org}`;
    if (queryLength + exclusion.length < 200) {
      orgsToExclude.push(org);
      queryLength += exclusion.length;
    } else {
      break;
    }
  }

  const orgExclusions = orgsToExclude
    .map(org => `-org:${org} -user:${org}`)
    .join(' ');

  logger.info(`Excluding ${orgsToExclude.length} major orgs at API level: ${orgsToExclude.join(', ')}`);

  const queries: string[] = [
    // === RECENT ACTIVITY (avoids old tracked repos) ===
    `filename:Nargo.toml pushed:>2024-09-01 ${orgExclusions}`,
    `filename:Nargo.toml pushed:2024-06-01..2024-09-01 ${orgExclusions}`,
    `filename:Nargo.toml created:>2024-06-01 ${orgExclusions}`,
    `filename:Nargo.toml created:2024-01-01..2024-06-01 ${orgExclusions}`,

    // === NPM PACKAGES (recent adoption) ===
    `filename:package.json "@aztec" created:>2024-01-01 ${orgExclusions}`,
    `filename:package.json "@noir-lang" created:>2024-01-01 ${orgExclusions}`,
    `filename:package.json "@aztec/aztec.js" ${orgExclusions}`,
    `filename:package.json "@noir-lang/noir_js" ${orgExclusions}`,

    // === NEW CODE PATTERNS ===
    `"aztec::context::Context" language:rust ${orgExclusions}`,
    `"use aztec::prelude" ${orgExclusions}`,
    `"#[aztec(private)]" ${orgExclusions}`,
    `"from aztec.context import Context" ${orgExclusions}`,

    // === CATCH REMAINING (without date filters) ===
    `filename:Nargo.toml ${orgExclusions}`,
    `"Nargo.toml" aztec ${orgExclusions}`,
    `"Nargo.toml" noir ${orgExclusions}`,
  ];

  return queries;
}

/**
 * Main discovery function with improved strategy
 */
async function findNoirAztecReposV2(): Promise<void> {
  const startTime = Date.now();
  logger.info("Starting IMPROVED Noir/Aztec repository discovery");

  // Analyze tracked repos to find major orgs
  const { majorOrgs, reposByOrg } = await analyzeTrackedRepos(
    'static/Aztec-Protocol-export.jsonl'
  );

  // Build optimized queries
  const searchQueries = buildOptimizedQueries(majorOrgs);

  // Initialize GitHub client (exclusions are handled in query construction)
  const client = new GitHubSearchClient({
    searchTimeoutMs: config.timeout.searchTimeout,
    useTokenRotation: process.env.USE_TOKEN_ROTATION === 'true'
  });

  const allResults: RepoResult[] = [];
  const processedRepos = new Set<string>();
  let totalSearchResults = 0;
  let newReposFound = 0;

  logger.info(`Will run ${searchQueries.length} optimized search queries`);

  for (const query of searchQueries) {
    logger.info(`\nSearching: ${query}`);
    logger.info(`Progress: ${processedRepos.size} unique repos, ${newReposFound} new repos found`);

    try {
      const searchResults = await client.searchCode(query, {
        maxResults: 1000
      });

      totalSearchResults += searchResults.length;
      let queryNewRepos = 0;

      for (const codeResult of searchResults) {
        const repoFullName = codeResult.repository.full_name.toLowerCase();

        // Skip if already processed
        if (processedRepos.has(repoFullName)) {
          continue;
        }
        processedRepos.add(repoFullName);

        // Check if this is a tracked repo (that wasn't excluded by query)
        const org = repoFullName.split('/')[0];
        if (reposByOrg.has(org) && majorOrgs.slice(0, 5).includes(org)) {
          // This shouldn't happen if our exclusions worked
          logger.warn(`Found tracked org ${org} that should have been excluded`);
          continue;
        }

        const repoUrl = `https://github.com/${repoFullName}`;
        const [owner, repo] = repoFullName.split('/');

        // Determine classification based on search context
        const isNpmSearch = query.includes('package.json') || query.includes('@aztec') || query.includes('@noir-lang');
        const hasAztecPattern = query.includes('@aztec') || query.includes('aztec::') || query.includes('#[aztec');
        const hasNoirPattern = query.includes('@noir-lang') && !hasAztecPattern;

        let classification: ClassificationResult = 'unknown';
        let classificationDetails: ClassificationDetails | undefined;

        if (isNpmSearch) {
          classification = hasAztecPattern ? 'aztec' : hasNoirPattern ? 'noir' : 'unknown';
        } else {
          // Try to classify based on Nargo.toml
          const result = await classifyRepository(owner, repo);
          classification = result.classification;
          classificationDetails = result.details;
        }

        if (classification !== 'unknown') {
          queryNewRepos++;
          newReposFound++;

          allResults.push({
            url: repoUrl,
            name: repo,
            owner,
            stars: codeResult.repository.stargazers_count || 0,
            description: codeResult.repository.description,
            classification,
            classificationDetails
          });
        }
      }

      logger.info(`Query complete: ${searchResults.length} results, ${queryNewRepos} new classified repos`);

      // Add delay between searches
      if (searchQueries.indexOf(query) < searchQueries.length - 1) {
        await new Promise(resolve => setTimeout(resolve, config.rateLimit.searchQueryDelay));
      }

    } catch (error) {
      logger.error({ error }, `Failed to search with query: ${query}`);
    }
  }

  // Generate output files
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  // Generate migration file
  const migrationFile = `output/electric-capital-migration-v5-${timestamp}.txt`;
  const aztecRepos = allResults.filter(r => r.classification === 'aztec');
  const noirRepos = allResults.filter(r => r.classification === 'noir');

  let migrationContent = `# Electric Capital Migration Commands for Noir/Aztec Repositories
# Generated: ${new Date().toISOString()}
# Strategy: Optimized search with major org exclusions
# Total new repositories found: ${allResults.length}

# Aztec Protocol Repositories (${aztecRepos.length} found)
`;

  for (const repo of aztecRepos) {
    migrationContent += `repadd "Aztec Protocol" ${repo.url} #aztec #noir #zk-circuit #zkp\n`;
  }

  migrationContent += `\n# Noir Lang Repositories (${noirRepos.length} found)\n`;

  for (const repo of noirRepos) {
    migrationContent += `repadd "Noir Lang" ${repo.url} #aztec #noir #zk-circuit #zkp\n`;
  }

  await Bun.write(migrationFile, migrationContent);

  // Generate detailed JSON file
  const jsonFile = `output/noir-aztec-repos-v5-${timestamp}.json`;
  await Bun.write(jsonFile, JSON.stringify(allResults, null, 2));

  // Final statistics
  const elapsed = Date.now() - startTime;
  const minutes = Math.floor(elapsed / 60000);
  const seconds = ((elapsed % 60000) / 1000).toFixed(1);

  logger.info(`
========================================
DISCOVERY COMPLETE - IMPROVED STRATEGY
========================================
Total search results examined: ${totalSearchResults}
Unique repositories found: ${processedRepos.size}
Successfully classified: ${allResults.length}
  - Aztec Protocol: ${aztecRepos.length}
  - Noir Lang: ${noirRepos.length}

Improvement over old method:
- Excluded ${majorOrgs.slice(0, 5).reduce((sum, org) => sum + (reposByOrg.get(org) || 0), 0)} tracked repos at API level
- More new repos per search query
- Better use of 1000 result limit

Output files:
  - ${migrationFile}
  - ${jsonFile}

Time elapsed: ${minutes}m ${seconds}s
========================================
`);
}

// Run the improved discovery
findNoirAztecReposV2().catch(error => {
  logger.error({ error }, "Fatal error in discovery script");
  process.exit(1);
});