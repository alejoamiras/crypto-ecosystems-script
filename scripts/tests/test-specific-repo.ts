#!/usr/bin/env bun

import dotenv from "dotenv";
import { classifyRepository } from "../../src/lib/aztec-classifier";

dotenv.config();

async function main() {
  const token = process.env.GITHUB_TOKEN!;

  console.log("Testing specific repositories with shared classifier:");

  // Test an Aztec Protocol repo
  const result1 = await classifyRepository('nethermindeth', 'aztec-wormhole-app-demo', token);
  console.log("\nnethermindeth/aztec-wormhole-app-demo:");
  console.log(`  Classification: ${result1.isAztec ? 'AZTEC' : 'NOIR'}`);
  console.log(`  Type: ${result1.nargoType}`);
  console.log(`  Files checked: ${result1.filesChecked}`);
  console.log(`  Indicators: ${result1.aztecIndicators.join(', ')}`);
}

main().catch(console.error);