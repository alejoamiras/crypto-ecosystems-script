# Migration File Consolidation Scripts

## Overview

These scripts help manage and consolidate multiple Electric Capital migration files, removing duplicates and filtering out already tracked repositories.

## Scripts

### 1. `consolidate-migrations.ts`

Consolidates multiple migration files from the output directory, removing duplicates and creating a single merged file with accurate counts.

**Usage:**
```bash
bun run scripts/consolidate-migrations.ts
```

**Features:**
- Automatically finds all `electric-capital-migration-*.txt` files in the `output/` directory
- Removes duplicate repositories (by URL)
- Merges tags from duplicate entries
- Generates a consolidated file with updated counts
- Creates a JSON stats file with consolidation details

**Output:**
- `output/final-migration-consolidated-{timestamp}.txt` - Consolidated migration file
- `output/consolidation-stats-{timestamp}.json` - Statistics about the consolidation

### 2. `merge-with-existing.ts`

Takes a migration file and filters out repositories that are already tracked in the Electric Capital database.

**Usage:**
```bash
# Filter out already tracked repos
bun run scripts/merge-with-existing.ts <migration-file>

# Skip checking against existing (just process the file)
bun run scripts/merge-with-existing.ts <migration-file> --skip-existing
```

**Features:**
- Loads existing tracked repos from `static/Aztec-Protocol-export.jsonl`
- Filters out repositories that are already tracked
- Reports how many duplicates were removed
- Generates a final migration file with only NEW repositories

**Output:**
- `output/final-migration-merged-{timestamp}.txt` - Final migration file with only new repos

## Typical Workflow

1. Run multiple discovery scripts over time, generating various migration files
2. Consolidate all migration files to remove duplicates:
   ```bash
   bun run scripts/consolidate-migrations.ts
   ```
3. Filter out already tracked repositories:
   ```bash
   bun run scripts/merge-with-existing.ts output/final-migration-consolidated-*.txt
   ```
4. Use the final merged file for Electric Capital migration

## Example Results

From our recent run:
- **Initial**: 1547 total entries across 3 files
- **After deduplication**: 992 unique repositories
- **After filtering existing**: 569 truly new repositories
  - Aztec Protocol: 186 new repos
  - Noir Lang: 383 new repos

## File Formats

### Migration File Format
```
repadd "Ecosystem Name" https://github.com/owner/repo #tag1 #tag2
```

### Stats File Format
```json
{
  "consolidationDate": "2025-10-25T15:46:36.723Z",
  "filesProcessed": ["file1.txt", "file2.txt"],
  "totalEntriesBeforeDedupe": 1547,
  "duplicatesRemoved": 555,
  "uniqueRepositories": 992,
  "byEcosystem": {
    "Aztec Protocol": 349,
    "Noir Lang": 643
  }
}
```