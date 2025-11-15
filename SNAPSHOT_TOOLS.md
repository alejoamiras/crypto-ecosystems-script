# Repository Snapshot Tools

Track GitHub repository metrics over time - perfect for measuring hackathon impact, monitoring project growth, or tracking ecosystem changes.

## Overview

The snapshot tools allow you to:
- **Capture** detailed metrics for any set of GitHub repositories
- **Track** changes over time with historical snapshots
- **Compare** snapshots to see growth/decline in stars, forks, and other metrics
- **Report** on hackathon or event impact with beautiful comparison reports

## Quick Start

### 1. Before the Hackathon

Create a snapshot of your repositories before the event:

```bash
# Create a file with your repository URLs (one per line)
cat > hackathon-repos.txt << EOF
github.com/your-org/project1
github.com/your-org/project2
github.com/partner/collab-project
EOF

# Take the "before" snapshot
bun run snapshot --file hackathon-repos.txt
```

### 2. After the Hackathon

Take another snapshot after the event:

```bash
# Take the "after" snapshot (same repositories)
bun run snapshot --file hackathon-repos.txt
```

### 3. Compare Results

Generate a comparison report:

```bash
# Compare the two most recent snapshots
bun run snapshot:latest

# Or compare specific snapshots
bun run snapshot:compare --before output/snapshots/snapshot-2025-01-01.json --after output/snapshots/snapshot-2025-01-10.json
```

## Features

### Repository Metrics Captured

Each snapshot captures:
- **Basic Metrics**: Stars, Forks, Watchers, Open Issues
- **Repository Info**: Description, Language, Topics, License
- **Activity Data**: Size, Creation/Update dates, Default branch
- **Additional Metrics**: Pull Requests (open/closed), Contributors, Releases
- **Repository State**: Archived, Disabled, Private status

### Three Main Tools

1. **Snapshot Tool** (`snapshot-repositories.ts`) - Captures repository metrics
2. **Viewer Tool** (`view-snapshot.ts`) - Analyze and explore a single snapshot
3. **Comparison Tool** (`compare-snapshots.ts`) - Compare two snapshots for changes

### Smart Infrastructure

The tools leverage the existing project infrastructure:
- **GitHubSearchClient**: Robust API client with retry and throttling
- **Token Rotation**: Support for multiple tokens to avoid rate limits
- **Logging System**: File and console logging with configurable levels
- **Configuration**: Centralized timeout and rate limit settings

## Commands

### Taking Snapshots

```bash
# Basic snapshot from file
bun run snapshot --file repos.txt

# Snapshot specific repositories
bun run snapshot --repos "github.com/org/repo1,github.com/org/repo2"

# With token rotation for large lists
bun run snapshot --file repos.txt --rotate-tokens

# With file logging for debugging
bun run snapshot --file repos.txt --log-to-file

# Custom output directory
bun run snapshot --file repos.txt --output snapshots/event-name
```

### Viewing Snapshots

```bash
# View latest snapshot sorted by stars
bun run snapshot:view

# View specific snapshot
bun run snapshot:view --file output/snapshots/snapshot-2025-01-01.json

# Sort by different metrics
bun run snapshot:view --sort forks --limit 20
bun run snapshot:view --sort contributors
bun run snapshot:view --sort watchers

# Filter repositories
bun run snapshot:view --language TypeScript --min-stars 100
bun run snapshot:view --topic blockchain
bun run snapshot:view --min-forks 50

# Show detailed information
bun run snapshot:view --limit 10 --show-all
bun run snapshot:view --show-description --show-language
```

### Comparing Snapshots

```bash
# Compare two most recent snapshots
bun run snapshot:latest

# Compare specific snapshots
bun run snapshot:compare --before before.json --after after.json

# With detailed repository-by-repository changes
bun run snapshot:compare --latest --detailed

# Save comparison report to JSON
bun run snapshot:compare --latest --save comparison-report.json
```

## Input File Format

Create a text file with repository URLs (one per line):

```
https://github.com/aztecprotocol/aztec-packages
github.com/noir-lang/noir
ethereum/go-ethereum
# Comments are supported
solana-labs/solana

# Various formats work:
https://github.com/user/repo
github.com/user/repo
user/repo
```

## Output Files

### Snapshot Files

Stored in `output/snapshots/` by default:

- **`snapshot-TIMESTAMP.json`** - Individual snapshot with full metrics
- **`snapshot-latest.json`** - Always contains the most recent snapshot
- **`snapshot-history.json`** - Complete history of all snapshots

### Snapshot Structure

