/**
 * Shared library for classifying Noir/Aztec repositories
 */

import axios from "axios";
import axiosRetry from "axios-retry";
import toml from "toml";
import { logger } from "./logger";
import { TokenRotator } from "./token-rotator";
import { config } from "./config";

// Global token rotator instance (singleton)
let tokenRotator: TokenRotator | null = null;
let useTokenRotation = false;

// Initialize token rotation if environment variable is set
if (process.env.USE_TOKEN_ROTATION === 'true') {
  try {
    tokenRotator = new TokenRotator();
    useTokenRotation = true;
    logger.info(`Aztec classifier: Token rotation enabled with ${tokenRotator.getTokenCount()} tokens`);
  } catch (error) {
    logger.warn("Aztec classifier: Failed to initialize token rotation");
  }
}

/**
 * Get the next token (with rotation if enabled)
 */
function getNextToken(fallbackToken?: string): string {
  if (useTokenRotation && tokenRotator) {
    return tokenRotator.getNextToken();
  }
  return fallbackToken || process.env.GITHUB_TOKEN || '';
}

// Configure axios with retry logic for better reliability
axiosRetry(axios, {
  retries: config.retry.maxRetries,
  retryDelay: (retryCount, error) => {
    // Check for rate limit headers
    const retryAfter = error.response?.headers?.['retry-after'];
    const rateLimitReset = error.response?.headers?.['x-ratelimit-reset'];

    // If we have a retry-after header, use it
    if (retryAfter) {
      const delay = parseInt(retryAfter) * 1000;
      logger.info(`Rate limit retry-after header: waiting ${retryAfter} seconds`);
      return Math.min(delay, config.retry.maxRetryDelay); // Respect max delay
    }

    // If we have a rate limit reset time, calculate delay
    if (rateLimitReset) {
      const resetTime = parseInt(rateLimitReset) * 1000;
      const now = Date.now();
      const delay = Math.max(resetTime - now + 1000, 1000); // Add 1s buffer
      logger.info(`Rate limit reset at ${new Date(resetTime).toISOString()}, waiting ${Math.ceil(delay / 1000)} seconds`);
      return Math.min(delay, config.retry.maxRetryDelay); // Respect max delay
    }

    // For rate limits without headers, use configured base delay
    if (error.response?.status === 403 || error.response?.status === 429) {
      const delay = Math.min(
        config.retry.rateLimitBaseDelay * retryCount,
        config.retry.maxRetryDelay
      );
      logger.info(`Rate limit detected, waiting ${delay / 1000} seconds before retry ${retryCount}`);
      return delay;
    }

    // For other errors, use standard exponential backoff with configured base
    const delay = Math.pow(2, retryCount - 1) * config.retry.standardRetryBaseDelay;
    return Math.min(delay, config.retry.maxRetryDelay);
  },
  retryCondition: (error) => {
    // Retry on network errors or 5xx errors or rate limiting (403/429)
    const status = error.response?.status;
    return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
           status === 429 ||
           status === 403 ||
           (status !== undefined && status >= 500 && status < 600);
  },
  onRetry: (retryCount, error, requestConfig) => {
    // Rotate token on rate limit if token rotation is enabled
    if ((error.response?.status === 403 || error.response?.status === 429) &&
        useTokenRotation && tokenRotator) {
      const newToken = tokenRotator.getNextToken();
      if (requestConfig.headers) {
        requestConfig.headers['Authorization'] = `Bearer ${newToken}`;
        logger.info(`Rotated to new token for retry ${retryCount}`);
      }
    }

    logger.warn({
      retryCount,
      url: requestConfig.url,
      status: error.response?.status,
      message: error.message
    }, `Retrying request (attempt ${retryCount})`);
  }
});

interface NargoConfig {
  package?: {
    name?: string;
    type?: string;
  };
  dependencies?: Record<string, any>;
}

export interface ClassificationResult {
  isAztec: boolean;
  nargoType: string;
  filesChecked: number;
  aztecIndicators: string[];
  nargoFiles: string[];
  apiFailure?: {
    searchFailed: boolean;
    allFetchesFailed: boolean;
    reason: string;
  };
}

/**
 * Search for all Nargo.toml files in a repository using GitHub's code search
 */
