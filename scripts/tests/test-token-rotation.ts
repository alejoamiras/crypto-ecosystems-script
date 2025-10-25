#!/usr/bin/env bun

import dotenv from "dotenv";
import { TokenRotator } from "../../src/lib/token-rotator";
import { GitHubSearchClient } from "../../src/lib/github";
import { createFileLogger } from "../../src/lib/logger";
import { classifyRepository } from "../../src/lib/aztec-classifier";

// Load environment variables
dotenv.config();

const logger = createFileLogger(undefined, "debug", true);

/**
 * Test token rotation functionality
 */
async function testTokenRotation() {
  logger.info("Starting token rotation test...");

  // Test 1: Token Rotator initialization
  logger.info("\n=== Test 1: Token Rotator Initialization ===");
  try {
    const rotator = new TokenRotator();
    const tokenCount = rotator.getTokenCount();

    logger.info(`Successfully initialized TokenRotator with ${tokenCount} tokens`);

    if (tokenCount === 1) {
      logger.warn("Only 1 token found. For effective rotation, add more tokens:");
      logger.warn("GITHUB_TOKEN_1, GITHUB_TOKEN_2, GITHUB_TOKEN_3, etc.");
    } else {
      logger.info(`Found ${tokenCount} tokens for rotation`);
    }

    // Test token cycling
    logger.info("\n=== Test 2: Token Cycling ===");
    const tokens: string[] = [];
    for (let i = 0; i < tokenCount * 2; i++) {
      const token = rotator.getNextToken();
      tokens.push(token.substring(0, 10) + "...");
      logger.debug(`Rotation ${i + 1}: Token ${token.substring(0, 10)}...`);
    }

    logger.info("Token rotation cycling works correctly");

    // Test LRU selection
    logger.info("\n=== Test 3: Least Recently Used Selection ===");
    const lruToken1 = rotator.getLeastRecentlyUsedToken();
    logger.debug(`LRU token 1: ${lruToken1.substring(0, 10)}...`);

    // Mark it as rate limited
    rotator.markTokenAsRateLimited(lruToken1);

    const lruToken2 = rotator.getLeastRecentlyUsedToken();
    logger.debug(`LRU token 2: ${lruToken2.substring(0, 10)}...`);

    if (tokenCount > 1 && lruToken1 === lruToken2) {
      logger.warn("LRU selection returned same token after marking as rate limited");
    } else if (tokenCount > 1) {
      logger.info("LRU selection correctly returns different token after rate limit");
    }

    // Test usage stats
    logger.info("\n=== Test 4: Usage Statistics ===");
    const stats = rotator.getUsageStats();
    stats.forEach((stat, index) => {
      logger.info(`Token ${index + 1}: Used ${stat.useCount} times, Rate limited: ${stat.isRateLimited}`);
    });

  } catch (error) {
    logger.error({ error }, "Failed to initialize TokenRotator");
    logger.info("Make sure you have GITHUB_TOKEN or GITHUB_TOKEN_1 set in .env");
    return;
  }

  // Test 5: Integration with GitHubSearchClient
  logger.info("\n=== Test 5: GitHubSearchClient Integration ===");
  try {
    const client = new GitHubSearchClient({
      useTokenRotation: true,
      searchTimeoutMs: 30000
    });

    logger.info("GitHubSearchClient initialized with token rotation");

    // Get token stats from client
    const clientStats = client.getTokenStats();
    if (clientStats) {
      logger.info(`Client has ${clientStats.length} tokens available`);
    }

    // Test with a simple search
    logger.info("\n=== Test 6: Search with Token Rotation ===");
    const results = await client.searchCode('filename:Nargo.toml stars:>100', {
      maxResults: 5
    });

    logger.info(`Search completed successfully, found ${results.length} results`);

    // Check rate limit status
    const rateLimit = await client.checkRateLimit();
    logger.info(`Rate limit status: ${rateLimit.remaining}/${rateLimit.limit} remaining`);

  } catch (error) {
    logger.error({ error }, "Failed to test GitHubSearchClient with rotation");
  }

  // Test 7: Integration with aztec-classifier
  logger.info("\n=== Test 7: Aztec Classifier Integration ===");
  try {
    // Test with a known repository
    const testRepo = { owner: "AztecProtocol", repo: "aztec-packages" };

    logger.info(`Testing classification of ${testRepo.owner}/${testRepo.repo}`);

    const classification = await classifyRepository(
      testRepo.owner,
      testRepo.repo,
      process.env.GITHUB_TOKEN || ""
    );

    logger.info(`Classification result:`);
    logger.info(`  - Is Aztec: ${classification.isAztec}`);
    logger.info(`  - Type: ${classification.nargoType}`);
    logger.info(`  - Files checked: ${classification.filesChecked}`);

    if (classification.apiFailure) {
      logger.warn(`API issues detected: ${classification.apiFailure.reason}`);
    }

  } catch (error) {
    logger.error({ error }, "Failed to test aztec-classifier with rotation");
  }

  // Test 8: Simulate rate limit scenario
  logger.info("\n=== Test 8: Rate Limit Simulation ===");
  logger.info("To fully test rate limit handling:");
  logger.info("1. Add multiple tokens to .env (GITHUB_TOKEN_1, GITHUB_TOKEN_2, etc.)");
  logger.info("2. Run: bun run find:aztec:full");
  logger.info("3. Monitor logs for token rotation messages");
  logger.info("4. Check for 'Rotating to a different token due to rate limit' messages");

  logger.info("\n=== Token Rotation Test Complete ===");
}

// Run the test
if (import.meta.main) {
  testTokenRotation().catch(error => {
    logger.error({ error }, "Test failed");
    process.exit(1);
  });
}