# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

### SDK Build (mmry/)
```bash
cd mmry
npm run build        # Build the SDK using tsup
npm run prepublishOnly # Run build before publishing
```

### Plugin Development
Plugins are built and run using Deno. Each plugin has its own deno.json:
```bash
deno run -A index.ts  # Run any plugin
```

## Architecture

This is a monorepo for mmry plugins with the following structure:

- `mmry/` - Core SDK package (@mmry-org/sdk) that provides the mmry API
- `packages/` - Individual plugin implementations

### Core SDK (mmry/)
The SDK provides a singleton state system and utilities for plugins:
- `mmry.state<T>()` - Persistent JSON state management with proxy access
- `mmry.add()` / `mmry.addMany()` - Add items to the memory system
- `mmry.items()` - Iterator over input items
- `mmry.input()` / `mmry.inputs()` - Plugin input handling
- `mmry.status()` - Emit status messages to plugin UI
- `mmry.time()` - Logging with timestamps

### Plugin Architecture
Plugins are TypeScript files that import the SDK and implement data collection/processing:
- Run in Deno environment with npm imports
- Use inputs for configuration (e.g., API tokens, files, text)
- Read input data via mmry.input() or mmry.inputFile()
- Process and emit data via mmry.add()
- Handle state persistence with mmry.state()

### Data Model
All plugins work with the `MmryItem` interface:
- `content` (required) - The textual content
- `externalId` - ID from external system
- `createdAt` / `updatedAt` - Timestamps
- `urls` / `images` - Associated media
- Custom properties allowed

### Plugin Examples
- `youtube-transcription/` - Fetches YouTube transcripts via API
- `twitter/` - Processes Twitter data exports
- `raindrop/` - Syncs bookmarks from Raindrop.io API
- `pocket/` - Placeholder for Pocket integration

## Creating New Plugins

### 1. Directory Structure
Create a new directory in `packages/` with these files:
```
packages/your-plugin/
├── deno.json          # Deno configuration
├── package.json       # Plugin metadata and configuration
└── index.ts          # Main plugin implementation
```

### 2. deno.json Configuration
Simple Deno config allowing npm modules:
```json
{
  "nodeModulesDir": "auto"
}
```

### 3. package.json Plugin Manifest
The `mmry` field defines plugin metadata:
```json
{
  "name": "mmry-your-plugin",
  "version": "0.0.1",
  "main": "index.ts",
  "author": "your-name",
  "license": "MIT",
  "mmry": {
    "name": "Your Plugin Name",
    "description": "Plugin description",
    "store": {
      "icon": "data:image/svg+xml;base64,..." // or "radix:IconName"
      "bg": "#COLOR",
      "tagline": "Short description"
    },
    "permissions": ["create-item", "update-item"],
    "type": "interval|trigger|enhance",
    "defaultCron": "0 0 * * *", // For interval plugins
    "filter": "collection-name", // For enhance plugins
    "allow-net": ["domain1.com", "domain2.com"], // Network permissions
    "inputs": [
      {
        "id": "YOUR_API_KEY", 
        "name": "API Key",
        "type": "string",
        "description": "Your API key for authentication"
      },
      {
        "id": "input-id",
        "name": "Input Name", 
        "type": "file|string",
        "description": "Help text"
      }
    ]
  }
}
```

### 4. Plugin Types
- **interval**: Runs periodically (API syncing) - can set `defaultCron` schedule
- **trigger**: Runs on-demand with user inputs (file processing)  
- **enhance**: Processes existing items to add more data

### 5. index.ts Implementation Patterns

**Basic Plugin Structure:**
```typescript
import { mmry } from "jsr:@mmry-org/sdk@0.0.4";

// Get configuration
const apiKey = mmry.input("YOUR_API_KEY")?.value;
const inputFile = mmry.inputFile("input-id");

// Process data and emit items
mmry.add({
  content: "processed content",
  externalId: "unique-id",
  createdAt: new Date(),
  // ... other properties
});
```

**State Management (for incremental sync):**
```typescript
const state = mmry.state({ lastSync: null });
// Use state.lastSync, update with state.write()
```

**Status Updates:**
```typescript
mmry.status("Processing items...");
```

**Enhance Plugin (process existing items):**
```typescript
for (const item of mmry.items()) {
  if (item?.collection !== "target-collection") continue;
  
  // Process and update item
  mmry.update({ ...item, newProperty: "value" });
}
```

### 6. Complete SDK API Reference

**Data Operations:**
- `mmry.add(item)` - Add new item to memory system
- `mmry.addMany(items[])` - Add multiple items at once
- `mmry.update(item)` - Update existing item (requires id)
- `mmry.items()` - Iterator over existing items (for enhance plugins)

**Configuration & Input:**
- `mmry.input(id)` - Get input by ID (works for all input types including secrets)
- `mmry.inputs()` - Get all inputs
- `mmry.inputFile(id)` - Get file input with path and stats

**State Management:**
- `mmry.state(defaultData)` - Persistent JSON state with proxy access
- `state.write()` - Save state changes to disk

**Utilities:**
- `mmry.status(message)` - Emit status to plugin UI
- `mmry.time(message?)` - Log with timestamp
- `mmry.info()` - Log info message

### 7. Common Patterns
- **API Sync**: Use `mmry.input()` for API keys and `mmry.state()` to track last sync timestamps
- **File Processing**: Use `mmry.inputFile()` for user uploads  
- **Batch Processing**: Use `mmry.addMany()` for multiple items
- **Item Enhancement**: Use `mmry.items()` + `mmry.update()` for processing existing data
- **Error Handling**: Exit with status updates on failures
- **Collections**: Add `collection` property to items for categorization

## Development Notes

- SDK uses dual Deno/Node.js support (deno.json + package.json)
- Plugins run exclusively in Deno with npm imports
- State management uses lowdb with JSON file persistence
- All plugins follow the pattern: input → process → mmry.add()
- Environment variables prefixed with MMRY_ are reserved for the system