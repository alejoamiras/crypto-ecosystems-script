# Crypto Ecosystems Discovery Scripts

A comprehensive toolkit for discovering, tracking, and analyzing cryptocurrency ecosystem repositories, with specialized support for **Aztec Protocol** and **Noir Lang** projects.

## 📋 Quick Reference

| Task | Command | Documentation |
|------|---------|--------------|
| **Discover Repos** | `bun run find:aztec` | [Scripts Guide](./docs/scripts-guide.md) |
| **Create Database** | `bun run db:create` | [Repository Database](./REPOSITORY_DATABASE.md) |
| **View Statistics** | `bun run db:stats` | [Repository Database](./REPOSITORY_DATABASE.md) |
| **Compare Ecosystems** | `bun run report` | [Ecosystem Comparison](./ECOSYSTEM_COMPARISON.md) |
| **Community Analysis** | `bun run report:community` | [Ecosystem Comparison](./ECOSYSTEM_COMPARISON.md) |
| **Query Activity** | `bun run query:aztec` | [Repository Database](./REPOSITORY_DATABASE.md) |
| **Consolidate** | `bun run consolidate` | [Consolidation Guide](./docs/consolidation-guide.md) |

## 🎯 Purpose

This repository provides powerful tools to:
- **Discover** GitHub repositories in cryptocurrency ecosystems
- **Track** development activity and developer metrics
- **Analyze** ecosystem health and community engagement
- **Compare** ecosystems with detailed reports

Key capabilities:
- **Noir Language** projects discovery (using `Nargo.toml` files)
- **Aztec Protocol** projects identification (contracts and applications)
- **Developer activity analysis** with time-based queries
- **Ecosystem comparison** with organization filtering
- **Community vs Core development** insights

The primary goal is to generate migration commands for Electric Capital's crypto ecosystem tracking system and provide deep insights into ecosystem development.

## 🚀 Quick Start

### Repository Discovery
```bash
# Install dependencies
bun install

# Set up environment
cp .env.example .env
# Edit .env and add your GitHub token

# Run Aztec/Noir discovery
bun run find:aztec

# Consolidate results
bun run consolidate

# Filter out already tracked repos
bun run merge output/final-migration-consolidated-*.txt
```

### Ecosystem Analysis
```bash
# Create repository database
bun run db:create

# View ecosystem statistics
bun run db:stats

# Compare ecosystems (last 31 days)
bun run report

# Community-only analysis (excludes core orgs)
bun run report:community

# Query specific ecosystem activity
bun run query:aztec  # Last 10 days of Aztec activity
bun run query:noir   # Last 10 days of Noir activity
```

## 📁 Project Structure

```
crypto-ecosystems-scripts/
├── docs/                        # Detailed documentation
│   ├── README.md               # Documentation index
│   ├── scripts-guide.md        # Discovery script guide
│   └── consolidation-guide.md  # Migration tools guide
├── src/                        # Core library code
│   ├── lib/
│   │   ├── github/            # GitHub API client with rate limiting
│   │   ├── aztec-classifier.ts # Noir/Aztec repository classifier
│   │   ├── config.ts          # Centralized configuration
│   │   ├── errors/            # Custom error types
│   │   └── logger/            # Logging utilities
│   ├── search.ts              # General search module
│   └── cli.ts                 # CLI interface
├── scripts/                   # Specialized discovery scripts
│   ├── find-noir-aztec-repos.ts  # Main Aztec/Noir discovery
│   ├── consolidate-migrations.ts # Deduplication tool
│   └── merge-with-existing.ts    # Filter tracked repos
├── static/                    # Static data files
│   └── Aztec-Protocol-export.jsonl # Electric Capital tracked repos
├── output/                    # Generated results (gitignored)
└── logs/                     # Log files (gitignored)
```

## 🔧 Configuration

### Environment Variables (.env)

```bash
# ====================
# GitHub Authentication
# ====================
GITHUB_TOKEN=ghp_your_token_here

# Enable token rotation for higher rate limits
USE_TOKEN_ROTATION=false
GITHUB_TOKEN_1=ghp_second_token  # Optional
GITHUB_TOKEN_2=ghp_third_token   # Optional

# ====================
# Timeout Configuration
# ====================
HTTP_REQUEST_TIMEOUT=30000      # Individual API calls (30s)
SEARCH_TIMEOUT=60000            # Search operations (60s)

# ====================
# Retry Configuration
# ====================
MAX_RETRIES=5                   # Max retry attempts
RATE_LIMIT_BASE_DELAY=10000    # Base delay for rate limits (10s)
MAX_RETRY_DELAY=90000          # Max delay between retries (90s)

# ====================
# Rate Limiting
# ====================
REPO_PROCESSING_DELAY=100      # Delay between repos (100ms)
SEARCH_QUERY_DELAY=2000        # Delay between searches (2s)

# ====================
# Logging
# ====================
LOG_LEVEL=info                 # debug, info, warn, error
LOG_TO_FILE=false              # Write logs to file
```

