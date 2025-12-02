#!/usr/bin/env bun
/**
 * Snapshot Comparison Tool
 * Compares repository snapshots to track changes over time
 * Shows differences in stars, forks, and other metrics
 */

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { resolve, join } from 'path';
import { logger } from '../src/lib/logger';
import type { Logger } from 'pino';

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

interface RepositoryComparison {
  repository: string;
  url: string;
  metrics: {
    stars: { before: number; after: number; change: number; percentChange: number };
    forks: { before: number; after: number; change: number; percentChange: number };
    watchers: { before: number; after: number; change: number; percentChange: number };
    openIssues: { before: number; after: number; change: number; percentChange: number };
    size: { before: number; after: number; change: number; percentChange: number };
    contributors?: { before?: number; after?: number; change?: number; percentChange?: number };
    releases?: { before?: number; after?: number; change?: number; percentChange?: number };
  };
  status: 'unchanged' | 'improved' | 'declined' | 'new' | 'removed';
}

interface ComparisonReport {
  generatedAt: string;
  beforeSnapshot: {
    date: string;
    timestamp: string;
    totalRepos: number;
  };
  afterSnapshot: {
    date: string;
    timestamp: string;
    totalRepos: number;
  };
  timeDifference: {
    days: number;
    hours: number;
  };
  summary: {
    totalStars: { before: number; after: number; change: number; percentChange: number };
    totalForks: { before: number; after: number; change: number; percentChange: number };
    totalWatchers: { before: number; after: number; change: number; percentChange: number };
    avgStarsPerRepo: { before: number; after: number; change: number };
    avgForksPerRepo: { before: number; after: number; change: number };
    newRepositories: string[];
    removedRepositories: string[];
    topGainers: RepositoryComparison[];
    topLosers: RepositoryComparison[];
  };
  repositories: RepositoryComparison[];
}

class SnapshotComparisonTool {
  private log: Logger;

  constructor() {
    this.log = logger;
  }

  loadSnapshot(filePath: string): Snapshot {
    if (!existsSync(filePath)) {
      throw new Error(`Snapshot file not found: ${filePath}`);
    }

    const content = readFileSync(filePath, 'utf-8');
    const snapshot = JSON.parse(content);

    this.log.info(`Loaded snapshot from ${snapshot.date} with ${snapshot.repositories.length} repositories`);
    return snapshot;
  }

  calculatePercentChange(before: number, after: number): number {
    if (before === 0) return after > 0 ? 100 : 0;
    return Math.round(((after - before) / before) * 100 * 10) / 10;
  }

  compareRepositories(before: RepositoryMetrics, after: RepositoryMetrics): RepositoryComparison {
    const starChange = after.stars - before.stars;
    const forkChange = after.forks - before.forks;
    const watcherChange = after.watchers - before.watchers;

    // Determine status
    let status: RepositoryComparison['status'] = 'unchanged';
    if (starChange > 0 || forkChange > 0) {
      status = 'improved';
    } else if (starChange < 0 || forkChange < 0) {
      status = 'declined';
    }

    return {
      repository: after.fullName,
      url: after.url,
      metrics: {
        stars: {
          before: before.stars,
          after: after.stars,
          change: starChange,
          percentChange: this.calculatePercentChange(before.stars, after.stars)
        },
        forks: {
          before: before.forks,
          after: after.forks,
          change: forkChange,
          percentChange: this.calculatePercentChange(before.forks, after.forks)
        },
        watchers: {
          before: before.watchers,
          after: after.watchers,
          change: watcherChange,
          percentChange: this.calculatePercentChange(before.watchers, after.watchers)
        },
        openIssues: {
          before: before.openIssues,
          after: after.openIssues,
          change: after.openIssues - before.openIssues,
          percentChange: this.calculatePercentChange(before.openIssues, after.openIssues)
        },
        size: {
          before: before.size,
          after: after.size,
          change: after.size - before.size,
          percentChange: this.calculatePercentChange(before.size, after.size)
        },
        contributors: before.contributors && after.contributors ? {
          before: before.contributors,
          after: after.contributors,
          change: after.contributors - before.contributors,
          percentChange: this.calculatePercentChange(before.contributors, after.contributors)
        } : undefined,
        releases: before.releases !== undefined && after.releases !== undefined ? {
          before: before.releases,
          after: after.releases,
          change: after.releases - before.releases,
          percentChange: this.calculatePercentChange(before.releases, after.releases)
        } : undefined
      },
      status
    };
  }

