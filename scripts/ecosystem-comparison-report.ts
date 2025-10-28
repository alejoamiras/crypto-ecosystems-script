#!/usr/bin/env bun
/**
 * Ecosystem Comparison Report
 * Generates a beautiful comparative analysis of Aztec Protocol and Noir Lang ecosystems
 * with options to exclude core organization repositories
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
  totalRepositories: number;
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
  excludedOrgs?: string[];
  excludedRepoCount?: number;
}

// Create GitHub client
const OctokitWithPlugins = Octokit.plugin(retry, throttling);
const octokit = new OctokitWithPlugins({
  auth: process.env.GITHUB_TOKEN,
  throttle: {
    onRateLimit: (retryAfter) => {
      console.warn(`Rate limit exceeded, retrying after ${retryAfter} seconds...`);
      return true;
    },
    onSecondaryRateLimit: (retryAfter) => {
      console.warn(`Secondary rate limit hit, retrying after ${retryAfter} seconds...`);
      return true;
    }
  }
});

async function loadRepositoryDatabase(): Promise<Repository[]> {
  const projectRoot = resolve(import.meta.dir as string, '..');
  const dbPath = resolve(projectRoot, 'output/repository-database.json');

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

      // Limit to 300 commits per repo for faster analysis
      if (commits.length >= 300) {
        break;
      }
    }
  } catch (error: any) {
    // Silently handle errors
  }

  return commits;
}

async function analyzeEcosystem(
  ecosystem: string,
  daysSince: number,
  repositories: Repository[],
  excludeOrgs: string[] = []
): Promise<EcosystemMetrics> {
  console.log(`\n🔍 Analyzing ${ecosystem} ecosystem...`);

  // Filter repositories by ecosystem
  let ecosystemRepos = repositories.filter(repo =>
    repo.ecosystem.toLowerCase() === ecosystem.toLowerCase()
  );

  const totalRepos = ecosystemRepos.length;
  let excludedCount = 0;

  // Filter out excluded organizations if specified
  if (excludeOrgs.length > 0) {
    const beforeCount = ecosystemRepos.length;
    ecosystemRepos = ecosystemRepos.filter(repo => {
      const repoInfo = extractRepoInfo(repo.url);
      if (!repoInfo) return true;
      return !excludeOrgs.some(org =>
        repoInfo.owner.toLowerCase() === org.toLowerCase()
      );
    });
    excludedCount = beforeCount - ecosystemRepos.length;
    if (excludedCount > 0) {
      console.log(`   Excluding ${excludedCount} repositories from: ${excludeOrgs.join(', ')}`);
    }
  }

  console.log(`   Found ${ecosystemRepos.length} repositories to analyze`);

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
    totalRepositories: totalRepos,
    developers: [],
    topContributors: [],
    dailyActivity: {},
    excludedOrgs: excludeOrgs.length > 0 ? excludeOrgs : undefined,
    excludedRepoCount: excludedCount > 0 ? excludedCount : undefined
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

      processedCount++;
      if (processedCount % 50 === 0 || processedCount === ecosystemRepos.length) {
        process.stdout.write(`\r   Processing: ${processedCount}/${ecosystemRepos.length} repositories...`);
      }

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

    // Small delay between batches
    if (i + batchSize < ecosystemRepos.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log('\r   Processing: Complete!                                    ');

  // Compile final metrics
  metrics.uniqueDevelopers = developerMap.size;
  metrics.activeRepositories = activeRepos.size;
  metrics.developers = Array.from(developerMap.values());

  // Calculate top contributors (exclude bots in ranking)
  const nonBotDevelopers = metrics.developers.filter(dev =>
    !dev.username.toLowerCase().includes('bot') &&
    !dev.username.toLowerCase().includes('[bot]')
  );

  metrics.topContributors = nonBotDevelopers
    .sort((a, b) => b.commits - a.commits)
    .slice(0, 10)
    .map(dev => ({
      username: dev.username,
      commits: dev.commits,
      repositories: dev.repositories.length
    }));

  return metrics;
}

function formatReport(aztecMetrics: EcosystemMetrics, noirMetrics: EcosystemMetrics, days: number, excludeOrgs: string[]) {
  const divider = '═'.repeat(70);
  const subDivider = '─'.repeat(70);

  let report = '\n' + divider + '\n';
  report += `🔬 ECOSYSTEM COMPARISON REPORT\n`;
  report += divider + '\n';
  report += `📅 Period: ${aztecMetrics.dateRange.from} to ${aztecMetrics.dateRange.to} (${days} days)\n`;

  if (excludeOrgs.length > 0) {
    report += `🚫 Excluded Organizations: ${excludeOrgs.join(', ')}\n`;
  }

  report += '\n';

  // Summary Statistics
  report += '📊 SUMMARY STATISTICS\n';
  report += subDivider + '\n';
  report += formatComparisonTable([
    ['Metric', 'Aztec Protocol', 'Noir Lang', 'Difference'],
    ['─'.repeat(20), '─'.repeat(20), '─'.repeat(20), '─'.repeat(20)],
    ['Unique Developers', String(aztecMetrics.uniqueDevelopers), String(noirMetrics.uniqueDevelopers),
     formatDifference(noirMetrics.uniqueDevelopers - aztecMetrics.uniqueDevelopers)],
    ['Total Commits', String(aztecMetrics.totalCommits), String(noirMetrics.totalCommits),
     formatDifference(noirMetrics.totalCommits - aztecMetrics.totalCommits)],
    ['Active Repositories', `${aztecMetrics.activeRepositories}/${aztecMetrics.totalRepositories}`,
     `${noirMetrics.activeRepositories}/${noirMetrics.totalRepositories}`,
     formatDifference(noirMetrics.activeRepositories - aztecMetrics.activeRepositories)],
    ['Activity Rate', `${(aztecMetrics.activeRepositories / aztecMetrics.totalRepositories * 100).toFixed(1)}%`,
     `${(noirMetrics.activeRepositories / noirMetrics.totalRepositories * 100).toFixed(1)}%`,
     formatDifference((noirMetrics.activeRepositories / noirMetrics.totalRepositories - aztecMetrics.activeRepositories / aztecMetrics.totalRepositories) * 100, '%')],
  ]);

  if (excludeOrgs.length > 0) {
    report += '\n* Excluded from analysis:\n';
    if (aztecMetrics.excludedRepoCount) {
      report += `  - Aztec: ${aztecMetrics.excludedRepoCount} repositories\n`;
    }
    if (noirMetrics.excludedRepoCount) {
      report += `  - Noir: ${noirMetrics.excludedRepoCount} repositories\n`;
    }
  }

  // Top Contributors for Aztec
  report += '\n\n🟧 AZTEC PROTOCOL - TOP CONTRIBUTORS\n';
  report += subDivider + '\n';
  report += formatContributorTable(aztecMetrics.topContributors);

  // Top Contributors for Noir
  report += '\n⚫ NOIR LANG - TOP CONTRIBUTORS\n';
  report += subDivider + '\n';
  report += formatContributorTable(noirMetrics.topContributors);

  // Daily Activity Trends (last 7 days)
  report += '\n📈 DAILY ACTIVITY (Last 7 Days)\n';
  report += subDivider + '\n';
  report += formatDailyActivity(aztecMetrics, noirMetrics);

  // Key Insights
  report += '\n💡 KEY INSIGHTS\n';
  report += subDivider + '\n';
  report += generateInsights(aztecMetrics, noirMetrics, excludeOrgs);

  report += '\n' + divider + '\n';

  return report;
}

function formatComparisonTable(data: string[][]): string {
  const colWidths = data[0].map((_, colIndex) =>
    Math.max(...data.map(row => row[colIndex].length))
  );

  return data.map(row =>
    row.map((cell, i) => cell.padEnd(colWidths[i])).join(' │ ')
  ).join('\n');
}

function formatContributorTable(contributors: { username: string; commits: number; repositories: number }[]): string {
  if (contributors.length === 0) return 'No contributors found.\n';

  const table = contributors.map((contributor, index) => {
    const rank = `${index + 1}.`.padEnd(3);
    const username = contributor.username.padEnd(20);
    const commits = `${contributor.commits} commits`.padEnd(15);
    const repos = `${contributor.repositories} repo${contributor.repositories > 1 ? 's' : ''}`;
    return `${rank} ${username} │ ${commits} │ ${repos}`;
  });

  return table.join('\n');
}

function formatDailyActivity(aztecMetrics: EcosystemMetrics, noirMetrics: EcosystemMetrics): string {
  const allDates = new Set([
    ...Object.keys(aztecMetrics.dailyActivity),
    ...Object.keys(noirMetrics.dailyActivity)
  ]);

  const sortedDates = Array.from(allDates).sort().slice(-7);

  const rows = sortedDates.map(date => {
    const aztecData = aztecMetrics.dailyActivity[date] || { commits: 0, developers: new Set() };
    const noirData = noirMetrics.dailyActivity[date] || { commits: 0, developers: new Set() };

    const dateStr = date.padEnd(12);
    const aztecStr = `${aztecData.commits} commits, ${aztecData.developers.size} devs`.padEnd(25);
    const noirStr = `${noirData.commits} commits, ${noirData.developers.size} devs`;

    return `${dateStr} │ Aztec: ${aztecStr} │ Noir: ${noirStr}`;
  });

  return rows.join('\n');
}

function formatDifference(diff: number, suffix: string = ''): string {
  if (diff > 0) return `+${diff}${suffix}`;
  if (diff < 0) return `${diff}${suffix}`;
  return `0${suffix}`;
}

function generateInsights(aztecMetrics: EcosystemMetrics, noirMetrics: EcosystemMetrics, excludeOrgs: string[]): string {
  const insights: string[] = [];

  // Developer comparison
  if (noirMetrics.uniqueDevelopers > aztecMetrics.uniqueDevelopers) {
    const diff = noirMetrics.uniqueDevelopers - aztecMetrics.uniqueDevelopers;
    const pct = ((diff / aztecMetrics.uniqueDevelopers) * 100).toFixed(0);
    insights.push(`• Noir Lang has ${diff} more developers (${pct}% more activity)`);
  } else if (aztecMetrics.uniqueDevelopers > noirMetrics.uniqueDevelopers) {
    const diff = aztecMetrics.uniqueDevelopers - noirMetrics.uniqueDevelopers;
    const pct = ((diff / noirMetrics.uniqueDevelopers) * 100).toFixed(0);
    insights.push(`• Aztec Protocol has ${diff} more developers (${pct}% more activity)`);
  }

  // Commit velocity
  const aztecCommitsPerDev = (aztecMetrics.totalCommits / aztecMetrics.uniqueDevelopers).toFixed(1);
  const noirCommitsPerDev = (noirMetrics.totalCommits / noirMetrics.uniqueDevelopers).toFixed(1);
  insights.push(`• Average commits per developer: Aztec (${aztecCommitsPerDev}) vs Noir (${noirCommitsPerDev})`);

  // Repository activity
  const aztecActiveRate = (aztecMetrics.activeRepositories / aztecMetrics.totalRepositories * 100).toFixed(1);
  const noirActiveRate = (noirMetrics.activeRepositories / noirMetrics.totalRepositories * 100).toFixed(1);
  insights.push(`• Repository activity rates: Aztec (${aztecActiveRate}%) vs Noir (${noirActiveRate}%)`);

  // Community vs Core
  if (excludeOrgs.length > 0) {
    insights.push(`• Analysis excludes core organization repositories for community focus`);
    if (aztecMetrics.excludedRepoCount || noirMetrics.excludedRepoCount) {
      const totalExcluded = (aztecMetrics.excludedRepoCount || 0) + (noirMetrics.excludedRepoCount || 0);
      insights.push(`• Excluded ${totalExcluded} core repositories from analysis`);
    }
  }

  // Development patterns
  const aztecTopCommits = aztecMetrics.topContributors.slice(0, 3).reduce((sum, c) => sum + c.commits, 0);
  const noirTopCommits = noirMetrics.topContributors.slice(0, 3).reduce((sum, c) => sum + c.commits, 0);
  const aztecConcentration = ((aztecTopCommits / aztecMetrics.totalCommits) * 100).toFixed(0);
  const noirConcentration = ((noirTopCommits / noirMetrics.totalCommits) * 100).toFixed(0);
  insights.push(`• Top 3 contributors account for: Aztec (${aztecConcentration}%) vs Noir (${noirConcentration}%) of commits`);

  return insights.join('\n');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log(`
Usage: bun run scripts/ecosystem-comparison-report.ts [options]

Options:
  --days <number>           Number of days to look back (default: 31)
  --exclude-orgs <orgs>     Comma-separated list of organizations to exclude
                           (default: none, use "core" for AztecProtocol,noir-lang)
  --output <file>          Save report to file
  --json                   Also save raw metrics as JSON

Examples:
  # Standard comparison (31 days, all repos)
  bun run scripts/ecosystem-comparison-report.ts

  # Exclude core organizations (community-only view)
  bun run scripts/ecosystem-comparison-report.ts --exclude-orgs core

  # Custom exclusions
  bun run scripts/ecosystem-comparison-report.ts --exclude-orgs AztecProtocol,noir-lang

  # Last 7 days, save to file
  bun run scripts/ecosystem-comparison-report.ts --days 7 --output weekly-report.txt

  # Community activity for last 14 days with JSON output
  bun run scripts/ecosystem-comparison-report.ts --days 14 --exclude-orgs core --json
    `);
    process.exit(0);
  }

  // Parse arguments
  let days = 31;
  let excludeOrgs: string[] = [];
  let outputFile: string | null = null;
  let saveJson = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--days':
        days = parseInt(args[++i]);
        break;
      case '--exclude-orgs':
        const orgsArg = args[++i];
        if (orgsArg.toLowerCase() === 'core') {
          excludeOrgs = ['AztecProtocol', 'noir-lang'];
        } else {
          excludeOrgs = orgsArg.split(',').map(org => org.trim());
        }
        break;
      case '--output':
        outputFile = args[++i];
        break;
      case '--json':
        saveJson = true;
        break;
    }
  }

  // Load repository database
  const repositories = await loadRepositoryDatabase();

  // Analyze both ecosystems
  console.log('🚀 Starting ecosystem comparison analysis...');

  const [aztecMetrics, noirMetrics] = await Promise.all([
    analyzeEcosystem('Aztec Protocol', days, repositories, excludeOrgs),
    analyzeEcosystem('Noir Lang', days, repositories, excludeOrgs)
  ]);

  // Generate report
  const report = formatReport(aztecMetrics, noirMetrics, days, excludeOrgs);

  // Display report
  console.log(report);

  // Save to file if requested
  if (outputFile) {
    const projectRoot = resolve(import.meta.dir as string, '..');
    const outputPath = resolve(projectRoot, 'output', outputFile);
    writeFileSync(outputPath, report);
    console.log(`📄 Report saved to: ${outputPath}`);
  }

  // Save JSON if requested
  if (saveJson) {
    const projectRoot = resolve(import.meta.dir as string, '..');
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const jsonPath = resolve(projectRoot, 'output', `ecosystem-comparison-${timestamp}.json`);

    const jsonData = {
      generatedAt: new Date().toISOString(),
      days,
      excludedOrganizations: excludeOrgs,
      aztec: {
        ...aztecMetrics,
        dailyActivity: Object.fromEntries(
          Object.entries(aztecMetrics.dailyActivity).map(([date, data]) => [
            date,
            {
              commits: data.commits,
              developers: Array.from(data.developers)
            }
          ])
        )
      },
      noir: {
        ...noirMetrics,
        dailyActivity: Object.fromEntries(
          Object.entries(noirMetrics.dailyActivity).map(([date, data]) => [
            date,
            {
              commits: data.commits,
              developers: Array.from(data.developers)
            }
          ])
        )
      }
    };

    writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2));
    console.log(`📊 JSON metrics saved to: ${jsonPath}`);
  }
}

main().catch(console.error);