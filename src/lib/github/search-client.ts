import { Octokit } from "@octokit/rest";
import { retry } from "@octokit/plugin-retry";
import { throttling } from "@octokit/plugin-throttling";
import { logger } from "../logger";
import { TokenRotator } from "../token-rotator";
import {
  SearchTimeoutError,
  RateLimitError,
  AbuseLimitError,
  GitHubAPIError,
} from "../errors";
import type {
  SearchConfig,
  RepositorySearchResult,
  SearchOptions,
  RateLimitInfo,
  ExclusionConfig,
} from "../../types/github";

// Create custom Octokit with plugins
const MyOctokit = Octokit.plugin(retry, throttling);

/**
 * GitHub Search Client with advanced error handling and rate limiting
 */
export class GitHubSearchClient {
  private octokit: InstanceType<typeof MyOctokit>;
  private excludeRepos: Set<string>;
  private excludeOrgs: Set<string>;
  private excludeTopics: Set<string>;
  private searchTimeoutMs: number;
  private tokenRotator?: TokenRotator;
  private useTokenRotation: boolean;

  constructor(config: SearchConfig = {}) {
    this.excludeRepos = new Set(config.excludeRepos || []);
    this.excludeOrgs = new Set(config.excludeOrgs || []);
    this.excludeTopics = new Set(config.excludeTopics || []);
    this.searchTimeoutMs = config.searchTimeoutMs || 30000; // Default 30 seconds
    this.useTokenRotation = config.useTokenRotation || false;

    // Initialize token rotation if enabled
    let token: string | undefined;
    if (this.useTokenRotation) {
      try {
        this.tokenRotator = new TokenRotator();
        token = this.tokenRotator.getNextToken();
        logger.info(`Token rotation enabled with ${this.tokenRotator.getTokenCount()} tokens`);
      } catch (error) {
        logger.warn("Failed to initialize token rotation, falling back to single token");
        this.useTokenRotation = false;
        token = config.githubToken || process.env.GITHUB_TOKEN;
      }
    } else {
      token = config.githubToken || process.env.GITHUB_TOKEN;
    }

    if (!token) {
      logger.warn("No GitHub token provided. API rate limits will be very restrictive.");
    }

    // Initialize Octokit with retry and throttling plugins
    this.octokit = new MyOctokit({
      auth: token,
      retry: {
        retries: config.maxRetries || 5,
        retryAfterBaseValue: 1000,
        doNotRetry: [400, 401, 403, 404, 422],
      },
      throttle: {
        onRateLimit: (retryAfter, options: any, octokit, retryCount) => {
          logger.warn(
            `Rate limit detected for request ${options.method} ${options.url}. Retry #${retryCount} after ${retryAfter} seconds.`
          );

          // Try to rotate token if available
          if (this.useTokenRotation && this.tokenRotator && retryCount === 1) {
            const currentToken = (octokit.auth as any).token;
            this.tokenRotator.markTokenAsRateLimited(currentToken);

            const newToken = this.tokenRotator.getLeastRecentlyUsedToken();
            if (newToken !== currentToken) {
              logger.info("Rotating to a different token due to rate limit");
              (octokit.auth as any) = newToken;
              return true;
            }
          }

          // Retry up to 5 times for rate limit
          if (retryCount <= 5) {
            logger.info(`Retrying after ${retryAfter} seconds...`);
            return true;
          }

          logger.error("Max rate limit retries exceeded");
          return false;
        },
        onSecondaryRateLimit: (retryAfter, options: any, _octokit, retryCount) => {
          logger.warn(
            `Secondary rate limit (abuse detection) for ${options.method} ${options.url}. Retry #${retryCount} after ${retryAfter} seconds.`
          );

          // Retry up to 3 times for abuse detection
          if (retryCount <= 3) {
            logger.info(`Retrying after ${retryAfter} seconds due to abuse detection...`);
            return true;
          }

          logger.error("Max abuse limit retries exceeded");
          return false;
        },
      },
    });
  }

