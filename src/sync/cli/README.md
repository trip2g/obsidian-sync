# Trip2g Sync CLI

Command-line tool for syncing markdown files to Trip2g server without Obsidian.

## Use Cases

- **CI/CD pipelines**: Automated deployment of documentation
- **Multi-repo setups**: Multiple repositories pushing to different subfolders with different metadata
- **Migrations**: Bulk updates to frontmatter fields
- **Scripting**: Integration with other tools and workflows

## Installation

```bash
# From source (development)
cd obsidian-sync
npm install
npm run build:cli

# The CLI is built to dist/trip2g-sync.mjs
```

## Usage

```bash
# Basic sync
node dist/trip2g-sync.mjs --folder ./vault --api-key YOUR_API_KEY

# With custom endpoint
node dist/trip2g-sync.mjs --folder ./vault --api-key YOUR_API_KEY --api-url https://yoursite.com/graphql

# Two-way sync (pull changes from server)
node dist/trip2g-sync.mjs --folder ./vault --api-key YOUR_API_KEY --two-way

# Dry run (see what would happen without making changes)
node dist/trip2g-sync.mjs --folder ./vault --api-key YOUR_API_KEY --dry-run
```

### Environment Variables

Instead of command-line arguments, you can use environment variables:

```bash
export API_KEY=your_api_key
export ENDPOINT=https://yoursite.com/graphql

node dist/trip2g-sync.mjs --folder ./vault
```

## Options

| Option | Short | Description |
|--------|-------|-------------|
| `--folder <path>` | `-f` | Folder to sync (required) |
| `--api-url <url>` | `-u` | GraphQL endpoint (default: `$ENDPOINT` or `http://localhost:8081/graphql`) |
| `--api-key <key>` | `-k` | API key (default: `$API_KEY`) |
| `--two-way` | `-2` | Enable two-way sync (pull changes from server) |
| `--conflict-resolution <mode>` | `-c` | How to resolve conflicts: `local`, `remote`, `skip`, `fail` (default: `local`) |
| `--meta <key=value>` | `-m` | Add/override frontmatter field (can be repeated) |
| `--verbose` | `-v` | Verbose output |
| `--dry-run` | `-n` | Show what would be done without making changes |
| `--help` | `-h` | Show help |

## Meta Injection (--meta)

The `--meta` option allows injecting frontmatter fields into all synced files. This is particularly useful for multi-repository setups.

### Example: Multi-repo with different subgraphs

```bash
# Repository 1: Documentation
node dist/trip2g-sync.mjs --folder ./docs --meta subgraph=docs

# Repository 2: Blog
node dist/trip2g-sync.mjs --folder ./blog --meta subgraph=blog --meta author=Team

# Repository 3: Team wiki
node dist/trip2g-sync.mjs --folder ./wiki --meta subgraph=team-wiki --meta team=backend
```

### How it works

1. **Files without frontmatter** - a new frontmatter block is created:
   ```markdown
   ---
   subgraph: docs
   ---
   # Content
   ```

2. **Files with existing frontmatter** - fields are added or updated:
   ```markdown
   ---
   title: My Note
   subgraph: docs    ← added or overwritten
   ---
   ```

3. **Existing fields are overwritten** - if a file has `subgraph: old`, it becomes `subgraph: docs`.

**Note:** Meta injection only affects the content sent to the server. Local files are NOT modified.

## Conflict Resolution

| Mode | Behavior |
|------|----------|
| `local` | Keep local version, push to server (default) |
| `remote` | Keep remote version, overwrite local |
| `skip` | Skip conflicting files |
| `fail` | Exit with error on first conflict (useful for CI) |

## Examples

### CI/CD Pipeline

```bash
#!/bin/bash
set -e

# Sync documentation on every push
node dist/trip2g-sync.mjs \
  --folder ./docs \
  --api-key "$TRIP2G_API_KEY" \
  --api-url "https://yoursite.com/graphql" \
  --meta subgraph=docs \
  --conflict-resolution fail  # Fail on conflicts in CI
```

### Local Development

```bash
# Watch for changes and sync (using external watcher)
fswatch -o ./vault | xargs -n1 -I{} node dist/trip2g-sync.mjs --folder ./vault --api-key xxx
```

## Sync State

The CLI maintains a `.sync-state.json` file in the synced folder to track:
- Last synced hash for each file
- Timestamps for change detection

This file should be added to `.gitignore` if you don't want to share sync state across machines.

## Development

```bash
# Run from source
npm run sync -- --folder ./vault --api-key xxx

# Build CLI
npm run build:cli

# Run tests
./scripts/test-sync-cli.sh --api-key YOUR_API_KEY --endpoint http://localhost:8081/graphql
```
