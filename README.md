# Code to Figma

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-MCP-purple.svg)](https://claude.ai/code)
[![Figma](https://img.shields.io/badge/Figma-Plugin-F24E1E.svg)](https://www.figma.com/community)

**Bridge between Claude Code and Figma** — Create, modify, and delete design elements in Figma directly from Claude Code using natural language.

## How It Works

```
┌─────────────────┐      MCP Protocol       ┌─────────────────┐
│                 │         (stdio)         │                 │
│   Claude Code   │ ─────────────────────►  │   MCP Server    │
│                 │                         │    (Node.js)    │
└─────────────────┘                         └────────┬────────┘
                                                     │
                                                     │ WebSocket
                                                     │ (port 3055)
                                                     ▼
┌─────────────────┐                         ┌─────────────────┐
│                 │      Figma Plugin       │                 │
│  Figma Canvas   │ ◄───────────────────────│  Figma Plugin   │
│                 │          API            │                 │
└─────────────────┘                         └─────────────────┘
```

1. You ask Claude Code to create something in Figma
2. Claude Code calls the MCP server tools
3. The MCP server sends commands via WebSocket to the Figma plugin
4. The plugin creates/modifies elements on your Figma canvas

## Features

- **Create** frames, text, rectangles, and images
- **Modify** any element (position, size, colors, auto-layout, etc.)
- **Delete** nodes
- **Convert** frames to components
- **Replicate websites** with HTML/CSS extraction
- **Interactive agent** (`/ctf` skill) for guided workflows

> **Note:** To modify existing nodes, you need to provide the node ID. You can find it in the Figma URL when selecting an element, or it is returned automatically when creating elements. For reading node properties and listing nodes, use [Figma's official MCP server](https://github.com/nichochar/figma-mcp) which provides `get_design_context` and `get_metadata` tools.

## Requirements

- **Node.js** 18+
- **Figma Desktop** (not Figma Web)
- **Claude Code** CLI with your own Anthropic account
- **Playwright MCP** configured in Claude Code (for `/ctf` website replication)

> **Recommended:** For best results, use [Claude Max](https://claude.ai/pricing) plan. Complex design tasks like website replication benefit significantly from higher usage limits and extended context.

## Quick Start

### 1. Install the Figma Plugin

Get **Code to Figma Bridge** from the [Figma Community](https://www.figma.com/community).

### 2. Clone and Build the MCP Server

```bash
git clone https://github.com/micheledalsanto/code-to-figma.git
cd code-to-figma
npm install
npm run build
```

### 3. Add MCP Server to Claude Code

**macOS/Linux:**
```bash
claude mcp add code-to-figma -s user -- node ~/code-to-figma/mcp-server/dist/index.js
```

**Windows:**
```bash
claude mcp add code-to-figma -s user -- node "C:\path\to\code-to-figma\mcp-server\dist\index.js"
```

### 4. Restart Claude Code

Close and reopen Claude Code completely to load the MCP server.

### 5. Connect

1. Open Figma Desktop
2. Run the **Code to Figma Bridge** plugin
3. Click **Connect**
4. Verify with `/mcp` in Claude Code

### 6. Try It

```
"Create a blue frame 400x300 in Figma"
```

## Available Tools

### Creation

| Tool | Description |
|------|-------------|
| `create_figma_frame` | Create frames with auto-layout, fills, corner radius |
| `create_figma_text` | Create text with font, size, color, wrapping |
| `create_figma_rectangle` | Create rectangles with fills, strokes, corner radius |
| `create_figma_image` | Create images from URL (supports SVG, WebP conversion) |

### Utility

| Tool | Description |
|------|-------------|
| `check_connection` | Verify plugin is connected |

### Modification

> **Note:** All modification tools require a `nodeId`. You can get it from the Figma URL when selecting an element, or from the response of a create tool.

| Tool | Description |
|------|-------------|
| `update_figma_node` | Update position, size, fills, opacity, auto-layout |
| `delete_figma_node` | Delete a node by ID |
| `convert_to_component` | Convert a frame to a Figma component |
| `reorder_figma_node` | Change z-order of a node |

## Interactive Agent: `/ctf`

The `/ctf` skill provides a guided experience for complex design tasks.

```
/ctf
```

**Options:**

1. **Replicate a website**
   - Takes screenshot with Playwright
   - Extracts HTML structure, CSS styles, and images
   - Recreates the design in Figma with proper auto-layout
   - Per-group quality control against screenshot

2. **Create UI from scratch**
   - Describe what you want
   - Choose dimensions and style
   - Get the design created

3. **Modify existing elements**
   - Provide a node ID to target an element
   - Update properties or delete

### Website Replication Example

```
/ctf
→ Select "Replicate a website"
→ Enter URL: stripe.com
→ Choose viewport: Desktop 1440x900
→ Design is created in Figma
```

## Image Handling

The `create_figma_image` tool supports:

- **Any image URL** (Unsplash, CDNs, direct links)
- **SVG files** — Converted to PNG automatically
- **WebP images** — Converted to PNG (Figma doesn't support WebP)
- **SVG data URIs** — Inline SVGs from HTML extraction
- **Scale modes**: FILL, FIT, CROP, TILE

## CSS to Figma Mapping

| CSS Property | Figma Property |
|--------------|----------------|
| `borderRadius: "8px"` | `cornerRadius: 8` |
| `borderRadius: "9999px"` | `cornerRadius: 100` (pill) |
| `rgb(26, 115, 232)` | `{ r: 0.1, g: 0.45, b: 0.91 }` |
| `fontSize: "14px"` | `fontSize: 14` |
| `fontWeight: "500"` | `"medium"` |
| `fontWeight: "700"` | `"bold"` |
| `justifyContent: "center"` | `primaryAxisAlignItems: "CENTER"` |
| `alignItems: "center"` | `counterAxisAlignItems: "CENTER"` |

## Project Structure

```
code-to-figma/
├── mcp-server/
│   ├── src/
│   │   ├── index.ts              # Entry point
│   │   ├── server.ts             # MCP tool definitions
│   │   ├── websocket-bridge.ts   # WebSocket server (port 3055)
│   │   └── types.ts              # TypeScript types
│   └── dist/                     # Compiled output
│
├── .claude/
│   └── skills/
│       └── ctf/
│           └── SKILL.md          # /ctf skill definition
│
├── .mcp.json                     # Playwright headless config
├── INSTALL.md                    # Detailed installation guide
└── README.md
```

## Headless Browser Mode

The project includes `.mcp.json` that configures Playwright to run in **headless mode** (no visible browser windows). This provides a better UX when using `/ctf` to replicate websites.

To see the browser for debugging, rename or delete `.mcp.json`.

## Troubleshooting

### "Figma plugin is not connected"
- Open Figma Desktop (not Web)
- Run the "Code to Figma Bridge" plugin
- Click "Connect"

### MCP server not in `/mcp` list
- Restart Claude Code after adding the server
- Check the path is absolute and correct
- Verify with `cat ~/.claude.json`

### Images not loading
- Check URL is accessible
- SVGs and WebP are auto-converted
- A placeholder rectangle is created on failure

### Font not available
Automatic fallback: Inter → Roboto → Arial → System Font

## Development

```bash
# Build everything
npm run build

# Watch mode (MCP server)
cd mcp-server && npm run dev
```

## Links

- **Figma Plugin**: [Code to Figma Bridge on Figma Community](https://www.figma.com/community)
- **Issues**: [GitHub Issues](https://github.com/micheledalsanto/code-to-figma/issues)

## License

MIT
