#!/usr/bin/env bun

import dotenv from "dotenv";
import { classifyRepository, findAllNargoTomlFiles } from "../src/lib/aztec-classifier";

dotenv.config();

async function testSearchFailure() {
  const token = process.env.GITHUB_TOKEN!;

  console.log("Testing direct search function to see if it handles failures correctly:");

  // Test with an invalid token to force a failure
  const invalidToken = "invalid_token_12345";

  console.log("\n1. Testing with invalid token (should fail and return failure info):");
  const failedResult = await findAllNargoTomlFiles('nethermindeth', 'aztec-wormhole-app-demo', invalidToken);
  console.log(`   Search failed: ${failedResult.searchFailed}`);
  console.log(`   Failure reason: ${failedResult.failureReason}`);
  console.log(`   Files found: ${failedResult.paths.length}`);
  console.log(`   This should trigger fallback paths in classifyRepository`);

  console.log("\n2. Testing classification with invalid token (should track API failure):");
  const classificationResult = await classifyRepository('nethermindeth', 'aztec-wormhole-app-demo', invalidToken);
  console.log(`   Classification: ${classificationResult.isAztec ? 'AZTEC' : 'NOIR'}`);
  console.log(`   Type: ${classificationResult.nargoType}`);
  console.log(`   Files checked: ${classificationResult.filesChecked}`);
  console.log(`   Files found: ${classificationResult.nargoFiles.join(', ') || 'none'}`);
  console.log(`   Indicators: ${classificationResult.aztecIndicators.join(', ') || 'none'}`);

  if (classificationResult.apiFailure) {
    console.log(`\n   ⚠️  API Failure tracked:`);
    console.log(`   - Search failed: ${classificationResult.apiFailure.searchFailed}`);
    console.log(`   - All fetches failed: ${classificationResult.apiFailure.allFetchesFailed}`);
    console.log(`   - Reason: ${classificationResult.apiFailure.reason}`);
  }

  if (classificationResult.apiFailure && classificationResult.nargoType === 'unknown') {
    console.log("\n✅ SUCCESS: API failure tracking working! Repository marked as unknown due to API issues.");
  } else if (classificationResult.filesChecked > 0 && classificationResult.isAztec) {
    console.log("\n✅ SUCCESS: Fallback paths worked! Repository correctly classified as Aztec even with search failure.");
  } else {
    console.log("\n⚠️  WARNING: Unexpected result.");
  }
}

async function main() {
  await testSearchFailure();
}

main().catch(console.error);