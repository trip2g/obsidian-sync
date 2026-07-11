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
| `--state-file <path>` | `-s` | Sync-state file path (default: `.sync-state.<host>.json` derived from `--api-url`) |
| `--prune` / `--mirror` | | Server-truth deletion: hide server notes not present locally (see below). Opt-in |
| `--force` | | Allow `--prune` even when the local tree looks empty |
| `--verbose` | `-v` | Verbose output |
| `--dry-run` | `-n` | Show what would be done without making changes |
| `--help` | `-h` | Show help |

## Prune / Mirror (`--prune`)

`--prune` (alias `--mirror`) makes a push behave like `rsync --delete`: after
enumerating local files it queries the server for every published note path
under the synced prefix and **hides any that are not present in the local
working tree**. Off by default; without it, sync behavior is unchanged.

### The failure mode it fixes

Normal one-way sync detects deletions by diffing local files against the local
sync-state (`.sync-state.<host>.json`). If a note exists on the **server** but
is absent from the local sync-state — because the state was reset, replaced, or
came from another machine — the tool has no record that it ever pushed that
note, so it classifies it as `remote_only` and, in push-only mode, silently
ignores it. The orphaned server note is never hidden, and a
restore→resync→delete→resync cycle does not fix it (no-op pushes are not
registered in state). `--prune` hides these orphaned notes regardless of
sync-state.

### Safety

- **Opt-in only.** Without `--prune`, behavior is 100% unchanged.
- **Prefix-scoped.** Only notes under the synced prefix/folder are considered;
  notes outside it are never touched.
- **Respects `--exclude`.** Excluded paths are handled by the existing exclude
  rules.
- **Loud preview.** Prints `PRUNE: N server notes not present locally will be
  hidden:` with the full list before hiding anything.
- **Honors `--dry-run`.** Lists what would be hidden, hides nothing.
- **Empty-tree guard.** If there are 0 local notes under the prefix but the
  server has notes (a partial or reset local copy), it refuses unless `--force`
  is also given, to avoid wiping the server.

```bash
# Preview what an orphaned-note cleanup would hide
node dist/trip2g-sync.mjs ./docs --prune --dry-run

# Actually hide the orphaned server notes
node dist/trip2g-sync.mjs ./docs --prune
```

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

The CLI maintains a sync-state file in the synced folder to track:
- Last synced hash for each file
- Timestamps for change detection

**Per-host files (default):** The filename is derived from the API endpoint host, so syncing the same folder to different servers never shares a cache. For example:

| API URL | State file |
|---------|-----------|
| `http://localhost:8081/_system/graphql` | `.sync-state.localhost_8081.json` |
| `https://trip2g.com/graphql` | `.sync-state.trip2g.com.json` |

**Custom path:** Use `--state-file` (`-s`) to override the path. A relative path is resolved inside the synced folder; an absolute path is used as-is.

```bash
# Use a custom state file
node dist/trip2g-sync.mjs --folder ./vault --state-file .sync-state.ci.json

# Absolute path
node dist/trip2g-sync.mjs --folder ./vault --state-file /tmp/my-sync-state.json
```

These files should be added to `.gitignore` if you don't want to share sync state across machines. A glob pattern covers all variants:

```
.sync-state*.json
```

## Development

```bash
# Run from source
npm run sync -- --folder ./vault --api-key xxx

# Build CLI
npm run build:cli

# Run tests
./scripts/test-sync-cli.sh --api-key YOUR_API_KEY --endpoint http://localhost:8081/graphql
```
