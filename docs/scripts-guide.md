# Noir and Aztec Repository Discovery Script

## Overview

This script (`find-noir-aztec-repos.ts`) helps identify GitHub repositories that use Noir or Aztec technologies by searching for `Nargo.toml` configuration files. It then classifies them based on their package type to determine if they're Noir Lang or Aztec Protocol projects.

## Purpose

The script was created to:
1. Find repositories using Noir/Aztec that aren't already tracked by Electric Capital
2. Generate migration commands in Electric Capital's format for adding these repositories to their tracking system
3. Help track the ecosystem growth and developer activity around Noir and Aztec technologies

## How It Works

### Classification Logic

The script determines if a repository belongs to Aztec Protocol or Noir Lang based on the `Nargo.toml` file:

- **Aztec Protocol**:
  - Has `type = "contract"` in Nargo.toml (Aztec.nr contracts)
  - OR has Aztec dependencies in the dependencies section

- **Noir Lang**:
  - Has `type = "bin"` (binary/programs)
  - Has `type = "lib"` (libraries)
  - Any other type without Aztec dependencies

### Search Strategy

1. Searches GitHub for repositories containing `Nargo.toml` files using multiple queries:
   - `filename:Nargo.toml`
   - `Nargo.toml noir`
   - `Nargo.toml aztec`
   - Type-specific searches (though GitHub's code search doesn't support these well)

2. For each repository found:
   - Checks if it's already tracked by Electric Capital (from the export file)
   - Attempts to fetch and parse the `Nargo.toml` file
   - Classifies it as either Aztec or Noir based on the rules above
   - Records repository metadata (stars, description, etc.)

3. Generates output in Electric Capital's migration format

## Usage

### Prerequisites

1. Set up your GitHub token in `.env`:
```bash
GITHUB_TOKEN=your_github_personal_access_token
```

2. Ensure the Electric Capital export file exists:
   - File should be at: `static/Aztec-Protocol-export.jsonl`
   - This file contains repositories already tracked by Electric Capital

### Running the Script

```bash
# Using the npm script
bun run find:aztec

# Or directly
bun run scripts/find-noir-aztec-repos.ts
```

### Output Files

The script generates two output files in the `output/` directory:

1. **Migration Commands File** (`electric-capital-migration-{timestamp}.txt`):
   - Ready-to-use commands for Electric Capital's migration tool
   - Format: `repadd "Ecosystem" URL #tags`
   - Separated into Aztec Protocol and Noir Lang sections

2. **Detailed JSON File** (`noir-aztec-repos-{timestamp}.json`):
   - Complete repository information
   - Includes classification, stars, descriptions
   - Useful for further analysis

### Example Output

```bash
# Electric Capital Migration Commands for Noir/Aztec Repositories
# Generated: 2025-10-24T14:37:33.911Z
# Total new repositories found: 117

# Aztec Protocol Repositories (5 found)
repadd "Aztec Protocol" https://github.com/example/aztec-app #zkp #zk-circuit #noir #aztec

# Noir Lang Repositories (112 found)
repadd "Noir Lang" https://github.com/example/noir-lib #zkp #zk-circuit #noir #aztec
```

## Rate Limiting Considerations

- The script includes rate limiting protection with automatic retries
- Adds delays between API calls to avoid hitting GitHub's rate limits
- If rate limited, waits 60 seconds before retrying
- Uses authenticated requests (requires GITHUB_TOKEN) for higher rate limits

## Limitations

1. **GitHub Code Search Limitations**:
   - Can only find public repositories
   - May not find all repositories if they haven't been indexed
   - Search queries for specific content inside files (like `type = "contract"`) don't work well

2. **Classification Accuracy**:
   - Some repositories return "unknown" type if the Nargo.toml file can't be fetched
   - Default classification is Noir Lang if type can't be determined

3. **API Rate Limits**:
   - Limited number of searches per minute
   - Script may take several minutes to complete due to rate limiting

## Future Improvements

Potential enhancements could include:
- Support for incremental updates (only check new repos since last run)
- Better error handling for private/deleted repositories
- Parallel processing with better rate limit management
- Support for checking multiple files to determine project type
- Integration with Electric Capital's API for automatic submission