export async function findAllNargoTomlFiles(
  owner: string,
  repo: string,
  token: string
): Promise<{ paths: string[]; searchFailed: boolean; failureReason?: string }> {
  try {
    const searchUrl = `https://api.github.com/search/code?q=filename:Nargo.toml+repo:${owner}/${repo}`;

    // Use token rotation if enabled
    const activeToken = getNextToken(token);

    const response = await axios.get(searchUrl, {
      headers: {
        Authorization: `Bearer ${activeToken}`,
        Accept: 'application/vnd.github.v3+json'
      },
      timeout: config.timeout.httpRequestTimeout
    });

    // Extract paths from search results
    const paths = response.data.items?.map((item: any) => item.path) || [];
    logger.debug(`Found ${paths.length} Nargo.toml files in ${owner}/${repo}: ${paths.join(', ')}`);
    return { paths, searchFailed: false };
  } catch (error: any) {
    // Log detailed error information
    const errorDetails = {
      owner,
      repo,
      status: error.response?.status,
      statusText: error.response?.statusText,
      message: error.message,
      code: error.code,
      isTimeout: error.code === 'ECONNABORTED',
      isRateLimit: error.response?.status === 403 || error.response?.status === 429
    };

    let failureReason = "Unknown error";
    if (error.response?.status === 403 || error.response?.status === 429) {
      failureReason = "Rate limit exceeded";
      logger.error(errorDetails, "GitHub API rate limit hit while searching for Nargo.toml files");
    } else if (error.code === 'ECONNABORTED') {
      failureReason = "Request timeout";
      logger.error(errorDetails, "Request timeout while searching for Nargo.toml files");
    } else if (error.response?.status === 401) {
      failureReason = "Authentication failed";
      logger.error(errorDetails, "Authentication failed while searching for Nargo.toml files");
    } else {
      failureReason = error.message || "Search API error";
      logger.warn(errorDetails, "Code search for Nargo.toml files failed, will try common paths");
    }

    return { paths: [], searchFailed: true, failureReason };
  }
}

/**
 * Fetch and parse a Nargo.toml file from a specific path
 */