```json
{
  "timestamp": "2025-01-10T15:30:00.000Z",
  "date": "2025-01-10",
  "repositories": [
    {
      "url": "https://github.com/owner/repo",
      "fullName": "owner/repo",
      "stars": 1234,
      "forks": 567,
      "watchers": 89,
      "openIssues": 23,
      "language": "TypeScript",
      "topics": ["blockchain", "web3"],
      // ... many more metrics
    }
  ],
  "metadata": {
    "totalRepos": 10,
    "totalStars": 5678,
    "totalForks": 890,
    "totalWatchers": 234,
    "avgStarsPerRepo": 568,
    "avgForksPerRepo": 89,
    "executionTime": 12345,
    "errors": []
  }
}
```

## Snapshot Viewer

The viewer tool allows you to analyze a single snapshot in detail:

### Features
- **Sort by any metric**: stars, forks, watchers, issues, size, contributors
- **Filter repositories**: by language, topics, minimum stars/forks
- **Display options**: descriptions, languages, topics, dates, extra metrics
- **Statistics**: Total counts, averages, language distribution, topic cloud

### Example Output

```
📸 REPOSITORY SNAPSHOT VIEWER
════════════════════════════════════════════════════════════════════════════════
📅 Date: 2025-01-10
🕐 Time: 3:30:00 PM
📦 Total Repositories: 50
────────────────────────────────────────────────────────────────────────────────
📊 STATISTICS:
⭐ Total Stars: 15,234
🍴 Total Forks: 3,456
👁️  Total Watchers: 892
📈 Averages: ⭐ 305/repo | 🍴 69/repo
────────────────────────────────────────────────────────────────────────────────

📊 TOP REPOSITORIES BY STARS:
────────────────────────────────────────────────────────────────────────────────
1.  noir-lang/noir                               ⭐  1,227 | 🍴    347
2.  AztecProtocol/aztec-v1                       ⭐    632 | 🍴    104
3.  noir-lang/awesome-noir                       ⭐    530 | 🍴    125
4.  AztecProtocol/aztec-connect                  ⭐    457 | 🍴    393
5.  AztecProtocol/aztec-packages                 ⭐    385 | 🍴    536

🔧 LANGUAGE DISTRIBUTION:
────────────────────────────────────────────────────────────────────────────────
  TypeScript      ████████████████████ 25 (50.0%)
  Rust            ████████ 10 (20.0%)
  JavaScript      ██████ 8 (16.0%)
  Solidity        ████ 5 (10.0%)
  Python          ██ 2 (4.0%)

🏷️  TOP TOPICS:
────────────────────────────────────────────────────────────────────────────────
  blockchain (15), web3 (12), zero-knowledge (10), cryptography (8), defi (7)
```

### Viewer Commands

```bash
# Basic viewing (sorted by stars)
bun run snapshot:view

# Sort by different metrics
bun run snapshot:view --sort forks
bun run snapshot:view --sort contributors --limit 20

# Filter by criteria
bun run snapshot:view --language TypeScript --min-stars 100
bun run snapshot:view --topic blockchain
bun run snapshot:view --min-forks 50 --sort forks

# Show additional information
bun run snapshot:view --limit 10 --show-all  # Everything
bun run snapshot:view --show-description     # Repo descriptions
bun run snapshot:view --show-language        # Programming languages
bun run snapshot:view --show-topics          # Repository topics
bun run snapshot:view --show-dates           # Created/updated dates
```

## Comparison Reports

The comparison tool generates beautiful reports showing:

### Summary Statistics
- Total stars/forks/watchers changes
- Average metrics per repository
- Time period between snapshots

### Repository Changes
- **Top Gainers**: Repos with most star increases
- **Top Losers**: Repos with star decreases
- **New Repositories**: Added since last snapshot
- **Removed Repositories**: No longer in the list

### Example Output

```
══════════════════════════════════════════════════════════════════════
📊 REPOSITORY SNAPSHOT COMPARISON REPORT
══════════════════════════════════════════════════════════════════════

📅 SNAPSHOT INFORMATION:
──────────────────────────────────────────────────────────────────────
Before: 2025-01-01 (10 repos)
After:  2025-01-10 (12 repos)
Period: 9 days, 0 hours

📈 OVERALL METRICS:
──────────────────────────────────────────────────────────────────────
Total Stars          5,432 →    6,234  (+802, +14.8%)
Total Forks            892 →      943  (+51, +5.7%)
Total Watchers         234 →      267  (+33, +14.1%)
Avg Stars/Repo         543 →      520  (-23)
Avg Forks/Repo          89 →       79  (-10)

🚀 TOP GAINERS (by stars):
──────────────────────────────────────────────────────────────────────
1. aztecprotocol/aztec-packages
   ⭐ 234 → 456 (+222, +94.9%)
   🍴 45 → 67 (+22)

2. noir-lang/noir
   ⭐ 567 → 678 (+111, +19.6%)
   🍴 89 → 95 (+6)
```

