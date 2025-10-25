#!/usr/bin/env bun

import dotenv from "dotenv";
import { classifyRepository } from "../src/lib/aztec-classifier";

dotenv.config();

const token = process.env.GITHUB_TOKEN!;

async function testRepo(owner: string, repo: string) {
  console.log(`\n=== Testing ${owner}/${repo} ===`);

  try {
    const result = await classifyRepository(owner, repo, token);

    console.log(`Found ${result.filesChecked} Nargo.toml files`);
    if (result.nargoFiles.length > 0) {
      console.log(`Files found: ${result.nargoFiles.join(', ')}`);
    }

    console.log(`\nClassification: ${result.isAztec ? 'AZTEC' : 'NOIR'}`);
    console.log(`Primary type: ${result.nargoType}`);

    if (result.aztecIndicators.length > 0) {
      console.log(`Aztec indicators:`);
      result.aztecIndicators.forEach(ind => console.log(`  - ${ind}`));
    }

  } catch (error: any) {
    console.log(`Error: ${error.message}`);
  }
}

async function main() {
  // Test the repos you mentioned
  // await testRepo('walletmesh', 'aztec-accounts');
  await testRepo('substance-labs', 'aztec-evm-bridge');

  // Also test some that should be Noir only
  // await testRepo('dimachumachenko', 'Gost-34.12-2015');

  // Test one that's definitely Aztec
  // await testRepo('AztecProtocol', 'aztec-packages');
}

main();