# Trip2g Plugin for Obsidian

A plugin for [Obsidian](https://obsidian.md) that syncs your notes with [trip2g.com](https://trip2g.com) and publishes them as a website.

## About

Trip2g Plugin allows you to seamlessly sync your Obsidian vault with trip2g.com, a service designed for publishing your notes as a website. Share your knowledge, documentation, or personal wiki with the world directly from your Obsidian workspace.

## Features

- 📤 Sync notes from Obsidian to trip2g.com
- 🌐 Publish your notes as a website
- 🔄 Automatic synchronization
- 🔐 Secure API key authentication

## Installation

This plugin is not yet available in the official Obsidian Community Plugins directory. You can install it using [BRAT](https://tfthacker.com/BRAT) (Beta Reviewers Auto-update Tester).

### Install via BRAT

1. Install the BRAT plugin from Obsidian Community Plugins
2. Open BRAT settings in Obsidian
3. Click "Add Beta plugin"
4. Enter this repository URL: `https://github.com/trip2g/obsidian-sync`
5. Click "Add Plugin"
6. Enable "Trip2g Plugin" in Obsidian Settings → Community Plugins

## Configuration

After installation, you need to configure the plugin with your API key:

1. Open Obsidian Settings
2. Navigate to "Trip2g Plugin" in the plugin settings
3. Enter your API key from [trip2g.com](https://trip2g.com)
4. Save settings

### Getting your API key

1. Visit [trip2g.com](https://trip2g.com)
2. Log in to your account
3. Navigate to your account settings or API section
4. Copy your API key
5. Paste it into the plugin settings in Obsidian

## Usage

Once configured, the plugin will sync your notes with trip2g.com. You can:

- Use the ribbon icon to manually trigger synchronization
- Access sync commands from the command palette (Ctrl/Cmd + P)
- Monitor sync status through notifications

## Support

If you encounter any issues or have questions:

- Visit [trip2g.com](https://trip2g.com) for service-related questions
- Report plugin issues on the [GitHub repository](https://github.com/trip2g/obsidian-sync/issues)

## Development

### Building from source

```bash
# Install dependencies
npm install

# Development mode (watch for changes)
npm run dev

# Build for production
npm run build
```

### Manual installation for development

1. Clone this repository to your vault's plugins folder:
   ```bash
   cd /path/to/vault/.obsidian/plugins
   git clone https://github.com/trip2g/obsidian-sync trip2g
   ```
2. Install dependencies: `npm install`
3. Build the plugin: `npm run dev`
4. Reload Obsidian
5. Enable the plugin in Settings → Community Plugins

## Author

Created by Alexey Yurchenko

- Website: [trip2g.com](https://trip2g.com)
- Email: alexes.dev@gmail.com