  compareSnapshots(beforeSnapshot: Snapshot, afterSnapshot: Snapshot): ComparisonReport {
    this.log.info('Comparing snapshots...');

    // Calculate time difference
    const beforeTime = new Date(beforeSnapshot.timestamp).getTime();
    const afterTime = new Date(afterSnapshot.timestamp).getTime();
    const timeDiff = afterTime - beforeTime;
    const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
    const hoursDiff = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    // Create maps for easy lookup
    const beforeMap = new Map<string, RepositoryMetrics>();
    const afterMap = new Map<string, RepositoryMetrics>();

    beforeSnapshot.repositories.forEach(repo => {
      beforeMap.set(repo.fullName, repo);
    });

    afterSnapshot.repositories.forEach(repo => {
      afterMap.set(repo.fullName, repo);
    });

    // Compare repositories
    const comparisons: RepositoryComparison[] = [];
    const newRepos: string[] = [];
    const removedRepos: string[] = [];

    // Check for changes and new repos
    afterMap.forEach((afterRepo, fullName) => {
      const beforeRepo = beforeMap.get(fullName);
      if (beforeRepo) {
        comparisons.push(this.compareRepositories(beforeRepo, afterRepo));
      } else {
        newRepos.push(fullName);
        comparisons.push({
          repository: fullName,
          url: afterRepo.url,
          metrics: {
            stars: { before: 0, after: afterRepo.stars, change: afterRepo.stars, percentChange: 100 },
            forks: { before: 0, after: afterRepo.forks, change: afterRepo.forks, percentChange: 100 },
            watchers: { before: 0, after: afterRepo.watchers, change: afterRepo.watchers, percentChange: 100 },
            openIssues: { before: 0, after: afterRepo.openIssues, change: afterRepo.openIssues, percentChange: 100 },
            size: { before: 0, after: afterRepo.size, change: afterRepo.size, percentChange: 100 }
          },
          status: 'new'
        });
      }
    });

    // Check for removed repos
    beforeMap.forEach((beforeRepo, fullName) => {
      if (!afterMap.has(fullName)) {
        removedRepos.push(fullName);
        comparisons.push({
          repository: fullName,
          url: beforeRepo.url,
          metrics: {
            stars: { before: beforeRepo.stars, after: 0, change: -beforeRepo.stars, percentChange: -100 },
            forks: { before: beforeRepo.forks, after: 0, change: -beforeRepo.forks, percentChange: -100 },
            watchers: { before: beforeRepo.watchers, after: 0, change: -beforeRepo.watchers, percentChange: -100 },
            openIssues: { before: beforeRepo.openIssues, after: 0, change: -beforeRepo.openIssues, percentChange: -100 },
            size: { before: beforeRepo.size, after: 0, change: -beforeRepo.size, percentChange: -100 }
          },
          status: 'removed'
        });
      }
    });

    // Sort by star changes to find top gainers and losers
    const sortedByStarChange = [...comparisons]
      .filter(c => c.status !== 'new' && c.status !== 'removed')
      .sort((a, b) => b.metrics.stars.change - a.metrics.stars.change);

    const topGainers = sortedByStarChange
      .filter(c => c.metrics.stars.change > 0)
      .slice(0, 5);

    const topLosers = sortedByStarChange
      .filter(c => c.metrics.stars.change < 0)
      .slice(-5)
      .reverse();

    const report: ComparisonReport = {
      generatedAt: new Date().toISOString(),
      beforeSnapshot: {
        date: beforeSnapshot.date,
        timestamp: beforeSnapshot.timestamp,
        totalRepos: beforeSnapshot.metadata.totalRepos
      },
      afterSnapshot: {
        date: afterSnapshot.date,
        timestamp: afterSnapshot.timestamp,
        totalRepos: afterSnapshot.metadata.totalRepos
      },
      timeDifference: {
        days: daysDiff,
        hours: hoursDiff
      },
      summary: {
        totalStars: {
          before: beforeSnapshot.metadata.totalStars,
          after: afterSnapshot.metadata.totalStars,
          change: afterSnapshot.metadata.totalStars - beforeSnapshot.metadata.totalStars,
          percentChange: this.calculatePercentChange(
            beforeSnapshot.metadata.totalStars,
            afterSnapshot.metadata.totalStars
          )
        },
        totalForks: {
          before: beforeSnapshot.metadata.totalForks,
          after: afterSnapshot.metadata.totalForks,
          change: afterSnapshot.metadata.totalForks - beforeSnapshot.metadata.totalForks,
          percentChange: this.calculatePercentChange(
            beforeSnapshot.metadata.totalForks,
            afterSnapshot.metadata.totalForks
          )
        },
        totalWatchers: {
          before: beforeSnapshot.metadata.totalWatchers,
          after: afterSnapshot.metadata.totalWatchers,
          change: afterSnapshot.metadata.totalWatchers - beforeSnapshot.metadata.totalWatchers,
          percentChange: this.calculatePercentChange(
            beforeSnapshot.metadata.totalWatchers,
            afterSnapshot.metadata.totalWatchers
          )
        },
        avgStarsPerRepo: {
          before: beforeSnapshot.metadata.avgStarsPerRepo,
          after: afterSnapshot.metadata.avgStarsPerRepo,
          change: afterSnapshot.metadata.avgStarsPerRepo - beforeSnapshot.metadata.avgStarsPerRepo
        },
        avgForksPerRepo: {
          before: beforeSnapshot.metadata.avgForksPerRepo,
          after: afterSnapshot.metadata.avgForksPerRepo,
          change: afterSnapshot.metadata.avgForksPerRepo - beforeSnapshot.metadata.avgForksPerRepo
        },
        newRepositories: newRepos,
        removedRepositories: removedRepos,
        topGainers,
        topLosers
      },
      repositories: comparisons
    };

    this.log.info('Comparison complete', {
      timeDifference: `${daysDiff} days, ${hoursDiff} hours`,
      repositories: comparisons.length,
      newRepos: newRepos.length,
      removedRepos: removedRepos.length
    });

    return report;
  }

