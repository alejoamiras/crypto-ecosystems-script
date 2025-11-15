#!/usr/bin/env bun
/**
 * Snapshot Viewer Tool
 * View and analyze repository metrics from a snapshot
 * Display repositories sorted by stars, forks, or other metrics
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { logger } from '../src/lib/logger';

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
  createdAt: string;
  updatedAt: string;
  pushedAt: string;
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

class SnapshotViewer {
  private log = logger;

  loadSnapshot(filePath: string): Snapshot {
    if (!existsSync(filePath)) {
      throw new Error(`Snapshot file not found: ${filePath}`);
    }

    const content = readFileSync(filePath, 'utf-8');
    const snapshot = JSON.parse(content);

    this.log.info(`Loaded snapshot from ${snapshot.date} with ${snapshot.repositories.length} repositories`);
    return snapshot;
  }

  displaySnapshot(
    snapshot: Snapshot,
    options: {
      sortBy: 'stars' | 'forks' | 'watchers' | 'issues' | 'size' | 'contributors';
      limit?: number;
      showDescription?: boolean;
      showLanguage?: boolean;
      showTopics?: boolean;
      showDates?: boolean;
      showExtras?: boolean;
      filterLanguage?: string;
      filterTopic?: string;
      minStars?: number;
      minForks?: number;
    }
  ) {
    const divider = '═'.repeat(80);
    const subDivider = '─'.repeat(80);

    console.log('\n' + divider);
    console.log('📸 REPOSITORY SNAPSHOT VIEWER');
    console.log(divider);
    console.log(`📅 Date: ${snapshot.date}`);
    console.log(`🕐 Time: ${new Date(snapshot.timestamp).toLocaleTimeString()}`);
    console.log(`📦 Total Repositories: ${snapshot.metadata.totalRepos}`);
    console.log(subDivider);

    // Apply filters
    let filteredRepos = [...snapshot.repositories];

    if (options.filterLanguage) {
      filteredRepos = filteredRepos.filter(
        repo => repo.language?.toLowerCase() === options.filterLanguage?.toLowerCase()
      );
      console.log(`🔍 Filter: Language = ${options.filterLanguage} (${filteredRepos.length} repos)`);
    }

    if (options.filterTopic) {
      filteredRepos = filteredRepos.filter(
        repo => repo.topics?.some(topic =>
          topic.toLowerCase().includes(options.filterTopic?.toLowerCase() || '')
        )
      );
      console.log(`🔍 Filter: Topic contains "${options.filterTopic}" (${filteredRepos.length} repos)`);
    }

    if (options.minStars !== undefined) {
      filteredRepos = filteredRepos.filter(repo => repo.stars >= (options.minStars || 0));
      console.log(`🔍 Filter: Stars ≥ ${options.minStars} (${filteredRepos.length} repos)`);
    }

    if (options.minForks !== undefined) {
      filteredRepos = filteredRepos.filter(repo => repo.forks >= (options.minForks || 0));
      console.log(`🔍 Filter: Forks ≥ ${options.minForks} (${filteredRepos.length} repos)`);
    }

    if (filteredRepos.length !== snapshot.repositories.length) {
      console.log(subDivider);
    }

    // Sort repositories
    const sortedRepos = this.sortRepositories(filteredRepos, options.sortBy);

    // Calculate statistics for filtered repos
    const totalStars = filteredRepos.reduce((sum, repo) => sum + repo.stars, 0);
    const totalForks = filteredRepos.reduce((sum, repo) => sum + repo.forks, 0);
    const totalWatchers = filteredRepos.reduce((sum, repo) => sum + repo.watchers, 0);

    console.log('📊 STATISTICS:');
    console.log(`⭐ Total Stars: ${totalStars.toLocaleString()}`);
    console.log(`🍴 Total Forks: ${totalForks.toLocaleString()}`);
    console.log(`👁️  Total Watchers: ${totalWatchers.toLocaleString()}`);
    console.log(`📈 Averages: ⭐ ${Math.round(totalStars / filteredRepos.length)}/repo | 🍴 ${Math.round(totalForks / filteredRepos.length)}/repo`);
    console.log(subDivider);

    // Display repositories
    const displayLimit = options.limit || sortedRepos.length;
    const reposToShow = sortedRepos.slice(0, displayLimit);

    const sortLabel = {
      stars: 'STARS',
      forks: 'FORKS',
      watchers: 'WATCHERS',
      issues: 'OPEN ISSUES',
      size: 'SIZE (KB)',
      contributors: 'CONTRIBUTORS'
    }[options.sortBy];

    console.log(`\n📊 TOP REPOSITORIES BY ${sortLabel}:`);
    console.log(subDivider);

    reposToShow.forEach((repo, index) => {
      const rank = `${index + 1}.`.padEnd(4);
      const name = repo.fullName.padEnd(40);

      // Basic metrics line
      let metricsLine = `${rank}${name} ⭐ ${repo.stars.toLocaleString().padStart(6)} | 🍴 ${repo.forks.toLocaleString().padStart(6)}`;

      // Add additional metrics based on sort
      if (options.sortBy === 'watchers') {
        metricsLine += ` | 👁️  ${repo.watchers.toLocaleString().padStart(5)}`;
      } else if (options.sortBy === 'issues') {
        metricsLine += ` | 🐛 ${repo.openIssues.toLocaleString().padStart(5)}`;
      } else if (options.sortBy === 'size') {
        metricsLine += ` | 💾 ${(repo.size / 1024).toFixed(1).padStart(7)} MB`;
      } else if (options.sortBy === 'contributors' && repo.contributors) {
        metricsLine += ` | 👥 ${repo.contributors.toLocaleString().padStart(5)}`;
      }

      console.log(metricsLine);

      // Optional additional information
      if (options.showDescription && repo.description) {
        console.log(`    📝 ${repo.description.slice(0, 70)}${repo.description.length > 70 ? '...' : ''}`);
      }

      if (options.showLanguage && repo.language) {
        console.log(`    🔧 Language: ${repo.language}`);
      }

      if (options.showTopics && repo.topics && repo.topics.length > 0) {
        console.log(`    🏷️  Topics: ${repo.topics.slice(0, 5).join(', ')}`);
      }

      if (options.showDates) {
        const created = new Date(repo.createdAt).toLocaleDateString();
        const updated = new Date(repo.updatedAt).toLocaleDateString();
        const pushed = new Date(repo.pushedAt).toLocaleDateString();
        console.log(`    📅 Created: ${created} | Updated: ${updated} | Pushed: ${pushed}`);
      }

      if (options.showExtras) {
        const extras = [];
        if (repo.openIssues > 0) extras.push(`🐛 ${repo.openIssues} issues`);
        if (repo.pullRequests?.open) extras.push(`🔀 ${repo.pullRequests.open} PRs`);
        if (repo.contributors) extras.push(`👥 ${repo.contributors} contributors`);
        if (repo.releases) extras.push(`📦 ${repo.releases} releases`);
        if (repo.license) extras.push(`📜 ${repo.license}`);
        if (extras.length > 0) {
          console.log(`    ℹ️  ${extras.join(' | ')}`);
        }
      }

      if (options.showDescription || options.showLanguage || options.showTopics || options.showDates || options.showExtras) {
        console.log('');
      }
    });

    if (displayLimit < sortedRepos.length) {
      console.log(`\n... and ${sortedRepos.length - displayLimit} more repositories`);
    }

    console.log('\n' + divider + '\n');

    // Show language distribution
    this.showLanguageDistribution(filteredRepos);

    // Show topic cloud
    if (filteredRepos.some(r => r.topics && r.topics.length > 0)) {
      this.showTopicCloud(filteredRepos);
    }
  }

  private sortRepositories(repos: RepositoryMetrics[], sortBy: string): RepositoryMetrics[] {
    return [...repos].sort((a, b) => {
      switch (sortBy) {
        case 'stars':
          return b.stars - a.stars;
        case 'forks':
          return b.forks - a.forks;
        case 'watchers':
          return b.watchers - a.watchers;
        case 'issues':
          return b.openIssues - a.openIssues;
        case 'size':
          return b.size - a.size;
        case 'contributors':
          return (b.contributors || 0) - (a.contributors || 0);
        default:
          return b.stars - a.stars;
      }
    });
  }

  private showLanguageDistribution(repos: RepositoryMetrics[]) {
    const languages = new Map<string, number>();

    repos.forEach(repo => {
      if (repo.language) {
        languages.set(repo.language, (languages.get(repo.language) || 0) + 1);
      }
    });

    if (languages.size > 0) {
      console.log('🔧 LANGUAGE DISTRIBUTION:');
      console.log('─'.repeat(80));

      const sortedLangs = Array.from(languages.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      sortedLangs.forEach(([lang, count]) => {
        const percentage = ((count / repos.length) * 100).toFixed(1);
        const bar = '█'.repeat(Math.floor((count / repos.length) * 40));
        console.log(`  ${lang.padEnd(15)} ${bar} ${count} (${percentage}%)`);
      });
      console.log('');
    }
  }

  private showTopicCloud(repos: RepositoryMetrics[]) {
    const topics = new Map<string, number>();

    repos.forEach(repo => {
      if (repo.topics) {
        repo.topics.forEach(topic => {
          topics.set(topic, (topics.get(topic) || 0) + 1);
        });
      }
    });

    if (topics.size > 0) {
      console.log('🏷️  TOP TOPICS:');
      console.log('─'.repeat(80));

      const sortedTopics = Array.from(topics.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15);

      const topicList = sortedTopics.map(([topic, count]) => `${topic} (${count})`).join(', ');
      console.log(`  ${topicList}`);
      console.log('');
    }
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log(`
📸 Snapshot Viewer Tool

Usage: bun run scripts/view-snapshot.ts [options]

Options:
  --file <path>       Path to snapshot file (default: latest)
  --sort <by>         Sort by: stars, forks, watchers, issues, size, contributors (default: stars)
  --limit <n>         Limit number of repositories shown (default: all)
  --min-stars <n>     Only show repos with at least n stars
  --min-forks <n>     Only show repos with at least n forks
  --language <lang>   Filter by programming language
  --topic <topic>     Filter by topic
  --show-description  Show repository descriptions
  --show-language     Show programming languages
  --show-topics       Show repository topics
  --show-dates        Show creation/update dates
  --show-all          Show all extra information
  --help              Show this help message

Examples:
  # View latest snapshot sorted by stars
  bun run scripts/view-snapshot.ts

  # View specific snapshot, top 20 by forks
  bun run scripts/view-snapshot.ts --file output/snapshots/snapshot-2025-01-01.json --sort forks --limit 20

  # Filter by language and minimum stars
  bun run scripts/view-snapshot.ts --language TypeScript --min-stars 100

  # Show all details for top 10 repositories
  bun run scripts/view-snapshot.ts --limit 10 --show-all

  # Find repositories with specific topic
  bun run scripts/view-snapshot.ts --topic blockchain --sort stars

  # View repositories with most contributors
  bun run scripts/view-snapshot.ts --sort contributors --limit 20
    `);
    process.exit(0);
  }

  // Parse arguments
  let filePath: string | null = null;
  let sortBy: any = 'stars';
  let limit: number | undefined;
  let showDescription = false;
  let showLanguage = false;
  let showTopics = false;
  let showDates = false;
  let showExtras = false;
  let filterLanguage: string | undefined;
  let filterTopic: string | undefined;
  let minStars: number | undefined;
  let minForks: number | undefined;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--file':
        filePath = args[++i];
        break;
      case '--sort':
        sortBy = args[++i];
        break;
      case '--limit':
        limit = parseInt(args[++i]);
        break;
      case '--min-stars':
        minStars = parseInt(args[++i]);
        break;
      case '--min-forks':
        minForks = parseInt(args[++i]);
        break;
      case '--language':
        filterLanguage = args[++i];
        break;
      case '--topic':
        filterTopic = args[++i];
        break;
      case '--show-description':
        showDescription = true;
        break;
      case '--show-language':
        showLanguage = true;
        break;
      case '--show-topics':
        showTopics = true;
        break;
      case '--show-dates':
        showDates = true;
        break;
      case '--show-all':
        showDescription = true;
        showLanguage = true;
        showTopics = true;
        showDates = true;
        showExtras = true;
        break;
    }
  }

  // Default to latest snapshot if no file specified
  if (!filePath) {
    const projectRoot = resolve(import.meta.dir as string, '..');
    filePath = join(projectRoot, 'output/snapshots/snapshot-latest.json');
  }

  const viewer = new SnapshotViewer();

  try {
    const snapshot = viewer.loadSnapshot(filePath);
    viewer.displaySnapshot(snapshot, {
      sortBy,
      limit,
      showDescription,
      showLanguage,
      showTopics,
      showDates,
      showExtras,
      filterLanguage,
      filterTopic,
      minStars,
      minForks
    });
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}`);
    console.error(`\nMake sure you have created snapshots first:`);
    console.error(`  bun run snapshot --file repos.txt`);
    process.exit(1);
  }
}

main().catch(console.error);