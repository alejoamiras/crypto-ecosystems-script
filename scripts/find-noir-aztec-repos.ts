#!/usr/bin/env bun

import dotenv from "dotenv";
import { GitHubSearchClient } from "../src/lib/github";
import { logger } from "../src/lib/logger";
import { RateLimitError } from "../src/lib/errors";
import axios from "axios";
import toml from "toml";

// Load environment variables
dotenv.config();

interface TrackedRepo {
  url: string;
  sub_ecosystems: string[];
}

interface NargoConfig {
  package?: {
    name?: string;
    type?: string;
  };
  dependencies?: Record<string, any>;
}

interface RepoResult {
  url: string;
  fullName: string;
  isAztec: boolean;
  nargoType: string;
  stars: number;
  description: string;
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
        // Normalize URL to handle different formats
        const normalizedUrl = repo.url.toLowerCase()
          .replace(/\.git$/, '')
          .replace(/\/$/, '');
        trackedUrls.add(normalizedUrl);

        // Also add just the owner/repo part for easier comparison
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
 * Fetch and parse a Nargo.toml file from a repository
 */
async function fetchNargoToml(owner: string, repo: string, token: string): Promise<NargoConfig | null> {
  try {
    // Try to fetch Nargo.toml from the root
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/Nargo.toml`;

    const response = await axios.get(url, {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json'
      }
    });

    // Decode base64 content
    const content = Buffer.from(response.data.content, 'base64').toString('utf-8');

    // Parse TOML
    const config = toml.parse(content) as NargoConfig;
    return config;
  } catch (error: any) {
    if (error.response?.status === 404) {
      // File not found - this is expected for many repos
      return null;
    }
    logger.debug({ owner, repo, error: error.message }, "Failed to fetch Nargo.toml");
    return null;
  }
}


/**
 * Determine if a repository is Aztec or Noir based on Nargo.toml
 */
function classifyRepository(config: NargoConfig | null): { isAztec: boolean; nargoType: string } {
  if (!config) {
    return { isAztec: false, nargoType: 'unknown' };
  }

  const packageType = config.package?.type || 'bin';

  // Check if it's a contract (Aztec)
  if (packageType === 'contract') {
    return { isAztec: true, nargoType: 'contract' };
  }

  // Check dependencies for Aztec.nr
  if (config.dependencies) {
    const hasAztecDep = Object.keys(config.dependencies).some(dep =>
      dep.toLowerCase().includes('aztec')
    );
    if (hasAztecDep) {
      return { isAztec: true, nargoType: packageType };
    }
  }

  // Otherwise it's Noir
  return { isAztec: false, nargoType: packageType };
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
    // Search for repositories with Nargo.toml files
    logger.info("Searching for repositories with Nargo.toml files...");

    // Multiple search queries to find Noir/Aztec repos
    // Using different strategies to maximize coverage since GitHub limits results
    const searchQueries = [
      // Primary search - should get most repos
      'filename:Nargo.toml',

      // Language/framework specific searches
      'Nargo.toml noir',
      'Nargo.toml aztec',
      'Nargo.toml "aztec.nr"',

      // Date-based searches to get newer repos that might be missed
      'filename:Nargo.toml created:>2025-01-01',
      'filename:Nargo.toml created:2024-01-01..2024-12-31',
      'filename:Nargo.toml created:2023-01-01..2023-12-31',

      // Star-based searches to catch popular repos
      'filename:Nargo.toml stars:>10',
      'filename:Nargo.toml stars:1..10',

      // Language combinations
      'filename:Nargo.toml language:Noir',
      // 'filename:Nargo.toml language:Rust',
      // 'filename:Nargo.toml language:TypeScript',

      // Note: These don't work well with GitHub's search but keeping for documentation
      // '"type = contract" filename:Nargo.toml',
      // '"type = lib" filename:Nargo.toml',
      // '"type = bin" filename:Nargo.toml'
    ];

    for (const query of searchQueries) {
      logger.info(`Searching with query: ${query}`);

      try {
        // GitHub's code search API has a hard limit of 1000 results per query
        // We'll try to get as many as possible
        const searchResults = await client.searchCode(query, {
          maxResults: 1000  // Get maximum allowed results
        });

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

          // Fetch the Nargo.toml to determine type
          logger.debug(`Fetching Nargo.toml for ${repoFullName}...`);
          const nargoConfig = await fetchNargoToml(owner, repo, token);

          if (nargoConfig) {
            const { isAztec, nargoType } = classifyRepository(nargoConfig);

            results.push({
              url: repoUrl,
              fullName: codeResult.repository.full_name,
              isAztec,
              nargoType,
              stars: codeResult.repository.stargazers_count || 0,
              description: codeResult.repository.description || ''
            });

            logger.info(`Found ${isAztec ? 'Aztec' : 'Noir'} repo: ${repoFullName} (type: ${nargoType})`);
          } else {
            // Even if we can't fetch Nargo.toml, we know it exists from search
            results.push({
              url: repoUrl,
              fullName: codeResult.repository.full_name,
              isAztec: false, // Default to Noir if we can't determine
              nargoType: 'unknown',
              stars: codeResult.repository.stargazers_count || 0,
              description: codeResult.repository.description || ''
            });

            logger.info(`Found repo with Nargo.toml (type unknown): ${repoFullName}`);
          }

          // Rate limit pause
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Longer pause between search queries
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        if (error instanceof RateLimitError) {
          logger.warn("Rate limited, waiting before continuing...");
          await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 1 minute
        } else {
          logger.error({ error }, `Failed to search with query: ${query}`);
        }
      }
    }

  } catch (error) {
    logger.error({ error }, "Error during repository search");
    throw error;
  }

  return results;
}

/**
 * Generate Electric Capital migration format
 */
function generateMigrationOutput(results: RepoResult[]): string {
  const lines: string[] = [];

  // Add header
  lines.push("# Electric Capital Migration Commands for Noir/Aztec Repositories");
  lines.push(`# Generated: ${new Date().toISOString()}`);
  lines.push(`# Total new repositories found: ${results.length}`);
  lines.push("");

  // Separate Aztec and Noir repos
  const aztecRepos = results.filter(r => r.isAztec).sort((a, b) => b.stars - a.stars);
  const noirRepos = results.filter(r => !r.isAztec).sort((a, b) => b.stars - a.stars);

  // Add Aztec repositories
  if (aztecRepos.length > 0) {
    lines.push(`# Aztec Protocol Repositories (${aztecRepos.length} found)`);
    lines.push("# Repositories with type=contract or Aztec.nr dependencies");
    for (const repo of aztecRepos) {
      const desc = repo.description ? ` # ${repo.description.substring(0, 50)}` : '';
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
    logger.info("Starting Noir/Aztec repository discovery...");

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
    const outputPath = `output/electric-capital-migration-${timestamp}.txt`;
    await Bun.write(outputPath, migrationOutput);

    logger.info(`Migration file saved to: ${outputPath}`);

    // Also display summary
    const aztecCount = newRepos.filter(r => r.isAztec).length;
    const noirCount = newRepos.filter(r => !r.isAztec).length;
    const unknownTypeCount = newRepos.filter(r => r.nargoType === 'unknown').length;

    console.log("\n=== Summary ===");
    console.log(`Total repositories already tracked by Electric Capital: ${trackedRepos.size}`);
    console.log(`Total NEW repositories found: ${newRepos.length}`);
    console.log(`  - Aztec Protocol: ${aztecCount}`);
    console.log(`  - Noir Lang: ${noirCount}`);
    console.log(`  - Unknown type (couldn't fetch Nargo.toml): ${unknownTypeCount}`);
    console.log(`\nMigration commands saved to: ${outputPath}`);
    console.log(`\nNote: GitHub's code search API has a limit of 1000 results per query.`);
    console.log(`We used multiple search strategies to maximize coverage, but there may be more repos.`);

    // Also save detailed JSON for analysis
    const jsonPath = `output/noir-aztec-repos-${timestamp}.json`;
    await Bun.write(jsonPath, JSON.stringify(newRepos, null, 2));
    console.log(`Detailed results saved to: ${jsonPath}`);

  } catch (error) {
    logger.error({ error }, "Failed to complete repository discovery");
    process.exit(1);
  }
}

// Run the script
if (import.meta.main) {
  main();
}