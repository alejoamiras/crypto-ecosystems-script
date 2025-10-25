# GitHub Search Tool - Modular Design

A flexible GitHub repository search tool with both **scripting** and **CLI** interfaces.

## Architecture

```
crypto-ecosystems-scripts/
├── search.ts              # Main module for scripting (programmatic use)
├── cli.ts                 # CLI interface (interactive use)
├── examples/
│   └── crypto-search.ts   # Example script showing usage patterns
└── src/
    ├── lib/
    │   ├── github/        # GitHub API client
    │   ├── errors/        # Custom error types
    │   └── logger/        # Logging configuration
    └── types/             # TypeScript interfaces
```

## Two Ways to Use

### 1. Scripting Interface (`search.ts`)

Perfect for automation, data pipelines, and custom scripts.

```typescript
import {
  searchWithPreset,
  searchRepositories,
  searchByTopics,
  searchByOrg,
  searchRecent,
  createSearchClient,
  exportToCSV
} from "./search";

// Quick search with preset
const results = await searchWithPreset("crypto", {
  maxResults: 50,
  save: true
});

// Custom search
const customResults = await searchRepositories(
  "ethereum smart contracts",
  { maxResults: 100 }
);

// Search by topics
const topicResults = await searchByTopics(
  ["blockchain", "defi"],
  { language: "typescript" }
);

// Find recent projects (last 7 days)
const recentProjects = await searchRecent("web3", 7);

// Export to CSV
await exportToCSV(results, "output.csv");
```

### 2. CLI Interface (`cli.ts`)

Interactive command-line tool with presets and options.

```bash
# Show help
bun run cli --help

# Use preset
bun run cli --preset crypto --max 50 --save

# Custom search
bun run cli --query "solidity audit tools" --save

# With exclusions
bun run cli --preset defi \
  --exclude-org binance \
  --exclude-topic tutorial
```

## Available Functions (Scripting)

### Core Search Functions

#### `searchWithPreset(preset, options?)`
Search using predefined configurations.

```typescript
const results = await searchWithPreset("web3_tools", {
  maxResults: 30,
  save: true
});
```

#### `searchRepositories(query, options?)`
Custom search with full control.

```typescript
const results = await searchRepositories(
  "blockchain rust stars:>100",
  {
    maxResults: 50,
    sort: "stars",
    order: "desc",
    excludeOrgs: ["facebook"],
    save: true,
    savePrefix: "rust-blockchain"
  }
);
```

#### `searchByTopics(topics, options?)`
Find repositories with specific topics.

```typescript
const results = await searchByTopics(
  ["ethereum", "smart-contracts"],
  {
    language: "javascript",
    maxResults: 20
  }
);
```

#### `searchByOrg(org, options?)`
Get repositories from a specific organization.

```typescript
const results = await searchByOrg("ethereum", {
  minStars: 100,
  language: "go"
});
```

#### `searchRecent(query, daysAgo?, options?)`
Find recently updated repositories.

```typescript
const results = await searchRecent("defi", 30, {
  maxResults: 50,
  sort: "updated"
});
```

### Utility Functions

#### `createSearchClient(options?)`
Create a configured GitHub client.

```typescript
const client = createSearchClient({
  excludeRepos: ["repo1", "repo2"],
  excludeOrgs: ["org1"],
  excludeTopics: ["deprecated"],
  timeoutMs: 45000
});
```

#### `displayResults(results, limit?)`
Pretty-print results to console.

```typescript
displayResults(results, 10); // Show top 10
```

#### `saveResults(results, prefix?)`
Save results to timestamped JSON file.

```typescript
const filename = await saveResults(results, "ethereum");
// Creates: ethereum-results-2024-10-24T13-30-00.json
```

#### `exportToCSV(results, filename?)`
Export results to CSV format.

```typescript
await exportToCSV(results, "analysis.csv");
```

## Presets

| Preset | Description | Key Terms |
|--------|-------------|-----------|
| `crypto` | General crypto/blockchain projects | crypto, blockchain, web3 |
| `defi` | DeFi protocols and tools | defi, decentralized finance |
| `nft` | NFT-related projects | nft, non-fungible token |
| `smart_contracts` | Smart contract development | smart contract, solidity |
| `web3_tools` | Web3 development tools | web3 tool, library |

