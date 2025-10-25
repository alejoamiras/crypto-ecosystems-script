/**
 * Type definitions for GitHub search operations
 */

export interface SearchConfig {
  githubToken?: string;
  githubTokens?: string[]; // Support multiple tokens for rotation
  useTokenRotation?: boolean; // Enable token rotation
  maxRetries?: number;
  searchTimeoutMs?: number;
  excludeRepos?: string[];
  excludeOrgs?: string[];
  excludeTopics?: string[];
}

export interface RepositorySearchResult {
  name: string;
  fullName: string;
  owner: string;
  description: string | null;
  stars: number;
  forks: number;
  language: string | null;
  topics?: string[];
  url: string;
  homepage?: string | null;
  createdAt: string;
  updatedAt: string;
  pushedAt?: string;
  isArchived: boolean;
  isPrivate: boolean;
  license?: string | null;
  defaultBranch: string;
}

export interface SearchOptions {
  perPage?: number;
  maxResults?: number;
  sort?: "stars" | "forks" | "updated" | "help-wanted-issues";
  order?: "asc" | "desc";
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
  used: number;
}

export interface ExclusionConfig {
  repos?: string[];
  orgs?: string[];
  topics?: string[];
}