export async function fetchNargoTomlFromPath(
  owner: string,
  repo: string,
  path: string,
  token: string
): Promise<NargoConfig | null> {
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

    // Use token rotation if enabled
    const activeToken = getNextToken(token);

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${activeToken}`,
        Accept: 'application/vnd.github.v3+json'
      },
      timeout: config.timeout.httpRequestTimeout
    });

    // Handle if it's a directory (shouldn't happen with Nargo.toml, but be safe)
    if (response.data.type === 'dir') {
      return null;
    }

    // Decode base64 content
    const content = Buffer.from(response.data.content, 'base64').toString('utf-8');

    // Parse TOML
    const config = toml.parse(content) as NargoConfig;
    return config;
  } catch (error: any) {
    if (error.response?.status === 404) {
      // 404 is expected for paths that don't exist, just debug log
      logger.debug({ owner, repo, path }, "Nargo.toml not found at path");
    } else if (error.response?.status === 403 || error.response?.status === 429) {
      logger.error({
        owner,
        repo,
        path,
        status: error.response?.status,
        message: error.message
      }, "Rate limited while fetching Nargo.toml");
    } else if (error.code === 'ECONNABORTED') {
      logger.error({ owner, repo, path }, "Timeout while fetching Nargo.toml");
    } else {
      logger.warn({
        owner,
        repo,
        path,
        status: error.response?.status,
        error: error.message
      }, "Failed to fetch Nargo.toml");
    }
    return null;
  }
}

/**
 * Analyze a single Nargo.toml config to determine if it's Aztec-related
 */
export function analyzeNargoConfig(config: NargoConfig): {
  isAztec: boolean;
  type: string;
  indicators: string[];
} {
  const indicators: string[] = [];
  let isAztec = false;
  const packageType = config.package?.type || 'bin';

  // Check if it's a contract (definite Aztec indicator)
  if (packageType === 'contract') {
    isAztec = true;
    indicators.push('type=contract');
  }

  // Check dependencies for Aztec-related packages
  if (config.dependencies) {
    for (const [dep, _] of Object.entries(config.dependencies)) {
      const depLower = dep.toLowerCase();
      // Check for various Aztec-related dependencies
      if (depLower.includes('aztec') ||
          depLower === 'aztec.nr' ||
          depLower === 'aztec' ||
          depLower.includes('aztec_') ||
          depLower.startsWith('aztec-')) {
        isAztec = true;
        indicators.push(`dependency:${dep}`);
      }
    }
  }

  return { isAztec, type: packageType, indicators };
}

/**
 * Common paths where Nargo.toml files might be located
 */
const COMMON_NARGO_PATHS = [
  'Nargo.toml',
  'contracts/Nargo.toml',
  'src/Nargo.toml',
  'packages/contracts/Nargo.toml',
  'circuits/Nargo.toml',
  'app/Nargo.toml',
  'examples/Nargo.toml',
  'packages/aztec-contracts/Nargo.toml',
  'packages/noir-contracts/Nargo.toml',
  'contracts/src/Nargo.toml',
  // Additional nested package paths
  'packages/aztec-contracts/emitter/Nargo.toml',  // Specifically for the problematic repo
  'packages/aztec-contracts/*/Nargo.toml',
  'packages/*/contracts/Nargo.toml',
  'packages/*/Nargo.toml',
  'contracts/*/Nargo.toml',
  'src/contracts/Nargo.toml',
  'src/*/Nargo.toml',
  'examples/*/Nargo.toml',
  'tests/Nargo.toml',
  'test/Nargo.toml',
  // More aztec-specific patterns
  'aztec/Nargo.toml',
  'aztec-contracts/Nargo.toml',
  'noir-contracts/Nargo.toml',
  'packages/aztec/Nargo.toml',
  'packages/noir/Nargo.toml'
];

/**
 * Comprehensively analyze a repository to determine if it's Aztec or Noir
 * This is the SINGLE SOURCE OF TRUTH for classification
 */
export async function classifyRepository(
  owner: string,
  repo: string,
  token: string
): Promise<ClassificationResult> {
  const aztecIndicators: string[] = [];
  let isAztecRepo = false;
  let primaryType = 'unknown';
  let filesChecked = 0;
  const nargoFilesFound: string[] = [];
  let apiFailure: ClassificationResult['apiFailure'] = undefined;

  // First, try to find all Nargo.toml files via search
  const searchResult = await findAllNargoTomlFiles(owner, repo, token);
  let nargoPaths = searchResult.paths;

  // Track if search failed
  if (searchResult.searchFailed) {
    apiFailure = {
      searchFailed: true,
      allFetchesFailed: false, // Will be determined after trying fallback paths
      reason: searchResult.failureReason || 'Search failed'
    };
  }

  // If search didn't work or found nothing, try common paths
  if (nargoPaths.length === 0) {
    if (searchResult.searchFailed) {
      logger.info(`Search failed for ${owner}/${repo} (${searchResult.failureReason}), trying fallback paths`);
    } else {
      logger.debug(`No Nargo.toml files found via search for ${owner}/${repo}, trying common paths`);
    }
    nargoPaths = COMMON_NARGO_PATHS;
  } else {
    logger.info(`Found ${nargoPaths.length} Nargo.toml files in ${owner}/${repo} via search`);
  }

  // Track if we're using fallback paths
  const usingFallbackPaths = searchResult.searchFailed || (searchResult.paths.length === 0);
  let fallbackFetchAttempts = 0;
  let fallbackFetchFailures = 0;

  // Check each potential Nargo.toml file
  for (let i = 0; i < nargoPaths.length; i++) {
    const path = nargoPaths[i];

    // Track fallback fetch attempts
    if (usingFallbackPaths) {
      fallbackFetchAttempts++;
    }

    const config = await fetchNargoTomlFromPath(owner, repo, path, token);

    if (config) {
      filesChecked++;
      nargoFilesFound.push(path);
      const analysis = analyzeNargoConfig(config);

      logger.debug(`Analyzed ${path} in ${owner}/${repo}: isAztec=${analysis.isAztec}, type=${analysis.type}, indicators=${analysis.indicators.join(', ')}`);

      // If ANY Nargo.toml indicates Aztec, the whole repo is Aztec
      if (analysis.isAztec) {
        isAztecRepo = true;
        aztecIndicators.push(`${path}: ${analysis.indicators.join(', ')}`);

        // Contract type takes precedence for the primary type
        if (analysis.type === 'contract') {
          primaryType = 'contract';
        } else if (primaryType === 'unknown' || primaryType !== 'contract') {
          primaryType = analysis.type;
        }
      } else if (!isAztecRepo) {
        // Only update type if we haven't found any Aztec indicators yet
        if (primaryType === 'unknown') {
          primaryType = analysis.type;
        }
      }
    } else if (usingFallbackPaths) {
      // Track failed fetches when using fallback paths
      fallbackFetchFailures++;
    }

    // Rate limiting - small delay between API calls
    if (i < nargoPaths.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  // Update API failure info if all fallback fetches failed
  if (apiFailure && usingFallbackPaths && fallbackFetchAttempts > 0) {
    apiFailure.allFetchesFailed = (fallbackFetchFailures === fallbackFetchAttempts);
    if (apiFailure.allFetchesFailed) {
      logger.warn(`All ${fallbackFetchAttempts} fallback fetch attempts failed for ${owner}/${repo}`);
    }
  }

  // If still unknown but we found files, default to 'bin' for Noir projects
  if (!isAztecRepo && filesChecked > 0 && primaryType === 'unknown') {
    primaryType = 'bin';
  }

  const result: ClassificationResult = {
    isAztec: isAztecRepo,
    nargoType: primaryType,
    filesChecked,
    aztecIndicators,
    nargoFiles: nargoFilesFound,
    ...(apiFailure && { apiFailure })
  };

  // Enhanced logging with API failure info
  if (apiFailure) {
    logger.info(`Classification for ${owner}/${repo}: ${isAztecRepo ? 'AZTEC' : 'NOIR'} (checked ${filesChecked} files, found ${nargoFilesFound.length}) [API ISSUES: search=${apiFailure.searchFailed}, allFetchesFailed=${apiFailure.allFetchesFailed}]`);
  } else {
    logger.info(`Classification for ${owner}/${repo}: ${isAztecRepo ? 'AZTEC' : 'NOIR'} (checked ${filesChecked} files, found ${nargoFilesFound.length})`);
  }

  return result;
}