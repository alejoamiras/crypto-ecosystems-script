# GitHub Token Rotation Guide

## Overview

This project supports GitHub token rotation to avoid rate limiting when performing extensive searches. When enabled, the system automatically rotates between multiple GitHub Personal Access Tokens to maximize API throughput.

## Why Token Rotation?

GitHub API has rate limits:
- **Authenticated requests**: 5,000 requests/hour per token
- **Code search**: 30 searches/minute per token
- **Secondary rate limits**: Abuse detection can trigger additional restrictions

With token rotation:
- Multiple tokens share the load
- Automatic failover when one token hits rate limits
- Increased throughput for large-scale operations
- Better resilience against temporary restrictions

## Setup

### 1. Create GitHub Personal Access Tokens

1. Go to [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens)
2. Click "Generate new token (classic)"
3. Select scopes:
   - `public_repo` (required for public repositories)
   - `repo` (optional, only if accessing private repositories)
4. Generate the token and copy it
5. Repeat to create multiple tokens (recommended: 3-5 tokens)

### 2. Configure Tokens

#### Method 1: Using the Setup Script

```bash
./scripts/setup-tokens.sh
```

The interactive script will:
- Guide you through adding tokens
- Validate token format
- Update your `.env` file
- Set up backwards compatibility

#### Method 2: Manual Configuration

Add tokens to your `.env` file:

```bash
# Primary token (for backwards compatibility)
GITHUB_TOKEN=ghp_your_first_token_here

# Additional tokens for rotation
GITHUB_TOKEN_1=ghp_your_first_token_here
GITHUB_TOKEN_2=ghp_your_second_token_here
GITHUB_TOKEN_3=ghp_your_third_token_here
# ... up to GITHUB_TOKEN_10
```

## Usage

### Enable Token Rotation

Token rotation can be enabled in several ways:

#### 1. Via NPM Scripts

```bash
# Run with token rotation only
bun run find:aztec:rotate

# Run with token rotation and file logging
bun run find:aztec:full
```

#### 2. Via Environment Variable

```bash
USE_TOKEN_ROTATION=true bun run scripts/find-noir-aztec-repos.ts
```

#### 3. Programmatically

```typescript
import { GitHubSearchClient } from "./src/lib/github";

const client = new GitHubSearchClient({
  useTokenRotation: true
});
```

### Testing Token Rotation

Verify your setup with the test script:

```bash
bun run test:rotation
```

This will:
- Check token initialization
- Test token cycling
- Verify LRU (Least Recently Used) selection
- Test integration with search operations
- Display usage statistics

## How It Works

### Token Selection Strategy

1. **Round-Robin**: Tokens are used in sequential order for normal operations
2. **LRU on Rate Limit**: When a rate limit is hit, the system selects the least recently used token
3. **Automatic Retry**: Failed requests automatically retry with a different token
4. **Rate Limit Avoidance**: Tokens marked as rate-limited are avoided for 1 hour

### Integration Points

The token rotation system is integrated into:

1. **GitHubSearchClient**: Handles repository and code searches
2. **aztec-classifier**: Used when fetching Nargo.toml files
3. **All search operations**: Automatically benefits from rotation

### Monitoring

When token rotation is active, you'll see log messages like:

```
[INFO] Token rotation enabled with 4 tokens
[INFO] Rotating to a different token due to rate limit
[WARN] Token marked as rate limited, avoiding for 1 hour
```

## Best Practices

1. **Use 3-5 tokens** for optimal rotation without excessive management
2. **Monitor rate limits** using the test script or logs
3. **Enable file logging** to track token rotation patterns:
   ```bash
   LOG_TO_FILE=true USE_TOKEN_ROTATION=true bun run scripts/find-noir-aztec-repos.ts
   ```
4. **Stagger token creation** to avoid synchronized rate limit resets
5. **Keep tokens secure** - never commit them to version control

## Troubleshooting

### No Tokens Found

```
Error: No GitHub tokens found for rotation
```

**Solution**: Ensure tokens are properly set in `.env` file with correct naming (GITHUB_TOKEN_1, GITHUB_TOKEN_2, etc.)

### All Tokens Rate Limited

```
Warning: All tokens are currently rate limited
```

**Solution**: Wait for rate limit reset (usually 1 hour) or add more tokens

### Token Not Rotating

Check if rotation is enabled:
- Environment variable: `USE_TOKEN_ROTATION=true`
- Or in code: `useTokenRotation: true`

### Validation Issues

Run the test script to diagnose:
```bash
bun run test:rotation
```

## Performance Impact

With 5 tokens, you can achieve:
- **5x search throughput** (150 searches/minute vs 30)
- **5x API requests** (25,000 requests/hour vs 5,000)
- **Better reliability** with automatic failover
- **Reduced wait times** when hitting rate limits

## Security Considerations

1. **Token Permissions**: Use minimal required scopes (usually just `public_repo`)
2. **Token Storage**: Keep tokens in `.env` file, never in code
3. **Token Rotation**: Regularly rotate tokens for security
4. **Access Logs**: Monitor GitHub token usage in your account settings

## API Rate Limit Reference

| Limit Type | Without Token | With Token | With 5 Tokens |
|------------|--------------|------------|---------------|
| Requests/hour | 60 | 5,000 | 25,000 |
| Code searches/minute | 10 | 30 | 150 |
| Concurrent requests | Limited | Higher | Highest |

## Related Documentation

- [GitHub Rate Limiting](https://docs.github.com/en/rest/overview/resources-in-the-rest-api#rate-limiting)
- [Personal Access Tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token)
- [GitHub Search API](https://docs.github.com/en/rest/search)