## 📖 Documentation

### Core Documentation
- **[Repository Database & Analytics](./REPOSITORY_DATABASE.md)** - Complete guide to the repository database and querying ecosystem activity
- **[Ecosystem Comparison Tool](./ECOSYSTEM_COMPARISON.md)** - Powerful ecosystem comparison with organization filtering
- **[Scripts Guide](./docs/scripts-guide.md)** - In-depth guide for the Noir/Aztec discovery script
- **[Consolidation Guide](./docs/consolidation-guide.md)** - Detailed documentation for migration consolidation tools
- **[Documentation Index](./docs/README.md)** - Complete documentation overview

### Quick Links
- 🔍 [How to discover repositories](#1-aztecnoir-discovery-script)
- 📊 [How to analyze ecosystems](#5-ecosystem-analytics-new)
- 🆚 [How to compare ecosystems](#6-ecosystem-comparison-new)
- 📈 [View recent results](#-recent-results)

## 📚 Main Components

### 1. Aztec/Noir Discovery Script

**Script**: `scripts/find-noir-aztec-repos.ts`

Discovers repositories using Noir language or Aztec packages through multiple strategies:

#### Search Strategies:
- **Noir Projects**: Searches for `Nargo.toml` files
- **NPM Projects**: Searches for `@aztec/*` and `@noir-lang/*` packages
- **Code Patterns**: Searches for Aztec-specific code patterns

#### Classification Rules:
- **Aztec Protocol**:
  - Noir projects with `type = "contract"`
  - Projects using `@aztec/*` npm packages
  - Projects importing Aztec.nr dependencies

- **Noir Lang**:
  - Pure Noir projects (`type = "bin"` or `type = "lib"`)
  - Projects using only `@noir-lang/*` packages (no Aztec)

#### Usage:
```bash
# Run discovery with token rotation
USE_TOKEN_ROTATION=true bun run find:aztec

# Run with file logging
LOG_TO_FILE=true bun run scripts/find-noir-aztec-repos.ts
```

### 2. Migration Consolidation Tools

#### Consolidate Duplicates
**Script**: `scripts/consolidate-migrations.ts`

Merges multiple migration files and removes duplicates:

```bash
bun run scripts/consolidate-migrations.ts
```

**Output**:
- `output/final-migration-consolidated-{timestamp}.txt`
- `output/consolidation-stats-{timestamp}.json`

#### Filter Tracked Repos
**Script**: `scripts/merge-with-existing.ts`

Filters out repositories already tracked by Electric Capital:

```bash
bun run scripts/merge-with-existing.ts output/final-migration-consolidated-*.txt
```

**Output**:
- `output/final-migration-merged-{timestamp}.txt` (only NEW repos)

### 3. General Search Module

**Module**: `src/search.ts`

Provides flexible repository search capabilities:

```typescript
import { searchWithPreset, searchByTopics, searchByOrg } from "./src/search";

// Search by preset
const results = await searchWithPreset("defi");

// Search by topics
const topicResults = await searchByTopics(["blockchain", "ethereum"]);

// Search by organization
const orgResults = await searchByOrg("ethereum");
```

### 4. CLI Interface

**Module**: `src/cli.ts`

Interactive command-line tool:

```bash
# Show help
bun run cli:help

# Use preset search
bun run cli --preset crypto --max 50 --save

# Custom search
bun run cli --query "solidity audit" --save
```

### 5. Ecosystem Analytics (NEW!)

**Script**: `scripts/query-ecosystem-activity.ts`

Query and analyze developer activity in specific ecosystems:

```bash
# Analyze Aztec ecosystem (last 10 days)
bun run query:aztec

# Custom analysis with CSV export
bun run query:activity --ecosystem "Noir Lang" --days 30 --csv

# Save detailed metrics
bun run query:activity --ecosystem "Aztec Protocol" --days 14 --output metrics.json
```

**Features:**
- Track unique developers and commit activity
- Identify top contributors and active repositories
- Export results as JSON or CSV
- Daily activity patterns

### 6. Ecosystem Comparison (NEW!)

**Script**: `scripts/ecosystem-comparison-report.ts`

Generate beautiful comparative reports between Aztec and Noir ecosystems:

```bash
# Standard comparison (all repos)
bun run report

# Community-only view (excludes AztecProtocol & noir-lang)
bun run report:community

# Weekly community activity
bun run report:community-week

# Custom with JSON export
bun run report:community --json
```

**Key Features:**
- **Organization Filtering**: Exclude core orgs to see true community activity
- **Comparative Metrics**: Side-by-side ecosystem comparison
- **Developer Distribution**: Understand contribution patterns
- **Export Options**: Console, text file, or JSON

### 7. Repository Database (NEW!)

**Scripts**: `scripts/create-repository-database.ts`, `scripts/quick-ecosystem-stats.ts`

Consolidated database of all discovered repositories:

```bash
# Create/update database
bun run db:create

# View statistics (no API calls)
bun run db:stats
```

**Database Contains:**
- **1,536 total repositories**
- **881 Aztec Protocol** repos
- **655 Noir Lang** repos
- Metadata including tags, source, and ecosystem classification

## 📊 Output Formats

### Migration File Format
```
repadd "Aztec Protocol" https://github.com/owner/repo #zkp #aztec #noir
repadd "Noir Lang" https://github.com/owner/repo #zkp #noir
```

### Statistics File Format
```json
{
  "consolidationDate": "2025-10-25T15:46:36.723Z",
  "totalEntriesBeforeDedupe": 1547,
  "duplicatesRemoved": 555,
  "uniqueRepositories": 992,
  "byEcosystem": {
    "Aztec Protocol": 349,
    "Noir Lang": 643
  }
}
```

## 🔄 Typical Workflow

1. **Discovery Phase** - Run multiple times to gather data:
   ```bash
   LOG_TO_FILE=true bun run find:aztec
   ```

2. **Consolidation Phase** - Remove duplicates:
   ```bash
   bun run scripts/consolidate-migrations.ts
   ```

3. **Filtering Phase** - Remove already tracked:
   ```bash
   bun run scripts/merge-with-existing.ts output/final-migration-consolidated-*.txt
   ```

4. **Submission** - Use the final file:
   - File: `output/final-migration-merged-{timestamp}.txt`
   - Contains only NEW repositories to add

## 🚦 Rate Limiting & Performance

The scripts include sophisticated rate limit handling:
- **Automatic retry** with exponential backoff
- **Token rotation** support for higher limits
- **Smart delays** based on GitHub's rate limit headers
- **Configurable timeouts** via environment variables

### Tips:
- Use multiple GitHub tokens for rotation
- Run during off-peak hours
- Configure delays in `.env` based on your needs
- Enable file logging for debugging

## 📈 Recent Results

### Repository Discovery
From our latest discovery run:
- **1,536** total repositories in database
- **569** NEW repositories (not tracked by Electric Capital)
  - **186** new Aztec Protocol projects
  - **383** new Noir Lang projects

### Ecosystem Activity (Last 31 Days)
**Aztec Protocol:**
- **105 unique developers**
- **1,404 total commits**
- **54 active repositories** (6.1% activity rate)

**Noir Lang:**
- **138 unique developers**
- **1,760 total commits**
- **71 active repositories** (10.8% activity rate)

### Community Activity (Excluding Core Orgs)
When excluding AztecProtocol and noir-lang organizations:
- **Aztec Community**: 18 developers, 52 commits (last 7 days)
- **Noir Community**: 40 developers, 375 commits (last 7 days)
- Noir community shows **122% more developer activity**

## 🛠️ Development

### Running Tests
```bash
bun test
```

### Adding New Search Queries
Edit `scripts/find-noir-aztec-repos.ts` and add to the `searchQueries` array:
```typescript
// Add new search patterns
'filename:package.json "your-package"',
'"your-import-pattern" language:typescript',
```

### Customizing Classification
Edit `src/lib/aztec-classifier.ts` to modify classification rules.

## 📝 License

MIT

## 🤝 Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Submit a pull request

## 🔗 Related Projects

- [Electric Capital Crypto Ecosystems](https://github.com/electric-capital/crypto-ecosystems)
- [Aztec Protocol](https://github.com/AztecProtocol)
- [Noir Lang](https://github.com/noir-lang)

## 📞 Support

For issues or questions:
- Open an issue on GitHub
- Check the logs in `logs/` directory
- Review rate limit status in GitHub settings