# Documentation Index

This directory contains detailed documentation for the Crypto Ecosystems Discovery Scripts project.

## Available Documentation

### Script Guides

- **[Scripts Guide](./scripts-guide.md)** - Detailed documentation for the Noir and Aztec repository discovery script (`find-noir-aztec-repos.ts`). Includes classification logic, search strategies, and usage examples.

- **[Consolidation Guide](./consolidation-guide.md)** - Documentation for the migration file consolidation scripts. Explains how to merge multiple discovery runs, remove duplicates, and filter out already tracked repositories.

### Architecture & Design

- **Classification Logic** - The scripts use sophisticated classification rules to determine whether a repository belongs to Aztec Protocol or Noir Lang based on:
  - Nargo.toml file contents (`type = "contract"` for Aztec)
  - NPM package dependencies (@aztec/* vs @noir-lang/*)
  - Import patterns in code

### Configuration

All configuration options are documented in the main [README.md](../README.md#-configuration) and the [.env.example](../.env.example) file.

## Quick Links

- [Main README](../README.md) - Project overview and quick start guide
- [.env.example](../.env.example) - Environment configuration template
- [GitHub Repository](https://github.com/your-username/crypto-ecosystems-scripts)
- [Electric Capital Crypto Ecosystems](https://github.com/electric-capital/crypto-ecosystems)

## Documentation Structure

```
docs/
├── README.md              # This file - documentation index
├── scripts-guide.md       # Noir/Aztec discovery script documentation
└── consolidation-guide.md # Migration consolidation tools documentation
```

## Contributing to Documentation

When adding new documentation:
1. Place detailed script documentation in this `docs/` directory
2. Update this index file with links to new docs
3. Keep the main README.md focused on quick start and overview
4. Use descriptive filenames that indicate the content

## Need Help?

- Check the [main README](../README.md) for quick start instructions
- Review the specific guide for the script you're using
- Check the logs in `logs/` directory for debugging
- Open an issue on GitHub for bugs or feature requests