## Examples

### Run the Example Script

```bash
bun run example:crypto
```

This runs `examples/crypto-search.ts` which demonstrates:
- Using presets
- Custom searches
- Topic searches
- Organization searches
- Recent activity searches
- Combining results
- Exporting to CSV

### Custom Script Example

Create your own script:

```typescript
// my-analysis.ts
import {
  searchByOrg,
  searchByTopics,
  exportToCSV
} from "./search";

async function analyzeEcosystem() {
  // Get top Ethereum projects
  const ethProjects = await searchByOrg("ethereum", {
    minStars: 50
  });

  // Find Solidity tools
  const solidityTools = await searchByTopics(
    ["solidity", "development-tools"],
    { maxResults: 30 }
  );

  // Combine and export
  const allProjects = [...ethProjects, ...solidityTools];
  await exportToCSV(allProjects, "ethereum-ecosystem.csv");

  console.log(`Found ${allProjects.length} projects`);
}

analyzeEcosystem();
```

### CLI Examples

```bash
# Quick crypto search
bun run cli --preset crypto

# Search for Rust blockchain projects
bun run cli -q "blockchain language:rust" -m 30 -s

# DeFi projects excluding certain orgs
bun run cli --preset defi \
  --exclude-org binance \
  --exclude-org coinbase \
  --max 50 \
  --save

# NFT projects from the last month
bun run cli -q "nft created:>2024-09-24" -s
```

## Configuration

### Environment Variables

```bash
# .env file
GITHUB_TOKEN=your_github_token
LOG_LEVEL=info  # debug, info, warn, error
NODE_ENV=production  # disables pretty logging
```

### Default Exclusions

The tool automatically excludes:
- Topics: `deprecated`, `archived`, `obsolete`
- Repos: `torvalds/linux`, `microsoft/TypeScript`
- Custom exclusions can be added per search

## Error Handling

All functions handle:
- **Rate limiting**: Automatic retry with backoff
- **Timeouts**: Configurable timeout protection
- **API errors**: Graceful error recovery
- **Network issues**: Retry logic

```typescript
import {
  SearchTimeoutError,
  RateLimitError,
  AbuseLimitError
} from "./src/lib/errors";

try {
  const results = await searchRepositories("test");
} catch (error) {
  if (error instanceof RateLimitError) {
    console.log(`Rate limited. Retry after: ${error.retryAfter}s`);
  } else if (error instanceof SearchTimeoutError) {
    console.log("Search timed out");
  }
}
```

## Package Scripts

```json
{
  "scripts": {
    "search": "bun run search.ts",        // Run example search
    "cli": "bun run cli.ts",              // Run CLI
    "cli:help": "bun run cli.ts --help",  // Show CLI help
    "example:crypto": "bun run examples/crypto-search.ts" // Run example
  }
}
```

## Best Practices

1. **Use the scripting interface** for:
   - Automated data collection
   - Complex analysis workflows
   - Integration with other tools
   - Scheduled jobs

2. **Use the CLI** for:
   - Quick one-off searches
   - Interactive exploration
   - Testing queries
   - Manual data gathering

3. **Rate Limiting**:
   - Always use a GitHub token (3x more requests)
   - Check rate limits before large searches
   - Use `searchWithRetry()` for automatic handling

4. **Performance**:
   - Be specific in queries to reduce API calls
   - Use exclusions to filter unwanted results
   - Cache results when doing repeated analysis

## Advanced Usage

### Custom Client Configuration

```typescript
const client = createSearchClient({
  timeoutMs: 60000,  // 1 minute timeout
  excludeTopics: ["tutorial", "example", "demo"],
  excludeOrgs: ["facebook", "google"]
});

// Use the custom client
const results = await searchRepositories(
  "blockchain",
  { client }
);
```

### Batch Processing

```typescript
const searches = [
  { query: "ethereum", prefix: "eth" },
  { query: "polkadot", prefix: "dot" },
  { query: "cosmos", prefix: "atom" }
];

for (const { query, prefix } of searches) {
  const results = await searchRepositories(query, {
    maxResults: 50,
    save: true,
    savePrefix: prefix
  });

  logger.info(`${prefix}: Found ${results.length} repos`);

  // Rate limit pause
  await new Promise(r => setTimeout(r, 2000));
}
```

## License

MIT