  /**
   * Check rate limit status
   */
  async checkRateLimit(): Promise<RateLimitInfo> {
    try {
      const { data } = await this.octokit.rateLimit.get();
      const search = data.resources.search;

      logger.info({
        remaining: search.remaining,
        limit: search.limit,
        reset: new Date(search.reset * 1000).toISOString(),
      }, "GitHub API rate limit status");

      return {
        limit: search.limit,
        remaining: search.remaining,
        reset: search.reset,
        used: search.limit - search.remaining,
      };
    } catch (error) {
      logger.error({ error }, "Failed to check rate limit");
      throw new GitHubAPIError("Failed to check rate limit", undefined, error);
    }
  }

  /**
   * Manually rotate to next token
   */
  rotateToken(): void {
    if (!this.useTokenRotation || !this.tokenRotator) {
      logger.warn("Token rotation is not enabled");
      return;
    }

    const newToken = this.tokenRotator.getNextToken();
    this.octokit = new MyOctokit({
      auth: newToken,
      retry: {
        retries: 5,
        retryAfterBaseValue: 1000,
        doNotRetry: [400, 401, 403, 404, 422],
      },
      throttle: {
        onRateLimit: (retryAfter, options: any, octokit, retryCount) => {
          logger.warn(
            `Rate limit detected for request ${options.method} ${options.url}. Retry #${retryCount} after ${retryAfter} seconds.`
          );

          // Try to rotate token if available
          if (this.useTokenRotation && this.tokenRotator && retryCount === 1) {
            const currentToken = (octokit.auth as any).token;
            this.tokenRotator.markTokenAsRateLimited(currentToken);

            const newToken = this.tokenRotator.getLeastRecentlyUsedToken();
            if (newToken !== currentToken) {
              logger.info("Rotating to a different token due to rate limit");
              (octokit.auth as any) = newToken;
              return true;
            }
          }

          // Retry up to 5 times for rate limit
          if (retryCount <= 5) {
            logger.info(`Retrying after ${retryAfter} seconds...`);
            return true;
          }

          logger.error("Max rate limit retries exceeded");
          return false;
        },
        onSecondaryRateLimit: (retryAfter, options: any, _octokit, retryCount) => {
          logger.warn(
            `Secondary rate limit (abuse detection) for ${options.method} ${options.url}. Retry #${retryCount} after ${retryAfter} seconds.`
          );

          // Retry up to 3 times for abuse detection
          if (retryCount <= 3) {
            logger.info(`Retrying after ${retryAfter} seconds due to abuse detection...`);
            return true;
          }

          logger.error("Max abuse limit retries exceeded");
          return false;
        },
      },
    });

    logger.info("Manually rotated to next token");
  }

  /**
   * Get token rotation statistics
   */
  getTokenStats() {
    if (!this.tokenRotator) {
      return null;
    }
    return this.tokenRotator.getUsageStats();
  }

  /**
   * Build search query with exclusions
   */
  private buildSearchQuery(baseQuery: string): string {
    let query = baseQuery;

    // Add exclusions to the query
    for (const repo of this.excludeRepos) {
      query += ` -repo:${repo}`;
    }

    for (const org of this.excludeOrgs) {
      query += ` -org:${org} -user:${org}`;
    }

    return query;
  }

  /**
   * Filter results based on exclusion lists
   */
  private filterResults(results: any[]): any[] {
    return results.filter((repo) => {
      // Check if repo should be excluded
      if (this.excludeRepos.has(repo.full_name)) {
        logger.debug(`Excluding repo: ${repo.full_name} (in exclusion list)`);
        return false;
      }

      if (this.excludeOrgs.has(repo.owner.login)) {
        logger.debug(`Excluding repo: ${repo.full_name} (owner in exclusion list)`);
        return false;
      }

      // Check topic exclusions
      if (repo.topics && repo.topics.length > 0) {
        for (const topic of repo.topics) {
          if (this.excludeTopics.has(topic)) {
            logger.debug(`Excluding repo: ${repo.full_name} (has excluded topic: ${topic})`);
            return false;
          }
        }
      }

      return true;
    });
  }

