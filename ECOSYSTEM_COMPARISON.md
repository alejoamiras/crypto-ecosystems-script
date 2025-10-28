# Ecosystem Comparison Report

A powerful tool for analyzing and comparing developer activity between Aztec Protocol and Noir Lang ecosystems, with the ability to filter out core organization repositories for a true community activity view.

## Features

- **Comparative Analysis**: Side-by-side comparison of both ecosystems
- **Organization Filtering**: Exclude core organizations (AztecProtocol, noir-lang) to focus on community activity
- **Beautiful Reports**: Well-formatted output with tables and insights
- **Flexible Time Ranges**: Analyze activity for any number of days
- **Multiple Output Formats**: Console display, text file, and JSON export

## Quick Start

### All Activity (Including Core Organizations)

```bash
# Standard 31-day comparison
bun run report

# Last week's activity
bun run report:week

# Last month's activity
bun run report:month
```

### Community Activity Only (Excluding Core Organizations)

```bash
# Community activity for 31 days
bun run report:community

# Community activity for last week
bun run report:community-week

# Custom exclusion (specify organizations)
bun run scripts/ecosystem-comparison-report.ts --exclude-orgs AztecProtocol,noir-lang,other-org
```

## Command Options

| Option | Description | Default |
|--------|-------------|---------|
| `--days <number>` | Number of days to look back | 31 |
| `--exclude-orgs <orgs>` | Comma-separated list of orgs to exclude, or "core" | none |
| `--output <file>` | Save report to file | console only |
| `--json` | Also save raw metrics as JSON | false |

## Examples

### 1. Standard Ecosystem Comparison

```bash
# Compare both ecosystems for the last month
bun run report
```

Output includes:
- Total unique developers
- Commit counts
- Active repository percentages
- Top contributors (excluding bots)
- Daily activity trends
- Key insights

### 2. Community-Focused Analysis

```bash
# See what the community is building (excludes AztecProtocol & noir-lang repos)
bun run report:community
```

This is particularly useful to understand:
- Independent developer activity
- Third-party project development
- True community engagement metrics

### 3. Custom Time Ranges with Export

```bash
# Last 14 days, save to file with JSON export
bun run scripts/ecosystem-comparison-report.ts --days 14 --output biweekly.txt --json
```

Creates:
- `output/biweekly.txt` - Formatted report
- `output/ecosystem-comparison-TIMESTAMP.json` - Raw metrics data

### 4. Weekly Community Activity

```bash
# Quick weekly community snapshot
bun run report:community-week
```

Perfect for:
- Weekly status updates
- Tracking community growth
- Identifying active community projects

## Report Structure

The generated report includes:

### Summary Statistics
- Unique developers comparison
- Total commits comparison
- Active vs total repositories
- Activity rate percentages
- Difference metrics between ecosystems

### Top Contributors
- Top 10 non-bot contributors for each ecosystem
- Commit counts and repository spread
- Focused on actual human developers

### Daily Activity
- Last 7 days of activity
- Commits and unique developers per day
- Side-by-side ecosystem comparison

### Key Insights
- Developer distribution analysis
- Commit velocity (commits per developer)
- Repository activity rates
- Development concentration metrics
- Community vs core contribution ratios

## Example Output

```
══════════════════════════════════════════════════════════════════════
🔬 ECOSYSTEM COMPARISON REPORT
══════════════════════════════════════════════════════════════════════
📅 Period: 2025-10-20 to 2025-10-27 (7 days)
🚫 Excluded Organizations: AztecProtocol, noir-lang

📊 SUMMARY STATISTICS
──────────────────────────────────────────────────────────────────────
Metric               │ Aztec Protocol       │ Noir Lang            │ Difference
──────────────────── │ ──────────────────── │ ──────────────────── │ ────────────
Unique Developers    │ 18                   │ 40                   │ +22
Total Commits        │ 52                   │ 375                  │ +323
Active Repositories  │ 12/881               │ 20/655               │ +8
Activity Rate        │ 1.4%                 │ 3.1%                 │ +1.7%

🟧 AZTEC PROTOCOL - TOP CONTRIBUTORS
──────────────────────────────────────────────────────────────────────
1.  jotaro-yano          │ 9 commits       │ 1 repo
2.  HristoStaykov        │ 6 commits       │ 1 repo
...

💡 KEY INSIGHTS
──────────────────────────────────────────────────────────────────────
• Noir Lang has 22 more developers (122% more activity)
• Average commits per developer: Aztec (2.9) vs Noir (9.4)
• Repository activity rates: Aztec (1.4%) vs Noir (3.1%)
• Analysis excludes core organization repositories for community focus
```

## JSON Output Structure

When using `--json`, the output includes:

```json
{
  "generatedAt": "2025-10-27T...",
  "days": 7,
  "excludedOrganizations": ["AztecProtocol", "noir-lang"],
  "aztec": {
    "ecosystem": "Aztec Protocol",
    "uniqueDevelopers": 18,
    "totalCommits": 52,
    "activeRepositories": 12,
    "totalRepositories": 881,
    "topContributors": [...],
    "dailyActivity": {...}
  },
  "noir": {
    "ecosystem": "Noir Lang",
    "uniqueDevelopers": 40,
    "totalCommits": 375,
    "activeRepositories": 20,
    "totalRepositories": 655,
    "topContributors": [...],
    "dailyActivity": {...}
  }
}
```

## Use Cases

### For Project Managers
- Track ecosystem growth and health
- Identify active community projects
- Monitor development velocity

### For Community Leaders
- Understand true community engagement
- Identify top community contributors
- Track independent project development

### For Developers
- Find active projects to contribute to
- Understand ecosystem activity patterns
- Identify collaboration opportunities

### For Analysts
- Generate regular ecosystem reports
- Compare core vs community development
- Track ecosystem evolution over time

## Performance Notes

- The script processes repositories in batches to respect GitHub API rate limits
- Expect ~3-5 minutes for a full 31-day analysis of both ecosystems
- Shorter time periods (7 days) typically complete in 1-2 minutes
- Community-only views are faster due to fewer repositories

## Requirements

- GitHub token in `.env` file
- Bun runtime
- Repository database created (`bun run db:create`)

## Troubleshooting

If you encounter rate limits:
1. Ensure your GitHub token is properly configured
2. Consider using shorter time periods
3. Use token rotation if available

If repositories are missing:
1. Update the database: `bun run db:create`
2. Run discovery: `bun run find:aztec`
3. Consolidate: `bun run consolidate`