## Use Cases

### 1. Hackathon Impact Measurement

Perfect for demonstrating the impact of hackathons:

```bash
# Before hackathon
echo "Taking pre-hackathon snapshot..."
bun run snapshot --file hackathon-projects.txt --output snapshots/ethdenver-2025

# After hackathon
echo "Taking post-hackathon snapshot..."
bun run snapshot --file hackathon-projects.txt --output snapshots/ethdenver-2025

# Generate impact report
bun run snapshot:compare --latest --detailed --save ethdenver-impact.json
```

### 2. Weekly Ecosystem Monitoring

Track ecosystem growth over time:

```bash
# Set up weekly cron job
0 0 * * 0 cd /path/to/project && bun run snapshot --file ecosystem-repos.txt

# Monthly comparison
bun run snapshot:compare --latest --detailed
```

### 3. Partnership Impact Tracking

Measure the impact of partnerships or collaborations:

```bash
# Track partner repositories
cat > partner-repos.txt << EOF
github.com/partner1/shared-project
github.com/partner2/integration
github.com/our-org/collab-tool
EOF

# Regular snapshots
bun run snapshot --file partner-repos.txt --output snapshots/partnerships
```

## Configuration

The tools respect your `.env` configuration:

```bash
# GitHub Authentication
GITHUB_TOKEN=ghp_your_token_here

# Token Rotation (optional)
GITHUB_TOKEN_1=ghp_second_token
GITHUB_TOKEN_2=ghp_third_token

# Rate Limiting
REPO_PROCESSING_DELAY=100  # ms between repos

# Logging
LOG_LEVEL=info  # debug, info, warn, error
```

## Tips

### For Large Repository Lists

1. **Use Token Rotation**: Add multiple GitHub tokens to avoid rate limits
   ```bash
   bun run snapshot --file large-list.txt --rotate-tokens
   ```

2. **Enable File Logging**: Debug issues with detailed logs
   ```bash
   bun run snapshot --file repos.txt --log-to-file
   ```

3. **Batch Processing**: The tool automatically applies delays between API calls

### For Accurate Comparisons

1. **Consistent Repository Lists**: Use the same input file for before/after snapshots
2. **Regular Intervals**: Take snapshots at consistent times (daily, weekly)
3. **Include Context**: Use meaningful output directory names for events

### For Reporting

1. **Save JSON Reports**: Keep detailed records for later analysis
   ```bash
   bun run snapshot:compare --latest --save reports/hackathon-impact.json
   ```

2. **Use Detailed Mode**: Get repository-by-repository breakdowns
   ```bash
   bun run snapshot:compare --latest --detailed
   ```

3. **Track History**: The `snapshot-history.json` maintains all snapshots for long-term analysis

## Troubleshooting

### Rate Limit Issues

```bash
# Use token rotation
bun run snapshot --file repos.txt --rotate-tokens

# Increase delays in .env
REPO_PROCESSING_DELAY=500
```

### Missing Metrics

Some metrics (PRs, contributors) require additional API calls. If missing:
- Check logs for warnings about failed fetches
- Ensure your GitHub token has appropriate permissions

### Large Repository Lists

For lists with 100+ repositories:
- Use token rotation
- Consider breaking into smaller batches
- Run during off-peak hours (GitHub API is less busy)

## Integration with Other Tools

The snapshot data can be:
- **Imported to Excel/Sheets**: Use the JSON or create CSV exports
- **Visualized**: Create charts from the metrics data
- **Automated**: Set up CI/CD pipelines to take regular snapshots
- **Analyzed**: Use the JSON data with data analysis tools

## Examples Repository File

Create a `hackathon-repos.txt`:

```
# Core Projects
github.com/aztecprotocol/aztec-packages
github.com/aztecprotocol/aztec-nr

# Community Projects
github.com/defi-wonderland/aztec-patterns
github.com/mach-34/aztec-state-channels

# Partner Integrations
github.com/ethereum/ethereum-org-website
github.com/safe-global/safe-contracts

# Hackathon Submissions
github.com/team1/hackathon-project
github.com/team2/defi-solution
```

Then track their growth:

```bash
# Initial snapshot
bun run snapshot --file hackathon-repos.txt

# After event
bun run snapshot --file hackathon-repos.txt

# See the impact
bun run snapshot:latest --detailed
```

This gives you concrete metrics to showcase hackathon success!