  /**
   * Transform GitHub API response to our result format
   */
  private transformRepository(repo: any): RepositorySearchResult {
    return {
      name: repo.name,
      fullName: repo.full_name,
      owner: repo.owner.login,
      description: repo.description,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      language: repo.language,
      topics: repo.topics,
      url: repo.html_url,
      homepage: repo.homepage,
      createdAt: repo.created_at,
      updatedAt: repo.updated_at,
      pushedAt: repo.pushed_at,
      isArchived: repo.archived,
      isPrivate: repo.private,
      license: repo.license?.name || null,
      defaultBranch: repo.default_branch,
    };
  }

  /**
   * Search repositories with timeout and error handling
   */
  async searchRepositories(
    query: string,
    options: SearchOptions = {}
  ): Promise<RepositorySearchResult[]> {
    const startTime = Date.now();
    const { perPage = 30, maxResults = 100, sort = "stars", order = "desc" } = options;

    const finalQuery = this.buildSearchQuery(query);
    logger.info({ query: finalQuery, options }, "Starting repository search");

    const results: RepositorySearchResult[] = [];
    let page = 1;

    try {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new SearchTimeoutError(`Search timeout after ${this.searchTimeoutMs}ms`));
        }, this.searchTimeoutMs);
      });

      while (results.length < maxResults) {
        // Check if we're approaching timeout
        if (Date.now() - startTime > this.searchTimeoutMs - 5000) {
          logger.warn("Approaching timeout, stopping search early");
          break;
        }

        logger.debug(`Fetching page ${page} with ${perPage} results per page`);

        // Race between API call and timeout
        const searchPromise = this.octokit.search.repos({
          q: finalQuery,
          sort,
          order,
          per_page: perPage,
          page,
        });

        const response = await Promise.race([searchPromise, timeoutPromise]);

        logger.info(`Found ${response.data.total_count} total results, fetched ${response.data.items.length} on page ${page}`);

        // Filter results
        const filteredItems = this.filterResults(response.data.items);

        // Transform and add to results
        for (const repo of filteredItems) {
          if (results.length >= maxResults) break;
          results.push(this.transformRepository(repo));
        }

        // Check if we have more pages
        if (!response.data.incomplete_results &&
            response.data.items.length === perPage &&
            results.length < maxResults) {
          page++;
        } else {
          break;
        }
      }

      const elapsed = Date.now() - startTime;
      logger.info(`Search completed in ${elapsed}ms, found ${results.length} repositories after filtering`);

      return results;

    } catch (error: any) {
      const elapsed = Date.now() - startTime;

      if (error instanceof SearchTimeoutError) {
        logger.error(`Search timed out after ${elapsed}ms`);
        throw error;
      }

      if (error.status === 403) {
        if (error.response?.headers?.['x-ratelimit-remaining'] === '0') {
          const resetTime = error.response.headers['x-ratelimit-reset'];
          const retryAfter = resetTime ? parseInt(resetTime) - Math.floor(Date.now() / 1000) : undefined;

          logger.error(`Rate limit exceeded. Reset at ${new Date(parseInt(resetTime) * 1000).toISOString()}`);
          throw new RateLimitError("GitHub API rate limit exceeded", retryAfter);
        }

        if (error.message?.includes('abuse')) {
          logger.error("Abuse detection triggered by GitHub");
          throw new AbuseLimitError("GitHub abuse detection triggered", 60);
        }
      }

      logger.error({ error, elapsed }, "Search failed with error");
      throw new GitHubAPIError(
        `Search failed: ${error.message}`,
        error.status,
        error.response
      );
    }
  }

  /**
   * Search with automatic retry on rate limit
   */
  async searchWithRetry(
    query: string,
    options?: SearchOptions,
    maxRetries: number = 5
  ): Promise<RepositorySearchResult[]> {
    let retryCount = 0;

    while (retryCount <= maxRetries) {
      try {
        return await this.searchRepositories(query, options);
      } catch (error) {
        if ((error instanceof RateLimitError || error instanceof AbuseLimitError) && retryCount < maxRetries) {
          const waitTime = error.retryAfter || 60;
          logger.info(`Rate limited. Waiting ${waitTime} seconds before retry ${retryCount + 1}/${maxRetries}`);

          await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
          retryCount++;
        } else {
          throw error;
        }
      }
    }

    throw new Error(`Failed after ${maxRetries} retries`);
  }

  /**
   * Update exclusion lists
   */
  updateExclusions(config: ExclusionConfig) {
    if (config.repos) {
      this.excludeRepos = new Set(config.repos);
      logger.info(`Updated excluded repos: ${config.repos.join(", ")}`);
    }

    if (config.orgs) {
      this.excludeOrgs = new Set(config.orgs);
      logger.info(`Updated excluded orgs: ${config.orgs.join(", ")}`);
    }

    if (config.topics) {
      this.excludeTopics = new Set(config.topics);
      logger.info(`Updated excluded topics: ${config.topics.join(", ")}`);
    }
  }

  /**
   * Get current exclusion configuration
   */
  getExclusions(): ExclusionConfig {
    return {
      repos: Array.from(this.excludeRepos),
      orgs: Array.from(this.excludeOrgs),
      topics: Array.from(this.excludeTopics),
    };
  }

  /**
   * Search for code/files in repositories
   */
  async searchCode(
    query: string,
    options?: SearchOptions
  ): Promise<any[]> {
    const maxResults = options?.maxResults || 100;
    const perPage = Math.min(maxResults, 100);
    const results: any[] = [];

    try {
      logger.info(`Searching code with query: ${query}`);

      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new SearchTimeoutError(`Code search timed out after ${this.searchTimeoutMs}ms`));
        }, this.searchTimeoutMs);
      });

      // Create search promise
      const searchPromise = async () => {
        let page = 1;
        const maxPages = Math.ceil(maxResults / perPage);

        while (page <= maxPages && results.length < maxResults) {
          const response = await this.octokit.search.code({
            q: query,
            per_page: perPage,
            page,
            sort: options?.sort as any,
            order: options?.order as any,
          });

          logger.debug(`Code search page ${page}: ${response.data.items.length} results`);

          // Add results
          results.push(...response.data.items);

          // Check if we have more pages
          if (response.data.items.length < perPage || results.length >= maxResults) {
            break;
          }

          page++;

          // Small delay between requests to avoid rate limiting
          if (page <= maxPages && results.length < maxResults) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }

        return results.slice(0, maxResults);
      };

      // Race between search and timeout
      const finalResults = await Promise.race([
        searchPromise(),
        timeoutPromise
      ]);

      logger.info(`Code search complete. Found ${finalResults.length} results`);
      return finalResults;

    } catch (error: any) {
      // Handle specific GitHub API errors
      if (error.status === 403 && error.response?.headers?.['x-ratelimit-remaining'] === '0') {
        const resetTime = parseInt(error.response.headers['x-ratelimit-reset']);
        const waitTime = Math.ceil((resetTime - Date.now() / 1000));

        throw new RateLimitError(
          `GitHub API rate limit exceeded. Reset in ${waitTime} seconds`,
          waitTime
        );
      }

      if (error.status === 403 && error.message?.includes('abuse')) {
        throw new AbuseLimitError("GitHub abuse detection triggered. Please wait before retrying.");
      }

      if (error instanceof SearchTimeoutError) {
        throw error;
      }

      // Re-throw other errors
      throw new GitHubAPIError(
        `Code search failed: ${error.message}`,
        error.status,
        error.response
      );
    }
  }
}