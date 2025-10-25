import { Octokit } from "@octokit/rest";
import { writeFileSync, readFileSync, existsSync, write, mkdirSync } from "fs";
import { join } from "path";
import toml from "toml";
import axios from "axios";

const HEADER_NOIR = `# Ecosystem Level Information
title = "Noir Lang"

sub_ecosystems = []

github_organizations = ["https://github.com/noir-lang", "https://github.com/Sequi-XYZ"]

# Repositories
[[repo]]
url = "`;

const HEADER_AZTEC = `# Ecosystem Level Information
title = "Aztec Protocol"

sub_ecosystems = ["Noir Lang", "zkRollups.xyz"]

github_organizations = ["https://github.com/AztecProtocol"]

# Repositories
[[repo]]
url = "`;

const TOML_JOINER = `"

[[repo]]
url = "`;

const SEARCH_RESULTS_PATH = join(__dirname, "outputs", "searchResults");
const INPUTS_PATH = join(__dirname, "inputs");
const OUTPUTS_PATH = join(__dirname, "outputs");

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

async function checkRateLimit() {
	const { data } = await octokit.rateLimit.get();
	const remaining = data.resources.code_search!.remaining;
	const reset = data.resources.code_search!.reset;
	console.log(`Remaining ${remaining} requests`);
	console.log(`Resetting at ${new Date(reset * 1000)}`);
	return { remaining, reset };
}

async function writeExistentReport(repoName: string) {
	mkdirSync(INPUTS_PATH, { recursive: true });
	const folder = repoName.charAt(0);
	const { data } = await axios.get(
		`https://raw.githubusercontent.com/electric-capital/crypto-ecosystems/refs/heads/master/data/ecosystems/${folder}/${repoName}.toml`
	);
	writeFileSync(join(__dirname, `inputs`, `${repoName}.toml`), data);
	return data;
}

async function getReposToExclude() {
	// Keep a smaller list of the most critical repos to exclude
	// These are the main repos with many Nargo.toml files
	const knownHeavyRepos = [
		"AztecProtocol/aztec-packages",
		// Only include a few key forks
		"dbanks12/aztec-packages",
		"TomAFrench/aztec-packages",
		"benesjan/aztec-packages",
		"ludamad/aztec-packages",
		"sirasistant/aztec-packages",
		"spalladino/aztec-packages",
		"just-mitch/aztec-packages",
		"vezenovm/aztec-packages",
	];

	return knownHeavyRepos;
}

async function readInputs() {
	const noirLangToml = readFileSync("inputs/noir-lang.toml");
	const aztecProtocolToml = readFileSync("inputs/aztec-protocol.toml");

	const noirLangInputs: Set<string> = new Set(
		toml.parse(noirLangToml.toString()).repo.map((repo: any) => repo.url)
	);
	const aztecProtocolInputs: Set<string> = new Set(
		toml
			.parse(aztecProtocolToml.toString())
			.repo.map((repo: any) => repo.url)
	);

	return { noirLangInputs, aztecProtocolInputs };
}

async function searchGithub(type: string, reposToExclude: string[]) {
	const repos = new Set<string>();
	try {
		// Build the query - code search doesn't support fork or stars filters
		const query = `filename:Nargo.toml type = "${type}" in:file NOT org:AztecProtocol NOT org:noir-lang ${reposToExclude
			.map((repo) => `NOT repo:${repo}`)
			.join(" ")}`;

		console.log(query);
		const resultsPerPage = 100;
		let page = 1;
		let hasMore = true;
		const maxPages = 10; // Stop at 1000 results (10 pages * 100 results)

		while (hasMore && page <= maxPages) {
			const { remaining, reset } = await checkRateLimit();

			if (remaining === 1) {
				const waitTime = reset * 1000 + 2000 - Date.now();
				console.log(
					`${new Date()} - Rate limit exceeded. Waiting for ${
						waitTime / 1000 + 2
					} seconds.`
				);
				await new Promise((res) => setTimeout(res, waitTime));
			}

			const { data } = await octokit.search.code({
				q: query,
				per_page: resultsPerPage,
				page,
			});

			data.items.map((item) => repos.add(item.repository.html_url));
			// console.log(urls);

			if (data.items.length < resultsPerPage) {
				hasMore = false;
			} else {
				page++;
			}
		}

		if (page > maxPages) {
			console.log(
				`${new Date()} - Reached maximum page limit (${maxPages} pages, ~${maxPages * 100} results) for type="${type}". There may be more results.`
			);
		}
	} catch (error: any) {
		// Check if it's the 1000 result limit error
		if (error.message?.includes("Cannot access beyond the first 1000 results")) {
			console.log(
				`${new Date()} - Hit GitHub's 1000 result limit for type="${type}". Returning partial results.`
			);
		} else {
			console.error(`${new Date()} - Error fetching repositories:`, error);
		}
	} finally {
		return repos;
	}
}

