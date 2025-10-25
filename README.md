# Crypto Ecosystems Discovery Scripts

A comprehensive toolkit for discovering and tracking cryptocurrency ecosystem repositories, with specialized support for **Aztec Protocol** and **Noir Lang** projects.

## 🎯 Purpose

This repository helps identify and track GitHub repositories in the cryptocurrency ecosystem, particularly focusing on:
- **Noir Language** projects (using `Nargo.toml` files)
- **Aztec Protocol** projects (contracts and applications)
- **JavaScript/TypeScript** projects using Aztec or Noir npm packages
- General cryptocurrency and blockchain projects

The primary goal is to generate migration commands for Electric Capital's crypto ecosystem tracking system.

## 🚀 Quick Start

```bash
# Install dependencies
bun install

# Set up environment
cp .env.example .env
# Edit .env and add your GitHub token

# Run Aztec/Noir discovery
bun run find:aztec

# Consolidate results
bun run scripts/consolidate-migrations.ts

# Filter out already tracked repos
bun run scripts/merge-with-existing.ts output/final-migration-consolidated-*.txt
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

For detailed documentation on specific components:
- **[Scripts Guide](./docs/scripts-guide.md)** - In-depth guide for the Noir/Aztec discovery script
- **[Consolidation Guide](./docs/consolidation-guide.md)** - Detailed documentation for migration consolidation tools
- **[Documentation Index](./docs/README.md)** - Complete documentation overview

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

From our latest discovery run:
- **992** unique repositories found
- **569** NEW repositories (not tracked)
  - **186** Aztec Protocol projects
  - **383** Noir Lang projects

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