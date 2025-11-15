#!/usr/bin/env bun
/**
 * Repository Metrics Snapshot Tool
 * Captures and saves metrics for GitHub repositories to track changes over time
 * Perfect for measuring impact before/after hackathons or events
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';
import { GitHubSearchClient } from '../src/lib/github/search-client';
import { logger, createFileLogger } from '../src/lib/logger';
import { config } from '../src/lib/config';
import dotenv from 'dotenv';
import type { Logger } from 'pino';

dotenv.config();

interface RepositoryMetrics {
  url: string;
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  stars: number;
  forks: number;
  watchers: number;
  openIssues: number;
  subscribers: number;
  size: number;
  language: string | null;
  topics: string[];
  license: string | null;
  defaultBranch: string;
  createdAt: string;
  updatedAt: string;
  pushedAt: string;
  homepage: string | null;
  archived: boolean;
  disabled: boolean;
  private: boolean;
  hasWiki: boolean;
  hasPages: boolean;
  hasDiscussions: boolean;
  networkCount: number;
  subscribersCount: number;
  // Additional metrics
  pullRequests?: {
    open: number;
    closed: number;
    merged: number;
  };
  contributors?: number;
  releases?: number;
}

interface Snapshot {
  timestamp: string;
  date: string;
  repositories: RepositoryMetrics[];
  metadata: {
    totalRepos: number;
    totalStars: number;
    totalForks: number;
    totalWatchers: number;
    avgStarsPerRepo: number;
    avgForksPerRepo: number;
    executionTime: number;
    errors: string[];
  };
}

interface SnapshotHistory {
  firstSnapshot: string;
  lastSnapshot: string;
  totalSnapshots: number;
  snapshots: Snapshot[];
}

class RepositorySnapshotTool {
  private client: GitHubSearchClient;
  private log: Logger;
  private errors: string[] = [];

  constructor(useTokenRotation: boolean = false, logToFile: boolean = false) {
    // Setup logger
    if (logToFile) {
      const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
      const logFile = `logs/snapshot-${timestamp}.log`;
      this.log = createFileLogger(logFile, process.env.LOG_LEVEL || 'info');
      this.log.info(`Logging to file: ${logFile}`);
    } else {
      this.log = logger;
    }

    // Initialize GitHub client with existing infrastructure
    this.client = new GitHubSearchClient({
      useTokenRotation,
      searchTimeoutMs: config.timeout.searchTimeout,
    });

    this.log.info('Repository Snapshot Tool initialized', {
      tokenRotation: useTokenRotation,
      fileLogging: logToFile,
      timeout: config.timeout.searchTimeout,
    });
  }

  parseRepositoryUrl(url: string): { owner: string; name: string } | null {
    // Handle various URL formats
    const patterns = [
      /github\.com\/([^/]+)\/([^/\s]+)/,
      /^([^/]+)\/([^/\s]+)$/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return {
          owner: match[1],
          name: match[2].replace(/\.git$/, '').replace(/\/$/, '')
        };
      }
    }

    this.log.warn(`Invalid repository URL format: ${url}`);
    return null;
  }

  async fetchRepositoryMetrics(owner: string, name: string): Promise<RepositoryMetrics | null> {
    try {
      this.log.debug(`Fetching metrics for ${owner}/${name}`);

      // Use the client's octokit instance via public method
      const octokit = this.client.getOctokit();

      // Fetch basic repository data
      const { data: repo } = await octokit.repos.get({ owner, repo: name });

      const metrics: RepositoryMetrics = {
        url: repo.html_url,
        owner: repo.owner.login,
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        watchers: repo.watchers_count,
        openIssues: repo.open_issues_count,
        subscribers: repo.subscribers_count,
        size: repo.size,
        language: repo.language,
        topics: repo.topics || [],
        license: repo.license?.name || null,
        defaultBranch: repo.default_branch,
        createdAt: repo.created_at,
        updatedAt: repo.updated_at,
        pushedAt: repo.pushed_at,
        homepage: repo.homepage,
        archived: repo.archived,
        disabled: repo.disabled,
        private: repo.private,
        hasWiki: repo.has_wiki,
        hasPages: repo.has_pages,
        hasDiscussions: repo.has_discussions || false,
        networkCount: repo.network_count,
        subscribersCount: repo.subscribers_count
      };

      // Fetch additional metrics with error handling
      try {
        // Fetch pull request counts
        const [openPRs, closedPRs] = await Promise.all([
          octokit.pulls.list({ owner, repo: name, state: 'open', per_page: 1 }),
          octokit.pulls.list({ owner, repo: name, state: 'closed', per_page: 1 })
        ]);

        // Get counts from headers (more efficient)
        const openCount = this.getCountFromLink(openPRs.headers.link) || openPRs.data.length;
        const closedCount = this.getCountFromLink(closedPRs.headers.link) || closedPRs.data.length;

        metrics.pullRequests = {
          open: openCount,
          closed: closedCount,
          merged: 0 // Would need additional API calls to get accurate count
        };

        this.log.debug(`PR metrics for ${owner}/${name}:`, metrics.pullRequests);
      } catch (error) {
        this.log.warn(`Could not fetch PR data for ${owner}/${name}:`, error);
      }

      try {
        // Fetch contributor count
        const { data: contributors, headers } = await octokit.repos.listContributors({
          owner,
          repo: name,
          per_page: 1,
          anon: 'true'
        });

        metrics.contributors = this.getCountFromLink(headers.link) || contributors.length;
        this.log.debug(`Contributors for ${owner}/${name}: ${metrics.contributors}`);
      } catch (error) {
        this.log.warn(`Could not fetch contributor data for ${owner}/${name}:`, error);
      }

      try {
        // Fetch release count
        const { data: releases, headers } = await octokit.repos.listReleases({
          owner,
          repo: name,
          per_page: 1
        });

        metrics.releases = this.getCountFromLink(headers.link) || releases.length;
        this.log.debug(`Releases for ${owner}/${name}: ${metrics.releases}`);
      } catch (error) {
        this.log.warn(`Could not fetch release data for ${owner}/${name}:`, error);
      }

      this.log.info(`✅ Successfully fetched metrics for ${owner}/${name}`, {
        stars: metrics.stars,
        forks: metrics.forks,
        watchers: metrics.watchers
      });

      return metrics;
    } catch (error: any) {
      if (error.status === 404) {
        this.log.error(`Repository not found: ${owner}/${name}`);
        this.errors.push(`Not found: ${owner}/${name}`);
      } else {
        this.log.error(`Error fetching ${owner}/${name}:`, error);
        this.errors.push(`Error fetching ${owner}/${name}: ${error.message}`);
      }
      return null;
    }
  }

  private getCountFromLink(linkHeader: any): number | null {
    // Parse the Link header to get total count
    if (!linkHeader || typeof linkHeader !== 'string') return null;

    const match = linkHeader.match(/page=(\d+)>; rel="last"/);
    if (match) {
      return parseInt(match[1]);
    }
    return null;
  }

  async createSnapshot(repositories: string[]): Promise<Snapshot> {
    const startTime = Date.now();
    this.errors = []; // Reset errors
    const repoMetrics: RepositoryMetrics[] = [];

    this.log.info(`Starting repository snapshot for ${repositories.length} repositories`);

    for (let i = 0; i < repositories.length; i++) {
      const repoUrl = repositories[i];
      this.log.info(`Processing ${i + 1}/${repositories.length}: ${repoUrl}`);

      const repoInfo = this.parseRepositoryUrl(repoUrl);
      if (!repoInfo) {
        this.errors.push(`Invalid URL: ${repoUrl}`);
        continue;
      }

      const metrics = await this.fetchRepositoryMetrics(repoInfo.owner, repoInfo.name);
      if (metrics) {
        repoMetrics.push(metrics);
      }

      // Apply rate limit delay from config
      if (i < repositories.length - 1) {
        await new Promise(resolve => setTimeout(resolve, config.rateLimit.repoProcessingDelay));
      }
    }

    const executionTime = Date.now() - startTime;

    // Calculate statistics
    const totalStars = repoMetrics.reduce((sum, repo) => sum + repo.stars, 0);
    const totalForks = repoMetrics.reduce((sum, repo) => sum + repo.forks, 0);
    const totalWatchers = repoMetrics.reduce((sum, repo) => sum + repo.watchers, 0);

    const snapshot: Snapshot = {
      timestamp: new Date().toISOString(),
      date: new Date().toISOString().split('T')[0],
      repositories: repoMetrics,
      metadata: {
        totalRepos: repoMetrics.length,
        totalStars,
        totalForks,
        totalWatchers,
        avgStarsPerRepo: repoMetrics.length > 0 ? Math.round(totalStars / repoMetrics.length) : 0,
        avgForksPerRepo: repoMetrics.length > 0 ? Math.round(totalForks / repoMetrics.length) : 0,
        executionTime,
        errors: this.errors
      }
    };

    this.log.info('Snapshot created successfully', {
      repositories: snapshot.metadata.totalRepos,
      stars: snapshot.metadata.totalStars,
      forks: snapshot.metadata.totalForks,
      executionTime: `${(executionTime / 1000).toFixed(1)}s`,
      errors: this.errors.length
    });

    return snapshot;
  }

  loadOrCreateHistory(historyPath: string): SnapshotHistory {
    if (existsSync(historyPath)) {
      const content = readFileSync(historyPath, 'utf-8');
      const history = JSON.parse(content);
      this.log.debug(`Loaded existing history with ${history.totalSnapshots} snapshots`);
      return history;
    }

    this.log.debug('Creating new snapshot history');
    return {
      firstSnapshot: new Date().toISOString(),
      lastSnapshot: new Date().toISOString(),
      totalSnapshots: 0,
      snapshots: []
    };
  }

  saveSnapshot(snapshot: Snapshot, outputDir: string): string {
    // Ensure output directory exists
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
      this.log.debug(`Created output directory: ${outputDir}`);
    }

    // Save individual snapshot
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const snapshotPath = join(outputDir, `snapshot-${timestamp}.json`);
    writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
    this.log.info(`Saved snapshot to: ${snapshotPath}`);

    // Update history file
    const historyPath = join(outputDir, 'snapshot-history.json');
    const history = this.loadOrCreateHistory(historyPath);

    history.snapshots.push(snapshot);
    history.lastSnapshot = snapshot.timestamp;
    history.totalSnapshots = history.snapshots.length;

    writeFileSync(historyPath, JSON.stringify(history, null, 2));
    this.log.info(`Updated history file: ${historyPath}`);

    // Save a "latest" file for easy access
    const latestPath = join(outputDir, 'snapshot-latest.json');
    writeFileSync(latestPath, JSON.stringify(snapshot, null, 2));
    this.log.info(`Updated latest snapshot: ${latestPath}`);

    return snapshotPath;
  }

  printSummary(snapshot: Snapshot) {
    const divider = '═'.repeat(60);

    console.log('\n' + divider);
    console.log('📸 REPOSITORY SNAPSHOT COMPLETE');
    console.log(divider);
    console.log(`📅 Date: ${snapshot.date}`);
    console.log(`🕐 Time: ${new Date(snapshot.timestamp).toLocaleTimeString()}`);
    console.log(`📦 Repositories: ${snapshot.metadata.totalRepos}`);
    console.log(`⭐ Total Stars: ${snapshot.metadata.totalStars.toLocaleString()}`);
    console.log(`🍴 Total Forks: ${snapshot.metadata.totalForks.toLocaleString()}`);
    console.log(`👁️  Total Watchers: ${snapshot.metadata.totalWatchers.toLocaleString()}`);
    console.log(`📊 Averages: ⭐ ${snapshot.metadata.avgStarsPerRepo}/repo | 🍴 ${snapshot.metadata.avgForksPerRepo}/repo`);
    console.log(`⏱️  Execution Time: ${(snapshot.metadata.executionTime / 1000).toFixed(1)}s`);

    if (snapshot.metadata.errors.length > 0) {
      console.log(`\n⚠️  Errors (${snapshot.metadata.errors.length}):`);
      snapshot.metadata.errors.forEach(error => console.log(`   - ${error}`));
    }

    console.log('\n📊 TOP REPOSITORIES BY STARS:');
    const topRepos = snapshot.repositories
      .sort((a, b) => b.stars - a.stars)
      .slice(0, 5);

    topRepos.forEach((repo, index) => {
      console.log(`   ${index + 1}. ${repo.fullName}: ⭐ ${repo.stars.toLocaleString()} | 🍴 ${repo.forks.toLocaleString()}`);
    });

    console.log(divider + '\n');
  }
}

// Add getOctokit method to GitHubSearchClient
declare module '../src/lib/github/search-client' {
  interface GitHubSearchClient {
    getOctokit(): any;
  }
}

// Extend GitHubSearchClient prototype to expose octokit
GitHubSearchClient.prototype.getOctokit = function() {
  return this.octokit;
};

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log(`
📸 Repository Snapshot Tool

Usage: bun run scripts/snapshot-repositories.ts [options]

Options:
  --repos <urls>      Comma-separated list of repository URLs
  --file <path>       Path to file with repository URLs (one per line)
  --output <dir>      Output directory for snapshots (default: output/snapshots)
  --rotate-tokens     Enable token rotation for higher rate limits
  --log-to-file       Save logs to file
  --help              Show this help message

Examples:
  # Snapshot specific repositories
  bun run scripts/snapshot-repositories.ts --repos "github.com/aztecprotocol/aztec-packages,github.com/noir-lang/noir"

  # Snapshot from file
  bun run scripts/snapshot-repositories.ts --file hackathon-repos.txt

  # With token rotation and file logging
  bun run scripts/snapshot-repositories.ts --file repos.txt --rotate-tokens --log-to-file

  # Custom output directory
  bun run scripts/snapshot-repositories.ts --file repos.txt --output snapshots/hackathon

Input File Format:
  https://github.com/owner/repo1
  github.com/owner/repo2
  owner/repo3
  # Comments are supported
    `);
    process.exit(0);
  }

  let repositories: string[] = [];
  let outputDir = 'output/snapshots';
  let useTokenRotation = false;
  let logToFile = false;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--repos':
        repositories = args[++i].split(',').map(r => r.trim());
        break;
      case '--file':
        const filePath = args[++i];
        if (!existsSync(filePath)) {
          console.error(`❌ File not found: ${filePath}`);
          process.exit(1);
        }
        const content = readFileSync(filePath, 'utf-8');
        repositories = content
          .split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('#'));
        break;
      case '--output':
        outputDir = args[++i];
        break;
      case '--rotate-tokens':
        useTokenRotation = true;
        break;
      case '--log-to-file':
        logToFile = true;
        break;
    }
  }

  if (repositories.length === 0) {
    console.error('❌ No repositories specified. Use --repos or --file');
    process.exit(1);
  }

  console.log(`📸 Snapshotting ${repositories.length} repositories...`);
  if (useTokenRotation) console.log('🔄 Token rotation enabled');
  if (logToFile) console.log('📝 Logging to file enabled');

  // Create snapshot tool
  const tool = new RepositorySnapshotTool(useTokenRotation, logToFile);

  // Create snapshot
  const snapshot = await tool.createSnapshot(repositories);

  // Save snapshot
  const projectRoot = resolve(import.meta.dir as string, '..');
  const fullOutputDir = resolve(projectRoot, outputDir);
  const savedPath = tool.saveSnapshot(snapshot, fullOutputDir);

  // Print summary
  tool.printSummary(snapshot);

  console.log(`💾 Snapshot saved to: ${savedPath}`);
  console.log(`📁 History updated in: ${fullOutputDir}`);
}

main().catch(console.error);