async function search() {
	mkdirSync(SEARCH_RESULTS_PATH, { recursive: true })!;

	// excluding some repos that have a ton of Nargo.toml files and are useless such as `aztec-packages`
	// need to remove them as the github search API has a 1000 result limit
	const reposToExclude = await getReposToExclude();

	// we've separated different types to get around the API limits
	// but libs and bins actually go into the same bucket
	// let's make it a Set so we can later just add it with the existent list without duplicates
	const noirTypes = ["lib", "bin"];
	let noirSet = new Set<string>();
	for (const type of noirTypes) {
		const repos = await searchGithub(type, reposToExclude);
		noirSet = noirSet.union(repos);
	}

	// Store the results in the "partials" folder
	// so we can reuse the results in the next step
	writeFileSync(
		join(SEARCH_RESULTS_PATH, `noir_repositories.txt`),
		Array.from(noirSet).join("\n"),
		{ encoding: "utf8", flag: "w" }
	);

	// using the same pattern for readability even though aztec contracts are just one type
	const aztecTypes = ["contract"];
	let aztecSet = new Set<string>();

	for (const type of aztecTypes) {
		const repos = await searchGithub(type, reposToExclude);
		aztecSet = aztecSet.union(repos);
	}

	writeFileSync(
		join(SEARCH_RESULTS_PATH, `aztec_repositories.txt`),
		Array.from(aztecSet).join("\n"),
		{ encoding: "utf8", flag: "w" }
	);
}

async function generateReport() {
	await writeExistentReport("noir-lang");
	await writeExistentReport("aztec-protocol");

	if (
		!existsSync(join(SEARCH_RESULTS_PATH, `noir_repositories.txt`)) ||
		!existsSync(join(SEARCH_RESULTS_PATH, `aztec_repositories.txt`))
	) {
		throw new Error("Run the script with `npm run start:search` first");
	}

	const { noirLangInputs, aztecProtocolInputs } = await readInputs();

	let noirSet = new Set<string>();
	readFileSync(join(SEARCH_RESULTS_PATH, `noir_repositories.txt`))
		.toString()
		.split("\n")
		.map((repo) => {
			noirSet.add(repo);
		});

	const noir = Array.from(noirSet.union(noirLangInputs)).sort((a, b) => {
		const lowerA = a.toLowerCase();
		const lowerB = b.toLowerCase();
		if (lowerA < lowerB) return -1;
		if (lowerA > lowerB) return 1;
		return 0;
	});

	writeFileSync(
		join(OUTPUTS_PATH, `noir_repos.toml`),
		HEADER_NOIR + noir.join(TOML_JOINER) + '"',
		{ encoding: "utf8", flag: "w" }
	);

	const aztecSet = new Set<string>();
	readFileSync(join(SEARCH_RESULTS_PATH, `aztec_repositories.txt`))
		.toString()
		.split("\n")
		.map((repo) => {
			aztecSet.add(repo);
		});

	const aztec = Array.from(
		new Set([...aztecSet, ...aztecProtocolInputs])
	).sort((a, b) => {
		const lowerA = a.toLowerCase();
		const lowerB = b.toLowerCase();
		if (lowerA < lowerB) return -1;
		if (lowerA > lowerB) return 1;
		return 0;
	});

	writeFileSync(
		join(OUTPUTS_PATH, `aztec_repos.toml`),
		HEADER_AZTEC + aztec.join(TOML_JOINER) + '"',
		{ encoding: "utf8", flag: "w" }
	);

	const noirNewRepos = noirSet.difference(noirLangInputs);
	const aztecNewRepos = aztecSet.difference(aztecProtocolInputs);

	const report = {
		noirLang: {
			previousReport: {
				size: noirLangInputs.size,
				repos: Array.from(noirLangInputs),
			},
			currentReport: {
				size: noirSet.size,
				repos: Array.from(noir),
			},
			newRepos: {
				size: noirNewRepos.size,
				repos: Array.from(noirNewRepos),
			},
		},
		aztecProtocol: {
			previousReport: {
				size: aztecProtocolInputs.size,
				repos: Array.from(aztecProtocolInputs),
			},
			currentReport: {
				size: aztecSet.size,
				repos: Array.from(aztec),
			},
			newRepos: {
				size: aztecNewRepos.size,
				repos: Array.from(aztecNewRepos),
			},
		},
	};

	writeFileSync(
		join(OUTPUTS_PATH, `report.json`),
		JSON.stringify(report, null, 2),
		{ encoding: "utf8", flag: "w" }
	);
}

process.argv[2] === "search" ? search() : generateReport();
