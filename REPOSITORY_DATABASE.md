# Repository Database & Ecosystem Analytics

This document explains the consolidated repository database and how to query ecosystem activity.

## Overview

We have a unified database of **1,536 repositories** across the Aztec and Noir ecosystems:
- **881 Aztec Protocol repositories** (57.4%)
- **655 Noir Lang repositories** (42.6%)

The database combines:
- **951 repositories** already tracked by Electric Capital
- **585 newly discovered repositories** from our automated searches

## Quick Start

### 1. Create/Update the Repository Database

```bash
# Generate the consolidated database (JSON + CSV)
bun run db:create

# View statistics without API calls
bun run db:stats
```

### 2. Query Ecosystem Activity

**Example: Get unique developers in Aztec's ecosystem (last 10 days)**

```bash
bun run query:aztec
```

This will:
- Fetch commit data from GitHub for all Aztec repositories
- Count unique developers who made commits
- Show top contributors and daily activity
- Display active repository statistics

## Available Commands

### Database Management

| Command | Description |
|---------|------------|
| `bun run db:create` | Creates consolidated repository database from all sources |
| `bun run db:stats` | Shows repository statistics without API calls |

### Ecosystem Queries

| Command | Description |
|---------|------------|
| `bun run query:aztec` | Analyze Aztec Protocol activity (last 10 days) |
| `bun run query:noir` | Analyze Noir Lang activity (last 10 days) |
| `bun run query:activity` | Custom query with options |

### Custom Query Options

```bash
# Aztec developers in the last 30 days
bun run query:activity --ecosystem "Aztec Protocol" --days 30

# Noir Lang with CSV export
bun run query:activity --ecosystem "Noir Lang" --days 7 --csv

# Save detailed metrics to JSON
bun run query:activity --ecosystem "Aztec Protocol" --days 14 --output aztec-metrics.json
```

## Output Files

### Repository Database

- `output/repository-database.json` - Complete repository data with metadata
- `output/repository-database.csv` - Simplified CSV format for analysis

### Query Results

- `output/<ecosystem>-developers.csv` - Developer activity export
- `output/<custom-name>.json` - Detailed metrics when using --output flag

## Data Structure

### Repository Database (JSON)

```json
{
  "generatedAt": "2025-10-27T...",
  "totalRepositories": 1536,
  "byEcosystem": {
    "Aztec Protocol": 881,
    "Noir Lang": 655
  },
  "bySource": {
    "electricCapital": 951,
    "discovered": 585
  },
  "repositories": [
    {
      "url": "https://github.com/owner/repo",
      "ecosystem": "Aztec Protocol",
      "tags": ["aztec", "noir", "zkp"],
      "source": "electric-capital | discovered"
    }
  ]
}
```

### Activity Metrics (from queries)

```json
{
  "ecosystem": "Aztec Protocol",
  "dateRange": {
    "from": "2025-10-17",
    "to": "2025-10-27"
  },
  "uniqueDevelopers": 42,
  "totalCommits": 328,
  "activeRepositories": 35,
  "topContributors": [...],
  "dailyActivity": {...}
}
```

## Example Insights

Here are some questions you can answer with this system:

1. **How many unique developers contributed to Aztec in the last 10 days?**
   ```bash
   bun run query:aztec
   ```

2. **Which repositories are most active in Noir Lang?**
   ```bash
   bun run query:noir --output noir-activity.json
   # Then check the activeRepositories in the JSON
   ```

3. **Who are the top contributors across ecosystems?**
   ```bash
   bun run query:activity --ecosystem "Aztec Protocol" --days 30 --csv
   # Check the CSV for contributor rankings
   ```

4. **How does developer activity vary day by day?**
   ```bash
   bun run query:activity --ecosystem "Noir Lang" --days 7 --output daily.json
   # The dailyActivity field shows commits and unique developers per day
   ```

## Top Organizations/Users

Based on repository count:
- **zkemail**: 83 repos
- **AztecProtocol**: 81 repos
- **noir-lang**: 74 repos
- **cypriansakwa**: 40 repos
- **critesjosh**: 26 repos

## Technology Distribution

Most common tags across all repositories:
- **#aztec**: 95.1% of repos
- **#zkp**: 65.6% of repos
- **#noir**: 60.4% of repos
- **#zk-circuit**: 52.3% of repos
- **#javascript/#typescript**: 40.9% of repos

## Requirements

- GitHub token in `.env` file (for activity queries)
- Bun runtime installed
- Network access to GitHub API

## Rate Limits

The query scripts include:
- Automatic retry on rate limits
- Throttling to respect GitHub's limits
- Token rotation support (if multiple tokens configured)
- Batch processing to minimize API calls

## Workflow Summary

1. **Discovery**: Find new repositories with `bun run find:aztec`
2. **Consolidation**: Merge discoveries with `bun run consolidate`
3. **Database Creation**: Build unified database with `bun run db:create`
4. **Analysis**: Query activity with `bun run query:activity`

This provides a complete pipeline from repository discovery to ecosystem analytics.