  printReport(report: ComparisonReport, detailed: boolean = false) {
    const divider = '═'.repeat(70);
    const subDivider = '─'.repeat(70);

    console.log('\n' + divider);
    console.log('📊 REPOSITORY SNAPSHOT COMPARISON REPORT');
    console.log(divider);

    console.log('\n📅 SNAPSHOT INFORMATION:');
    console.log(subDivider);
    console.log(`Before: ${report.beforeSnapshot.date} (${report.beforeSnapshot.totalRepos} repos)`);
    console.log(`After:  ${report.afterSnapshot.date} (${report.afterSnapshot.totalRepos} repos)`);
    console.log(`Period: ${report.timeDifference.days} days, ${report.timeDifference.hours} hours`);

    console.log('\n📈 OVERALL METRICS:');
    console.log(subDivider);
    console.log(this.formatMetricLine('Total Stars', report.summary.totalStars));
    console.log(this.formatMetricLine('Total Forks', report.summary.totalForks));
    console.log(this.formatMetricLine('Total Watchers', report.summary.totalWatchers));
    console.log(this.formatAvgLine('Avg Stars/Repo', report.summary.avgStarsPerRepo));
    console.log(this.formatAvgLine('Avg Forks/Repo', report.summary.avgForksPerRepo));

    if (report.summary.newRepositories.length > 0) {
      console.log(`\n🆕 NEW REPOSITORIES (${report.summary.newRepositories.length}):`);
      report.summary.newRepositories.slice(0, 5).forEach(repo => {
        console.log(`   • ${repo}`);
      });
      if (report.summary.newRepositories.length > 5) {
        console.log(`   ... and ${report.summary.newRepositories.length - 5} more`);
      }
    }

    if (report.summary.removedRepositories.length > 0) {
      console.log(`\n❌ REMOVED REPOSITORIES (${report.summary.removedRepositories.length}):`);
      report.summary.removedRepositories.slice(0, 5).forEach(repo => {
        console.log(`   • ${repo}`);
      });
      if (report.summary.removedRepositories.length > 5) {
        console.log(`   ... and ${report.summary.removedRepositories.length - 5} more`);
      }
    }

    if (report.summary.topGainers.length > 0) {
      console.log('\n🚀 TOP GAINERS (by stars):');
      console.log(subDivider);
      report.summary.topGainers.forEach((repo, index) => {
        const stars = repo.metrics.stars;
        console.log(`${index + 1}. ${repo.repository}`);
        console.log(`   ⭐ ${stars.before} → ${stars.after} (+${stars.change}, +${stars.percentChange}%)`);
        console.log(`   🍴 ${repo.metrics.forks.before} → ${repo.metrics.forks.after} (+${repo.metrics.forks.change})`);
      });
    }

    if (report.summary.topLosers.length > 0) {
      console.log('\n📉 TOP DECLINERS (by stars):');
      console.log(subDivider);
      report.summary.topLosers.forEach((repo, index) => {
        const stars = repo.metrics.stars;
        console.log(`${index + 1}. ${repo.repository}`);
        console.log(`   ⭐ ${stars.before} → ${stars.after} (${stars.change}, ${stars.percentChange}%)`);
        console.log(`   🍴 ${repo.metrics.forks.before} → ${repo.metrics.forks.after} (${repo.metrics.forks.change})`);
      });
    }

    if (detailed) {
      console.log('\n📋 DETAILED REPOSITORY CHANGES:');
      console.log(subDivider);

      const changedRepos = report.repositories
        .filter(r => r.status !== 'unchanged' && r.status !== 'new' && r.status !== 'removed')
        .sort((a, b) => Math.abs(b.metrics.stars.change) - Math.abs(a.metrics.stars.change));

      changedRepos.forEach(repo => {
        console.log(`\n${repo.repository}:`);
        console.log(`  ⭐ Stars: ${repo.metrics.stars.before} → ${repo.metrics.stars.after} (${this.formatChange(repo.metrics.stars.change)})`);
        console.log(`  🍴 Forks: ${repo.metrics.forks.before} → ${repo.metrics.forks.after} (${this.formatChange(repo.metrics.forks.change)})`);
        console.log(`  👁️  Watch: ${repo.metrics.watchers.before} → ${repo.metrics.watchers.after} (${this.formatChange(repo.metrics.watchers.change)})`);
      });
    }

    console.log('\n' + divider + '\n');
  }

