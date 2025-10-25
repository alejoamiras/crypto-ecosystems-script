/**
 * Centralized configuration for timeouts, retries, and rate limiting
 */

/**
 * Parse an environment variable as a number with a default value
 */
function parseEnvNumber(envVar: string | undefined, defaultValue: number): number {
  if (!envVar) return defaultValue;
  const parsed = parseInt(envVar, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Timeout configuration
 */
export const timeoutConfig = {
  // HTTP request timeout in milliseconds
  httpRequestTimeout: parseEnvNumber(process.env.HTTP_REQUEST_TIMEOUT, 30000),

  // Search operation timeout in milliseconds
  searchTimeout: parseEnvNumber(process.env.SEARCH_TIMEOUT, 60000),
};

/**
 * Retry configuration
 */
export const retryConfig = {
  // Maximum number of retry attempts
  maxRetries: parseEnvNumber(process.env.MAX_RETRIES, 5),

  // Base delay for rate limit retries in milliseconds
  rateLimitBaseDelay: parseEnvNumber(process.env.RATE_LIMIT_BASE_DELAY, 10000),

  // Maximum delay between retries in milliseconds
  maxRetryDelay: parseEnvNumber(process.env.MAX_RETRY_DELAY, 90000),

  // Base delay for standard retries in milliseconds
  standardRetryBaseDelay: parseEnvNumber(process.env.STANDARD_RETRY_BASE_DELAY, 1000),
};

/**
 * Rate limiting configuration
 */
export const rateLimitConfig = {
  // Delay between processing repositories in milliseconds
  repoProcessingDelay: parseEnvNumber(process.env.REPO_PROCESSING_DELAY, 100),

  // Delay between search queries in milliseconds
  searchQueryDelay: parseEnvNumber(process.env.SEARCH_QUERY_DELAY, 2000),
};

/**
 * Get all configuration as a single object
 */
export const config = {
  timeout: timeoutConfig,
  retry: retryConfig,
  rateLimit: rateLimitConfig,
};

// Log configuration on module load (only in development)
if (process.env.NODE_ENV !== 'production') {
  console.debug('Loaded configuration:', {
    timeout: timeoutConfig,
    retry: retryConfig,
    rateLimit: rateLimitConfig,
  });
}

export default config;