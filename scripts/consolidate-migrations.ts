#!/usr/bin/env bun

import * as fs from "fs";
import * as path from "path";
import { createFileLogger } from "../src/lib/logger";

// Create logger
const logger = createFileLogger(undefined, "info", true);

interface MigrationEntry {
  ecosystem: string;
  url: string;
  tags: string[];
  originalLine: string;
}

/**
 * Parse a repadd command line
 */
function parseRepaddLine(line: string): MigrationEntry | null {
  // Example: repadd "Aztec Protocol" https://github.com/owner/repo #zkp #aztec #noir
  const match = line.match(/^repadd\s+"([^"]+)"\s+(https:\/\/[^\s]+)\s+(.*)$/);
  if (!match) return null;

  const [, ecosystem, url, tagsStr] = match;
  const tags = tagsStr.split(/\s+/).filter(tag => tag.startsWith('#'));

  // Normalize URL (remove trailing slashes, .git, etc)
  const normalizedUrl = url.toLowerCase()
    .replace(/\.git$/, '')
    .replace(/\/$/, '');

  return {
    ecosystem,
    url: normalizedUrl,
    tags,
    originalLine: line
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
 * Find all migration files in the output directory
 */
function findMigrationFiles(outputDir: string): string[] {
  const files: string[] = [];

  try {
    const dirContents = fs.readdirSync(outputDir);
    for (const file of dirContents) {
      if (file.startsWith('electric-capital-migration') && file.endsWith('.txt')) {
        files.push(path.join(outputDir, file));
      }
    }
  } catch (error) {
    logger.error(`Failed to read output directory: ${error}`);
  }

  return files;
}

/**
 * Consolidate and deduplicate entries
 */
function consolidateEntries(allEntries: MigrationEntry[]): Map<string, MigrationEntry> {
  const consolidated = new Map<string, MigrationEntry>();

  for (const entry of allEntries) {
    const existing = consolidated.get(entry.url);

    if (!existing) {
      consolidated.set(entry.url, entry);
    } else {
      // If duplicate, merge tags and prefer the one with more info
      const mergedTags = new Set([...existing.tags, ...entry.tags]);
      existing.tags = Array.from(mergedTags);
    }
  }

  return consolidated;
}

/**
 * Group entries by ecosystem
 */
function groupByEcosystem(entries: Map<string, MigrationEntry>): Map<string, MigrationEntry[]> {
  const grouped = new Map<string, MigrationEntry[]>();

  for (const entry of entries.values()) {
    if (!grouped.has(entry.ecosystem)) {
      grouped.set(entry.ecosystem, []);
    }
    grouped.get(entry.ecosystem)!.push(entry);
  }

  return grouped;
}

/**
 * Generate the final migration file content
 */
function generateFinalMigration(grouped: Map<string, MigrationEntry[]>): string {
  const lines: string[] = [];
  const totalCount = Array.from(grouped.values()).reduce((sum, entries) => sum + entries.length, 0);

  lines.push("# Electric Capital Migration Commands - FINAL CONSOLIDATED");
  lines.push(`# Generated: ${new Date().toISOString()}`);
  lines.push(`# Total unique repositories: ${totalCount}`);
  lines.push("");

  // Sort ecosystems for consistent output
  const ecosystems = Array.from(grouped.keys()).sort();

  for (const ecosystem of ecosystems) {
    const entries = grouped.get(ecosystem)!;
    const sortedEntries = entries.sort((a, b) => a.url.localeCompare(b.url));

    lines.push(`# ${ecosystem} (${entries.length} repositories)`);

    // Add some context based on ecosystem
    if (ecosystem === "Aztec Protocol") {
      lines.push("# Includes: Noir contracts, JavaScript/TypeScript projects using Aztec packages");
    } else if (ecosystem === "Noir Lang") {
      lines.push("# Includes: Pure Noir projects and JavaScript/TypeScript projects using Noir packages");
    }

    for (const entry of sortedEntries) {
      // Reconstruct the repadd command with deduplicated tags
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
    logger.info("Starting migration file consolidation...");

    const outputDir = './output';
    if (!fs.existsSync(outputDir)) {
      logger.error("Output directory does not exist");
      process.exit(1);
    }

    // Find all migration files
    const migrationFiles = findMigrationFiles(outputDir);
    logger.info(`Found ${migrationFiles.length} migration files to consolidate`);

    if (migrationFiles.length === 0) {
      logger.warn("No migration files found in output directory");
      process.exit(0);
    }

    // Parse all files
    const allEntries: MigrationEntry[] = [];
    for (const file of migrationFiles) {
      const entries = parseMigrationFile(file);
      allEntries.push(...entries);
    }

    logger.info(`Total entries before deduplication: ${allEntries.length}`);

    // Consolidate and deduplicate
    const consolidated = consolidateEntries(allEntries);
    logger.info(`Unique repositories after deduplication: ${consolidated.size}`);

    // Calculate duplicate count
    const duplicateCount = allEntries.length - consolidated.size;
    if (duplicateCount > 0) {
      logger.info(`Removed ${duplicateCount} duplicate entries`);
    }

    // Group by ecosystem
    const grouped = groupByEcosystem(consolidated);

    // Generate final migration file
    const finalContent = generateFinalMigration(grouped);

    // Save to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const finalPath = path.join(outputDir, `final-migration-consolidated-${timestamp}.txt`);
    fs.writeFileSync(finalPath, finalContent);

    logger.info(`Final migration file saved to: ${finalPath}`);

    // Print summary
    console.log("\n=== Consolidation Summary ===");
    console.log(`Files processed: ${migrationFiles.length}`);
    console.log(`Total entries: ${allEntries.length}`);
    console.log(`Duplicates removed: ${duplicateCount}`);
    console.log(`Unique repositories: ${consolidated.size}`);
    console.log("\nBreakdown by ecosystem:");

    for (const [ecosystem, entries] of grouped) {
      console.log(`  ${ecosystem}: ${entries.length} repositories`);
    }

    console.log(`\nFinal file: ${finalPath}`);

    // Also create a simple stats file
    const stats = {
      consolidationDate: new Date().toISOString(),
      filesProcessed: migrationFiles.map(f => path.basename(f)),
      totalEntriesBeforeDedupe: allEntries.length,
      duplicatesRemoved: duplicateCount,
      uniqueRepositories: consolidated.size,
      byEcosystem: Object.fromEntries(
        Array.from(grouped.entries()).map(([eco, entries]) => [eco, entries.length])
      )
    };

    const statsPath = path.join(outputDir, `consolidation-stats-${timestamp}.json`);
    fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
    console.log(`Stats saved to: ${statsPath}`);

  } catch (error) {
    logger.error(`Failed to consolidate migration files: ${error}`);
    console.error("Error:", error);
    process.exit(1);
  }
}

// Run the script
if (import.meta.main) {
  main();
}