  private formatMetricLine(label: string, metric: { before: number; after: number; change: number; percentChange: number }): string {
    const changeStr = this.formatChange(metric.change);
    const percentStr = metric.percentChange >= 0 ? `+${metric.percentChange}%` : `${metric.percentChange}%`;
    return `${label.padEnd(15)} ${metric.before.toLocaleString().padStart(8)} → ${metric.after.toLocaleString().padStart(8)}  (${changeStr}, ${percentStr})`;
  }

  private formatAvgLine(label: string, metric: { before: number; after: number; change: number }): string {
    const changeStr = this.formatChange(metric.change);
    return `${label.padEnd(15)} ${metric.before.toString().padStart(8)} → ${metric.after.toString().padStart(8)}  (${changeStr})`;
  }

  private formatChange(change: number): string {
    if (change > 0) return `+${change}`;
    return change.toString();
  }

  saveReport(report: ComparisonReport, outputPath: string) {
    writeFileSync(outputPath, JSON.stringify(report, null, 2));
    this.log.info(`Report saved to: ${outputPath}`);
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log(`
📊 Snapshot Comparison Tool

Usage: bun run scripts/compare-snapshots.ts [options]

Options:
  --before <path>     Path to the "before" snapshot file (required)
  --after <path>      Path to the "after" snapshot file (required)
  --detailed          Show detailed changes for all repositories
  --save <path>       Save comparison report to JSON file
  --latest            Compare two most recent snapshots (overrides --before/--after)
  --help              Show this help message

Examples:
  # Compare specific snapshots
  bun run scripts/compare-snapshots.ts --before output/snapshots/snapshot-2025-01-01.json --after output/snapshots/snapshot-2025-01-10.json

  # Compare with detailed output and save
  bun run scripts/compare-snapshots.ts --before before.json --after after.json --detailed --save report.json

  # Compare latest two snapshots
  bun run scripts/compare-snapshots.ts --latest

  # Use convenience paths
  bun run scripts/compare-snapshots.ts --before output/snapshots/snapshot-latest.json --after output/snapshots/snapshot-latest.json --detailed
    `);
    process.exit(0);
  }

  let beforePath: string | null = null;
  let afterPath: string | null = null;
  let detailed = false;
  let savePath: string | null = null;
  let useLatest = false;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--before':
        beforePath = args[++i];
        break;
      case '--after':
        afterPath = args[++i];
        break;
      case '--detailed':
        detailed = true;
        break;
      case '--save':
        savePath = args[++i];
        break;
      case '--latest':
        useLatest = true;
        break;
    }
  }

  const tool = new SnapshotComparisonTool();

  // Handle --latest option
  if (useLatest) {
    const projectRoot = resolve(import.meta.dir as string, '..');
    const historyPath = join(projectRoot, 'output/snapshots/snapshot-history.json');

    if (!existsSync(historyPath)) {
      console.error('❌ No snapshot history found. Create snapshots first.');
      process.exit(1);
    }

    const historyContent = readFileSync(historyPath, 'utf-8');
    const history = JSON.parse(historyContent);

    if (history.snapshots.length < 2) {
      console.error('❌ Need at least 2 snapshots to compare. Current count:', history.snapshots.length);
      process.exit(1);
    }

    // Use last two snapshots from history
    const beforeSnapshot = history.snapshots[history.snapshots.length - 2];
    const afterSnapshot = history.snapshots[history.snapshots.length - 1];

    console.log(`Comparing latest snapshots from history...`);
    const report = tool.compareSnapshots(beforeSnapshot, afterSnapshot);
    tool.printReport(report, detailed);

    if (savePath) {
      tool.saveReport(report, savePath);
    }
  } else {
    // Use specified paths
    if (!beforePath || !afterPath) {
      console.error('❌ Both --before and --after paths are required (or use --latest)');
      process.exit(1);
    }

    try {
      const beforeSnapshot = tool.loadSnapshot(beforePath);
      const afterSnapshot = tool.loadSnapshot(afterPath);

      const report = tool.compareSnapshots(beforeSnapshot, afterSnapshot);
      tool.printReport(report, detailed);

      if (savePath) {
        tool.saveReport(report, savePath);
      }
    } catch (error: any) {
      console.error(`❌ Error: ${error.message}`);
      process.exit(1);
    }
  }
}

main().catch(console.error);