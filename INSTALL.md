# Installation Guide

## Prerequisites

- **Node.js** v18 or higher
- **Figma Desktop** (not Figma Web)
- **Claude Code** CLI

## Step 1: Install the Figma Plugin

Install **Code to Figma Bridge** from the [Figma Community](https://www.figma.com/community).

> The plugin is published separately and receives updates independently from the MCP server.

## Step 2: Clone and Build

```bash
git clone https://github.com/micheledalsanto/code-to-figma.git
cd code-to-figma
npm install
npm run build
```

## Step 3: Add MCP Server to Claude Code

Run this command, replacing the path with your actual location:

**macOS/Linux:**
```bash
claude mcp add code-to-figma -s user -- node "$HOME/code-to-figma/mcp-server/dist/index.js"
```

**Windows:**
```bash
claude mcp add code-to-figma -s user -- node "C:\Users\YourName\code-to-figma\mcp-server\dist\index.js"
```

### Flags Explained

- `-s user` saves to your user profile (`~/.claude.json`), making it available globally
- The path must be **absolute** (not relative)

### Verify

After running the command, you should see:
```
Added stdio MCP server code-to-figma with command: node /path/to/mcp-server/dist/index.js to user config
```

## Step 4: Install the `/ctf` Skill (Optional)

The `/ctf` skill provides an interactive agent for complex design tasks.

```bash
mkdir -p ~/.claude/skills/ctf
cp .claude/skills/ctf/SKILL.md ~/.claude/skills/ctf/
```

## Step 5: Restart Claude Code

**Required.** Close and reopen Claude Code completely.

> MCP servers are loaded at startup. Without a restart, Claude Code won't see the new server.

## Step 6: Verify Installation

1. **Check MCP server:**
   ```
   /mcp
   ```
   You should see `code-to-figma` in the list.

2. **Open Figma Desktop** and launch the "Code to Figma Bridge" plugin

3. **Click "Connect"** — status should change to "Connected"

4. **Test:**
   ```
   "Create a blue frame 400x300 in Figma"
   ```

## Troubleshooting

### MCP server not in `/mcp` list

1. Check the path is correct:
   ```bash
   ls ~/code-to-figma/mcp-server/dist/index.js
   ```

2. Check Claude configuration:
   ```bash
   cat ~/.claude.json
   ```
   Look for `code-to-figma` in `mcpServers`.

3. Try removing and re-adding:
   ```bash
   claude mcp remove code-to-figma
   claude mcp add code-to-figma -s user -- node "/correct/path/mcp-server/dist/index.js"
   ```

4. Restart Claude Code again.

### "Figma plugin is not connected"

- Make sure you're using **Figma Desktop** (not Web)
- Run the "Code to Figma Bridge" plugin
- Click "Connect"
- Verify port 3055 is not blocked

### Font errors

Automatic fallback: Inter → Roboto → Arial → System Font

### WebSocket timeout

1. Restart the Figma plugin
2. Restart Claude Code

### SVG images not showing

- SVGs are converted to PNG automatically
- If conversion fails, a placeholder is created
- Verify `sharp` is installed: `cd mcp-server && npm install`

### Browser window opens during website capture

- The project includes `.mcp.json` with `PLAYWRIGHT_HEADLESS=true`
- Restart Claude Code to reload the config
- To debug with visible browser, rename `.mcp.json`

## Manual Configuration

If `claude mcp add` doesn't work, edit `~/.claude.json` directly:

```json
{
  "mcpServers": {
    "code-to-figma": {
      "command": "node",
      "args": ["/full/path/to/code-to-figma/mcp-server/dist/index.js"]
    }
  }
}
```

## Architecture

```
Claude Code
    ↓ (MCP Protocol - stdio)
MCP Server (Node.js)
    ↓ (WebSocket - port 3055)
Figma Plugin
    ↓ (Figma API)
Figma Canvas
```

The MCP server starts automatically when Claude Code calls one of its tools.
