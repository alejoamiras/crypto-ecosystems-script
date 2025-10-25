# Aztec & Noir-Lang Crypto Ecosystems Helper

This repo makes it easy to generate the report for the Electric Capital "Crypto Ecosystems" repository for Noir-Lang and AztecProtocol.

## Prerequisites

You need:

- Node ([install instructions here](https://github.com/nvm-sh/nvm/blob/master/README.md#install--update-script))
- A Github [personal access token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)

## Explanation

The repo does the following:
    - Fetches the latest report for `noir-lang` and `aztec-protocol` and writes it to the `inputs` folder
    - Searches GitHub for repositories with `Nargo.toml` files for three types, avoiding duplicates and rate limits (more on that below):
      - `type = bin` - Matches all Noir programs
      - `type = lib` - Matches all Noir libraries
      - `type = contract` - Matches Aztec.nr contracts
    - Extracts the `urls` from the existing report, and crafts a new report with the specified header and format, deduplicating and sorting it as required by Electric Capital

### Rate Limiting

Searching GitHub for pieces of code is an intensive process, so there are some rate limits to get around. This script uses `octokit` to query for the remaining limit and waiting if necessary.

Another big issue is that code search returns only the first 1000 results. Some smartness could be done to make sure we still get all the results. For now, just excluding all the repos called `aztec-packages` plus both orgs is enough to ensure all the repos are accounted for, as we know that `aztec-packages` contains a ton of `Nargo.toml` files.

> [!TIP]
>If this is not enough, we could just use preliminary searches or other techniques. Some ideas:
>
> - Make a preliminary search for repos that have more than one `Nargo.toml` file, deduplicate, and search for every fork of that repo. Use them as partial result, then do the actual code search with `NOT <repo-name> in:name` to make the code search avoid these costly repos.
> - Identify organizations that have a significant number of repos, and make a preliminary search for them (to ensure all their new repos are accounted for). Then do the actual code search with `NOT org:<org-name>` so the search avoids these results. Depending on how many repos the organization has, this could save some results.
> - Encode the URI of the github call with a ton of `NOT repo:repo-already-included`, and cut it to the traditional URI limit (around 2000 chars). This could save around 40-50 results, which is not much.

## Usage

1. Rename `.env.example` to `.env` and add your github personal access token. This is required to search code on GitHub.

2. Install dependencies. We use [`bun`](https://bun.sh/) but any should work:

    ```bash
    bun i # `yarn`, `npm i`, etc
    ```

3. Run the search script:

    ```bash
    bun start:search
    ```

    This should create an `outputs` folder with a folder `searchResults` which will be used for the next step.

4. Run the report script:

    ```bash
    bun start
    ```

    This will fetch the existent file and create an updated one. It will also generate a `json` with some basic stats.
