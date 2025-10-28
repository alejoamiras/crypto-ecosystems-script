#!/usr/bin/env bun
/**
 * Create a consolidated repository database from all sources
 * Combines static Electric Capital data with discovered repositories
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

interface Repository {
  url: string;
  ecosystem: string;
  tags: string[];
  source: 'electric-capital' | 'discovered';
  addedDate?: string;
}

interface RepositoryDatabase {
  generatedAt: string;
  totalRepositories: number;
  byEcosystem: {
    [key: string]: number;
  };
  bySource: {
    electricCapital: number;
    discovered: number;
  };
  repositories: Repository[];
}

function normalizeUrl(url: string): string {
  return url
    .toLowerCase()
    .replace(/\.git$/, '')
    .replace(/\/$/, '')
    .replace('https://github.com/', '');
}

function parseStaticData(filePath: string): Repository[] {
  const repos: Repository[] = [];
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());

  for (const line of lines) {
    try {
      const data = JSON.parse(line);
      repos.push({
        url: data.url,
        ecosystem: 'Aztec Protocol', // All static data is Aztec
        tags: ['aztec'],
        source: 'electric-capital'
      });
    } catch (e) {
      console.warn(`Failed to parse line: ${line}`);
    }
  }

  return repos;
}

function parseMigrationFile(filePath: string): Repository[] {
  const repos: Repository[] = [];
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  for (const line of lines) {
    if (line.startsWith('repadd')) {
      const match = line.match(/repadd "([^"]+)" (https:\/\/github\.com\/[^\s]+)\s+(.*)/);
      if (match) {
        const [, ecosystem, url, tagsStr] = match;
        const tags = tagsStr.split(' ').filter(tag => tag.startsWith('#')).map(tag => tag.slice(1));

        repos.push({
          url,
          ecosystem,
          tags,
          source: 'discovered',
          addedDate: new Date().toISOString().split('T')[0]
        });
      }
    }
  }

  return repos;
}

async function main() {
  console.log('Creating consolidated repository database...\n');

  const projectRoot = resolve(import.meta.dir, '..');

  // Read static Electric Capital data
  const staticFile = resolve(projectRoot, 'static/Aztec-Protocol-export.jsonl');
  const staticRepos = parseStaticData(staticFile);
  console.log(`Loaded ${staticRepos.length} repositories from Electric Capital`);

  // Read latest migration file (discovered repos)
  const migrationFile = resolve(projectRoot, 'output/final-migration-consolidated-2025-10-26T20-50-03-622Z.txt');
  const discoveredRepos = parseMigrationFile(migrationFile);
  console.log(`Loaded ${discoveredRepos.length} discovered repositories`);

  // Combine and deduplicate
  const allRepos = new Map<string, Repository>();

  // Add static repos first
  for (const repo of staticRepos) {
    const key = normalizeUrl(repo.url);
    allRepos.set(key, repo);
  }

  // Add discovered repos, marking if they're new
  let newReposCount = 0;
  for (const repo of discoveredRepos) {
    const key = normalizeUrl(repo.url);
    if (!allRepos.has(key)) {
      allRepos.set(key, repo);
      newReposCount++;
    } else {
      // Update existing repo with additional tags
      const existing = allRepos.get(key)!;
      const combinedTags = [...new Set([...existing.tags, ...repo.tags])];
      allRepos.set(key, {
        ...existing,
        tags: combinedTags,
        ecosystem: repo.ecosystem // Use discovered ecosystem as it's more specific
      });
    }
  }

  // Convert to array and calculate statistics
  const repositories = Array.from(allRepos.values());

  const byEcosystem: { [key: string]: number } = {};
  const bySource = {
    electricCapital: 0,
    discovered: 0
  };

  for (const repo of repositories) {
    // Count by ecosystem
    byEcosystem[repo.ecosystem] = (byEcosystem[repo.ecosystem] || 0) + 1;

    // Count by source
    if (repo.source === 'electric-capital') {
      bySource.electricCapital++;
    } else {
      bySource.discovered++;
    }
  }

  // Create database object
  const database: RepositoryDatabase = {
    generatedAt: new Date().toISOString(),
    totalRepositories: repositories.length,
    byEcosystem,
    bySource,
    repositories: repositories.sort((a, b) => a.url.localeCompare(b.url))
  };

  // Save to JSON file
  const outputPath = resolve(projectRoot, 'output/repository-database.json');
  writeFileSync(outputPath, JSON.stringify(database, null, 2));

  // Also create a simplified CSV for easy analysis
  const csvPath = resolve(projectRoot, 'output/repository-database.csv');
  const csvContent = [
    'url,ecosystem,tags,source',
    ...repositories.map(repo =>
      `${repo.url},"${repo.ecosystem}","${repo.tags.join(',')}",${repo.source}`
    )
  ].join('\n');
  writeFileSync(csvPath, csvContent);

  // Print summary
  console.log('\n=== Repository Database Summary ===');
  console.log(`Total repositories: ${database.totalRepositories}`);
  console.log('\nBy Ecosystem:');
  for (const [ecosystem, count] of Object.entries(byEcosystem).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${ecosystem}: ${count}`);
  }
  console.log('\nBy Source:');
  console.log(`  Electric Capital: ${bySource.electricCapital}`);
  console.log(`  Newly Discovered: ${bySource.discovered}`);
  console.log(`  New repos added: ${newReposCount}`);

  console.log('\nFiles created:');
  console.log(`  - ${outputPath}`);
  console.log(`  - ${csvPath}`);
}

main().catch(console.error);