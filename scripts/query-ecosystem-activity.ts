#!/usr/bin/env bun
/**
 * Query ecosystem activity and developer metrics
 * Use this to get insights like unique developers, commits, and activity patterns
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { Octokit } from '@octokit/rest';
import { retry } from '@octokit/plugin-retry';
import { throttling } from '@octokit/plugin-throttling';
import dotenv from 'dotenv';

dotenv.config();

interface Repository {
  url: string;
  ecosystem: string;
  tags: string[];
  source: string;
}

interface DeveloperActivity {
  username: string;
  email?: string;
  commits: number;
  firstCommit: string;
  lastCommit: string;
  repositories: string[];
}

interface EcosystemMetrics {
  ecosystem: string;
  dateRange: {
    from: string;
    to: string;
  };
  uniqueDevelopers: number;
  totalCommits: number;
  activeRepositories: number;
  developers: DeveloperActivity[];
  topContributors: {
    username: string;
    commits: number;
    repositories: number;
  }[];
  dailyActivity: {
    [date: string]: {
      commits: number;
      developers: Set<string>;
    };
  };
}

// Create GitHub client with retry and throttling
const OctokitWithPlugins = Octokit.plugin(retry, throttling);
const octokit = new OctokitWithPlugins({
  auth: process.env.GITHUB_TOKEN,
  throttle: {
    onRateLimit: (retryAfter, options) => {
      console.warn(`Rate limit exceeded, retrying after ${retryAfter} seconds...`);
      return true;
    },
    onSecondaryRateLimit: (retryAfter, options) => {
      console.warn(`Secondary rate limit hit, retrying after ${retryAfter} seconds...`);
      return true;
    }
  }
});

async function loadRepositoryDatabase(filePath?: string): Promise<Repository[]> {
  const projectRoot = resolve(import.meta.dir, '..');
  const dbPath = filePath || resolve(projectRoot, 'output/repository-database.json');

  try {
    const content = readFileSync(dbPath, 'utf-8');
    const database = JSON.parse(content);
    return database.repositories;
  } catch (error) {
    console.error('Failed to load repository database. Please run create-repository-database.ts first.');
    process.exit(1);
  }
}

function extractRepoInfo(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) return null;
  return {
    owner: match[1],
    repo: match[2].replace(/\.git$/, '')
  };
}

async function fetchCommits(owner: string, repo: string, since: string, until: string) {
  const commits: any[] = [];
  let page = 1;
  const perPage = 100;

  try {
    while (true) {
      const response = await octokit.repos.listCommits({
        owner,
        repo,
        since,
        until,
        per_page: perPage,
        page
      });

      if (response.data.length === 0) break;
      commits.push(...response.data);

      if (response.data.length < perPage) break;
      page++;

      // Limit to 500 commits per repo to avoid rate limits
      if (commits.length >= 500) {
        console.log(`  Reached 500 commit limit for ${owner}/${repo}`);
        break;
      }
    }
  } catch (error: any) {
    if (error.status === 404) {
      console.log(`  Repository not found: ${owner}/${repo}`);
    } else if (error.status === 409) {
      console.log(`  Repository is empty: ${owner}/${repo}`);
    } else {
      console.warn(`  Error fetching commits for ${owner}/${repo}: ${error.message}`);
    }
  }

  return commits;
}

async function analyzeEcosystem(
  ecosystem: string,
  daysSince: number = 10,
  repositories?: Repository[]
): Promise<EcosystemMetrics> {
  console.log(`\nAnalyzing ${ecosystem} ecosystem activity...`);

  // Load repositories if not provided
  if (!repositories) {
    repositories = await loadRepositoryDatabase();
  }

  // Filter repositories by ecosystem
  const ecosystemRepos = repositories.filter(repo =>
    repo.ecosystem.toLowerCase() === ecosystem.toLowerCase()
  );

  console.log(`Found ${ecosystemRepos.length} ${ecosystem} repositories`);

  // Calculate date range
  const until = new Date();
  const since = new Date();
  since.setDate(since.getDate() - daysSince);

  const metrics: EcosystemMetrics = {
    ecosystem,
    dateRange: {
      from: since.toISOString().split('T')[0],
      to: until.toISOString().split('T')[0]
    },
    uniqueDevelopers: 0,
    totalCommits: 0,
    activeRepositories: 0,
    developers: [],
    topContributors: [],
    dailyActivity: {}
  };

  // Track developer activity
  const developerMap = new Map<string, DeveloperActivity>();
  const activeRepos = new Set<string>();

  // Analyze each repository
  let processedCount = 0;
  const batchSize = 10;

  for (let i = 0; i < ecosystemRepos.length; i += batchSize) {
    const batch = ecosystemRepos.slice(i, Math.min(i + batchSize, ecosystemRepos.length));

    await Promise.all(batch.map(async (repo) => {
      const repoInfo = extractRepoInfo(repo.url);
      if (!repoInfo) return;

      console.log(`Processing ${++processedCount}/${ecosystemRepos.length}: ${repoInfo.owner}/${repoInfo.repo}`);

      const commits = await fetchCommits(
        repoInfo.owner,
        repoInfo.repo,
        since.toISOString(),
        until.toISOString()
      );

      if (commits.length > 0) {
        activeRepos.add(repo.url);
      }

      for (const commit of commits) {
        const author = commit.author?.login || commit.commit?.author?.name || 'unknown';
        const email = commit.commit?.author?.email;
        const date = commit.commit?.author?.date;

        if (!author || author === 'unknown') continue;

        // Update developer activity
        if (!developerMap.has(author)) {
          developerMap.set(author, {
            username: author,
            email,
            commits: 0,
            firstCommit: date,
            lastCommit: date,
            repositories: []
          });
        }

        const dev = developerMap.get(author)!;
        dev.commits++;
        if (date < dev.firstCommit) dev.firstCommit = date;
        if (date > dev.lastCommit) dev.lastCommit = date;
        if (!dev.repositories.includes(repo.url)) {
          dev.repositories.push(repo.url);
        }

        // Track daily activity
        const dayKey = date.split('T')[0];
        if (!metrics.dailyActivity[dayKey]) {
          metrics.dailyActivity[dayKey] = {
            commits: 0,
            developers: new Set()
          };
        }
        metrics.dailyActivity[dayKey].commits++;
        metrics.dailyActivity[dayKey].developers.add(author);

        metrics.totalCommits++;
      }
    }));

    // Small delay between batches to be nice to GitHub API
    if (i + batchSize < ecosystemRepos.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Compile final metrics
  metrics.uniqueDevelopers = developerMap.size;
  metrics.activeRepositories = activeRepos.size;
  metrics.developers = Array.from(developerMap.values());

  // Calculate top contributors
  metrics.topContributors = metrics.developers
    .sort((a, b) => b.commits - a.commits)
    .slice(0, 10)
    .map(dev => ({
      username: dev.username,
      commits: dev.commits,
      repositories: dev.repositories.length
    }));

  return metrics;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log(`
Usage: bun run scripts/query-ecosystem-activity.ts [options]

Options:
  --ecosystem <name>   Ecosystem to analyze (e.g., "Aztec Protocol", "Noir Lang")
  --days <number>      Number of days to look back (default: 10)
  --output <file>      Save results to JSON file
  --csv                Export results as CSV
  --examples           Show example queries

Examples:
  # Get Aztec developers from last 10 days
  bun run scripts/query-ecosystem-activity.ts --ecosystem "Aztec Protocol" --days 10

  # Get Noir Lang activity from last 30 days and save to file
  bun run scripts/query-ecosystem-activity.ts --ecosystem "Noir Lang" --days 30 --output noir-activity.json

  # Export as CSV
  bun run scripts/query-ecosystem-activity.ts --ecosystem "Aztec Protocol" --csv
    `);
    process.exit(0);
  }

  if (args[0] === '--examples') {
    console.log('Example queries you can run:\n');
    console.log('1. Unique developers in Aztec ecosystem (last 10 days):');
    console.log('   bun run scripts/query-ecosystem-activity.ts --ecosystem "Aztec Protocol" --days 10\n');

    console.log('2. Monthly activity for Noir Lang:');
    console.log('   bun run scripts/query-ecosystem-activity.ts --ecosystem "Noir Lang" --days 30\n');

    console.log('3. Compare ecosystems (run sequentially):');
    console.log('   bun run scripts/query-ecosystem-activity.ts --ecosystem "Aztec Protocol" --days 7 --output aztec-week.json');
    console.log('   bun run scripts/query-ecosystem-activity.ts --ecosystem "Noir Lang" --days 7 --output noir-week.json\n');

    process.exit(0);
  }

  // Parse arguments
  let ecosystem = 'Aztec Protocol';
  let days = 10;
  let outputFile: string | null = null;
  let exportCsv = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--ecosystem':
        ecosystem = args[++i];
        break;
      case '--days':
        days = parseInt(args[++i]);
        break;
      case '--output':
        outputFile = args[++i];
        break;
      case '--csv':
        exportCsv = true;
        break;
    }
  }

  // Run analysis
  const metrics = await analyzeEcosystem(ecosystem, days);

  // Display results
  console.log('\n' + '='.repeat(60));
  console.log(`${ecosystem} ECOSYSTEM ACTIVITY REPORT`);
  console.log('='.repeat(60));
  console.log(`Date Range: ${metrics.dateRange.from} to ${metrics.dateRange.to}`);
  console.log(`Unique Developers: ${metrics.uniqueDevelopers}`);
  console.log(`Total Commits: ${metrics.totalCommits}`);
  console.log(`Active Repositories: ${metrics.activeRepositories}/${metrics.developers.length}`);

  if (metrics.topContributors.length > 0) {
    console.log('\nTop Contributors:');
    metrics.topContributors.forEach((contributor, index) => {
      console.log(`  ${index + 1}. ${contributor.username}: ${contributor.commits} commits across ${contributor.repositories} repos`);
    });
  }

  // Daily activity summary
  const dailyDates = Object.keys(metrics.dailyActivity).sort();
  if (dailyDates.length > 0) {
    console.log('\nDaily Activity:');
    dailyDates.slice(-7).forEach(date => {
      const activity = metrics.dailyActivity[date];
      console.log(`  ${date}: ${activity.commits} commits by ${activity.developers.size} developers`);
    });
  }

  // Save to file if requested
  if (outputFile) {
    const projectRoot = resolve(import.meta.dir, '..');
    const outputPath = resolve(projectRoot, 'output', outputFile);
    writeFileSync(outputPath, JSON.stringify(metrics, (key, value) => {
      if (value instanceof Set) {
        return Array.from(value);
      }
      return value;
    }, 2));
    console.log(`\nResults saved to: ${outputPath}`);
  }

  // Export as CSV if requested
  if (exportCsv) {
    const projectRoot = resolve(import.meta.dir, '..');
    const csvPath = resolve(projectRoot, 'output', `${ecosystem.toLowerCase().replace(/\s+/g, '-')}-developers.csv`);

    const csvContent = [
      'username,email,commits,repositories,first_commit,last_commit',
      ...metrics.developers.map(dev =>
        `"${dev.username}","${dev.email || ''}",${dev.commits},${dev.repositories.length},"${dev.firstCommit}","${dev.lastCommit}"`
      )
    ].join('\n');

    writeFileSync(csvPath, csvContent);
    console.log(`\nCSV exported to: ${csvPath}`);
  }
}

main().catch(console.error);