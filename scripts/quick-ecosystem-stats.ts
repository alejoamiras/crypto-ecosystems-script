#!/usr/bin/env bun
/**
 * Quick ecosystem statistics without API calls
 * Shows what repositories are available for analysis
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

interface Repository {
  url: string;
  ecosystem: string;
  tags: string[];
  source: string;
}

interface RepositoryDatabase {
  generatedAt: string;
  totalRepositories: number;
  byEcosystem: { [key: string]: number };
  bySource: { electricCapital: number; discovered: number };
  repositories: Repository[];
}

function analyzeDatabase(database: RepositoryDatabase) {
  console.log('='.repeat(70));
  console.log('CONSOLIDATED REPOSITORY DATABASE ANALYSIS');
  console.log('='.repeat(70));
  console.log(`Generated: ${new Date(database.generatedAt).toLocaleString()}`);
  console.log(`Total Repositories: ${database.totalRepositories.toLocaleString()}`);

  console.log('\n📊 REPOSITORIES BY ECOSYSTEM:');
  console.log('-'.repeat(40));
  for (const [ecosystem, count] of Object.entries(database.byEcosystem)) {
    const percentage = ((count / database.totalRepositories) * 100).toFixed(1);
    console.log(`  ${ecosystem}: ${count.toLocaleString()} (${percentage}%)`);
  }

  console.log('\n📦 REPOSITORIES BY SOURCE:');
  console.log('-'.repeat(40));
  console.log(`  Electric Capital (tracked): ${database.bySource.electricCapital.toLocaleString()}`);
  console.log(`  Newly Discovered: ${database.bySource.discovered.toLocaleString()}`);

  // Analyze tags
  const tagCounts = new Map<string, number>();
  for (const repo of database.repositories) {
    for (const tag of repo.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }

  console.log('\n🏷️  TOP TECHNOLOGY TAGS:');
  console.log('-'.repeat(40));
  const sortedTags = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  for (const [tag, count] of sortedTags) {
    const percentage = ((count / database.totalRepositories) * 100).toFixed(1);
    console.log(`  #${tag}: ${count.toLocaleString()} repos (${percentage}%)`);
  }

  // Find popular organizations
  const orgCounts = new Map<string, number>();
  for (const repo of database.repositories) {
    const match = repo.url.match(/github\.com\/([^/]+)/);
    if (match) {
      const org = match[1];
      orgCounts.set(org, (orgCounts.get(org) || 0) + 1);
    }
  }

  console.log('\n👥 TOP ORGANIZATIONS/USERS:');
  console.log('-'.repeat(40));
  const sortedOrgs = Array.from(orgCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  for (const [org, count] of sortedOrgs) {
    if (count > 1) {
      console.log(`  ${org}: ${count} repositories`);
    }
  }

  // Sample repositories by ecosystem
  console.log('\n📝 SAMPLE REPOSITORIES:');

  for (const ecosystem of Object.keys(database.byEcosystem)) {
    console.log(`\n${ecosystem}:`);
    const ecosystemRepos = database.repositories
      .filter(r => r.ecosystem === ecosystem)
      .slice(0, 5);

    for (const repo of ecosystemRepos) {
      const repoName = repo.url.split('/').slice(-2).join('/');
      const tags = repo.tags.map(t => `#${t}`).join(' ');
      console.log(`  - ${repoName} ${tags}`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('AVAILABLE QUERIES');
  console.log('='.repeat(70));
  console.log('\n🔍 You can now run these queries with the activity script:\n');

  const examples = [
    {
      title: 'Unique developers in Aztec (last 10 days)',
      command: 'bun run scripts/query-ecosystem-activity.ts --ecosystem "Aztec Protocol" --days 10'
    },
    {
      title: 'Noir Lang monthly activity',
      command: 'bun run scripts/query-ecosystem-activity.ts --ecosystem "Noir Lang" --days 30'
    },
    {
      title: 'Export Aztec developers as CSV',
      command: 'bun run scripts/query-ecosystem-activity.ts --ecosystem "Aztec Protocol" --days 7 --csv'
    },
    {
      title: 'Save detailed metrics to JSON',
      command: 'bun run scripts/query-ecosystem-activity.ts --ecosystem "Noir Lang" --days 14 --output noir-2weeks.json'
    }
  ];

  examples.forEach((example, index) => {
    console.log(`${index + 1}. ${example.title}:`);
    console.log(`   ${example.command}\n`);
  });

  console.log('💡 TIP: Add --help to see all available options');
  console.log('⚠️  NOTE: Querying activity requires a GitHub token in your .env file');
}

function main() {
  const projectRoot = resolve(import.meta.dir as string, '..');
  const dbPath = resolve(projectRoot, 'output/repository-database.json');

  try {
    const content = readFileSync(dbPath, 'utf-8');
    const database: RepositoryDatabase = JSON.parse(content);
    analyzeDatabase(database);
  } catch (error) {
    console.error('Failed to load repository database.');
    console.error('Please run: bun run scripts/create-repository-database.ts');
    process.exit(1);
  }
}

main();