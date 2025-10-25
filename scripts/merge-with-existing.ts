#!/usr/bin/env bun

import * as fs from "fs";
import * as path from "path";
import { createFileLogger } from "../src/lib/logger";

// Create logger
const logger = createFileLogger(undefined, "info", true);

interface TrackedRepo {
  url: string;
  sub_ecosystems: string[];
}

interface MigrationEntry {
  ecosystem: string;
  url: string;
  tags: string[];
}

/**
 * Load already tracked repositories from Electric Capital export
 */
async function loadTrackedRepos(filePath: string): Promise<Set<string>> {
  const trackedUrls = new Set<string>();

  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const lines = fileContent.trim().split('\n');

    for (const line of lines) {
      try {
        const repo: TrackedRepo = JSON.parse(line);
        const normalizedUrl = repo.url.toLowerCase()
          .replace(/\.git$/, '')
          .replace(/\/$/, '');

        trackedUrls.add(normalizedUrl);

        // Also add the owner/repo format
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
    logger.error(`Failed to load tracked repos file: ${error}`);
    throw error;
  }

  return trackedUrls;
}

/**
 * Parse a repadd command line
 */
function parseRepaddLine(line: string): MigrationEntry | null {
  const match = line.match(/^repadd\s+"([^"]+)"\s+(https:\/\/[^\s]+)\s+(.*)$/);
  if (!match) return null;

  const [, ecosystem, url, tagsStr] = match;
  const tags = tagsStr.split(/\s+/).filter(tag => tag.startsWith('#'));

  // Normalize URL
  const normalizedUrl = url.toLowerCase()
    .replace(/\.git$/, '')
    .replace(/\/$/, '');

  return {
    ecosystem,
    url: normalizedUrl,
    tags
  };
}

/**
 * Read and parse a migration file
 */
function parseMigrationFile(filePath: string): MigrationEntry[] {
  const entries: MigrationEntry[] = [];

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    for (const line of lines) {
      if (line.startsWith('repadd')) {
        const entry = parseRepaddLine(line);
        if (entry) {
          entries.push(entry);
        }
      }
    }

    logger.info(`Parsed ${entries.length} entries from ${path.basename(filePath)}`);
  } catch (error) {
    logger.error(`Failed to parse file ${filePath}: ${error}`);
  }

  return entries;
}

/**
 * Filter out already tracked repositories
 */
function filterNewRepos(entries: MigrationEntry[], trackedRepos: Set<string>): MigrationEntry[] {
  const newEntries: MigrationEntry[] = [];

  for (const entry of entries) {
    // Check if URL is tracked
    if (trackedRepos.has(entry.url)) {
      continue;
    }

    // Extract owner/repo from URL and check
    const match = entry.url.match(/github\.com\/([^\/]+\/[^\/]+)/);
    if (match && trackedRepos.has(match[1].toLowerCase())) {
      continue;
    }

    newEntries.push(entry);
  }

  return newEntries;
}

/**
 * Generate migration file content
 */
function generateMigrationFile(entries: MigrationEntry[], isFiltered: boolean): string {
  const lines: string[] = [];

  // Group by ecosystem
  const grouped = new Map<string, MigrationEntry[]>();
  for (const entry of entries) {
    if (!grouped.has(entry.ecosystem)) {
      grouped.set(entry.ecosystem, []);
    }
    grouped.get(entry.ecosystem)!.push(entry);
  }

  lines.push("# Electric Capital Migration Commands - FINAL");
  if (isFiltered) {
    lines.push("# (Filtered to exclude already tracked repositories)");
  }
  lines.push(`# Generated: ${new Date().toISOString()}`);
  lines.push(`# Total repositories: ${entries.length}`);
  lines.push("");

  // Sort ecosystems for consistent output
  const ecosystems = Array.from(grouped.keys()).sort();

  for (const ecosystem of ecosystems) {
    const ecosystemEntries = grouped.get(ecosystem)!;
    const sortedEntries = ecosystemEntries.sort((a, b) => a.url.localeCompare(b.url));

    lines.push(`# ${ecosystem} (${ecosystemEntries.length} repositories)`);

    for (const entry of sortedEntries) {
      const tags = Array.from(new Set(entry.tags)).sort().join(' ');
      lines.push(`repadd "${entry.ecosystem}" ${entry.url} ${tags}`);
    }

    lines.push("");
  }

  return lines.join('\n');
}

/**
 * Main execution
 */
async function main() {
  try {
    logger.info("Starting merge with existing tracked repositories...");

    // Parse command line arguments
    const args = process.argv.slice(2);
    const inputFile = args[0];
    const skipExistingCheck = args.includes('--skip-existing');

    if (!inputFile) {
      console.error("Usage: bun run merge-with-existing.ts <migration-file> [--skip-existing]");
      console.error("  <migration-file>: Path to the migration file to process");
      console.error("  --skip-existing: Skip checking against existing tracked repos");
      process.exit(1);
    }

    if (!fs.existsSync(inputFile)) {
      logger.error(`Input file does not exist: ${inputFile}`);
      process.exit(1);
    }

    // Parse the input migration file
    const entries = parseMigrationFile(inputFile);
    logger.info(`Loaded ${entries.length} entries from input file`);

    let finalEntries = entries;
    let removedCount = 0;

    // Check against existing tracked repos unless skipped
    if (!skipExistingCheck) {
      const trackedReposFile = './static/Aztec-Protocol-export.jsonl';

      if (fs.existsSync(trackedReposFile)) {
        const trackedRepos = await loadTrackedRepos(trackedReposFile);
        const beforeCount = finalEntries.length;
        finalEntries = filterNewRepos(finalEntries, trackedRepos);
        removedCount = beforeCount - finalEntries.length;

        if (removedCount > 0) {
          logger.info(`Removed ${removedCount} repositories that are already tracked`);
        }
      } else {
        logger.warn("Tracked repos file not found, skipping existing check");
      }
    }

    // Generate the final migration file
    const finalContent = generateMigrationFile(finalEntries, !skipExistingCheck);

    // Save to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputDir = './output';

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, `final-migration-merged-${timestamp}.txt`);
    fs.writeFileSync(outputPath, finalContent);

    logger.info(`Final migration file saved to: ${outputPath}`);

    // Print summary
    console.log("\n=== Merge Summary ===");
    console.log(`Input file: ${inputFile}`);
    console.log(`Total entries: ${entries.length}`);

    if (!skipExistingCheck) {
      console.log(`Already tracked (removed): ${removedCount}`);
    }

    console.log(`New repositories: ${finalEntries.length}`);

    // Group by ecosystem for summary
    const grouped = new Map<string, number>();
    for (const entry of finalEntries) {
      grouped.set(entry.ecosystem, (grouped.get(entry.ecosystem) || 0) + 1);
    }

    console.log("\nBreakdown by ecosystem:");
    for (const [ecosystem, count] of grouped) {
      console.log(`  ${ecosystem}: ${count} repositories`);
    }

    console.log(`\nOutput file: ${outputPath}`);

  } catch (error) {
    logger.error(`Failed to merge migration files: ${error}`);
    console.error("Error:", error);
    process.exit(1);
  }
}

// Run the script
if (import.meta.main) {
  main();
}