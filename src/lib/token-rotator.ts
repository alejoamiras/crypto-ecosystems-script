import { logger } from "./logger";

export class TokenRotator {
  private tokens: string[];
  private currentIndex: number = 0;
  private tokenUsage: Map<string, { count: number; lastUsed: Date }> = new Map();

  constructor() {
    // Load tokens from environment variables
    // GITHUB_TOKEN_1, GITHUB_TOKEN_2, etc.
    this.tokens = [];

    // Primary token
    if (process.env.GITHUB_TOKEN) {
      this.tokens.push(process.env.GITHUB_TOKEN);
    }

    // Additional tokens
    for (let i = 1; i <= 10; i++) {
      const token = process.env[`GITHUB_TOKEN_${i}`];
      if (token) {
        this.tokens.push(token);
      }
    }

    if (this.tokens.length === 0) {
      throw new Error("No GitHub tokens found in environment variables");
    }

    logger.info(`Initialized token rotator with ${this.tokens.length} tokens`);

    // Initialize usage tracking
    this.tokens.forEach(token => {
      this.tokenUsage.set(token, { count: 0, lastUsed: new Date(0) });
    });
  }

  /**
   * Get the next token in rotation
   */
  getNextToken(): string {
    if (this.tokens.length === 1) {
      return this.tokens[0];
    }

    // Simple round-robin rotation
    const token = this.tokens[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.tokens.length;

    // Track usage
    const usage = this.tokenUsage.get(token)!;
    usage.count++;
    usage.lastUsed = new Date();

    logger.debug(`Using token ${this.currentIndex} of ${this.tokens.length}`);

    return token;
  }

  /**
   * Get a token that hasn't been used recently
   * Good for avoiding rate limits
   */
  getLeastRecentlyUsedToken(): string {
    if (this.tokens.length === 1) {
      return this.tokens[0];
    }

    let oldestToken = this.tokens[0];
    let oldestTime = this.tokenUsage.get(oldestToken)!.lastUsed;

    for (const token of this.tokens) {
      const usage = this.tokenUsage.get(token)!;
      if (usage.lastUsed < oldestTime) {
        oldestTime = usage.lastUsed;
        oldestToken = token;
      }
    }

    // Update usage
    const usage = this.tokenUsage.get(oldestToken)!;
    usage.count++;
    usage.lastUsed = new Date();

    const tokenIndex = this.tokens.indexOf(oldestToken);
    logger.debug(`Using least recently used token (${tokenIndex + 1}/${this.tokens.length})`);

    return oldestToken;
  }

  /**
   * Mark a token as rate limited and avoid it temporarily
   */
  markTokenAsRateLimited(token: string) {
    const usage = this.tokenUsage.get(token);
    if (usage) {
      // Set last used to future to avoid using it for a while
      usage.lastUsed = new Date(Date.now() + 60 * 60 * 1000); // 1 hour in future
      logger.warn(`Token marked as rate limited, avoiding for 1 hour`);
    }
  }

  /**
   * Get token count
   */
  getTokenCount(): number {
    return this.tokens.length;
  }

  /**
   * Get usage statistics
   */
  getUsageStats() {
    const stats: any[] = [];
    this.tokens.forEach((token, index) => {
      const usage = this.tokenUsage.get(token)!;
      stats.push({
        index: index + 1,
        count: usage.count,
        lastUsed: usage.lastUsed.toISOString()
      });
    });
    return stats;
  }
}

// Singleton instance
let tokenRotatorInstance: TokenRotator | null = null;

export function getTokenRotator(): TokenRotator {
  if (!tokenRotatorInstance) {
    tokenRotatorInstance = new TokenRotator();
  }
  return tokenRotatorInstance;
}