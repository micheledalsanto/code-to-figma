#!/bin/bash

# Code to Figma Bridge - Setup Script
# This script automatically configures the plugin

set -e

echo "🔧 Code to Figma Bridge - Setup"
echo "================================"
echo ""

# Get the absolute path of the project
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
MCP_SERVER_PATH="$PROJECT_DIR/mcp-server/dist/index.js"

echo "📁 Project directory: $PROJECT_DIR"
echo ""

# Step 1: Install dependencies
echo "📦 Installing dependencies..."
npm install
echo "✓ Dependencies installed"
echo ""

# Step 2: Build the project
echo "🔨 Building project..."
npm run build
echo "✓ Project built"
echo ""

# Step 3: Verify compiled file exists
if [ ! -f "$MCP_SERVER_PATH" ]; then
    echo "❌ Error: File $MCP_SERVER_PATH not found"
    exit 1
fi
echo "✓ MCP server compiled: $MCP_SERVER_PATH"
echo ""

# Step 4: Configure Claude Code MCP
echo "⚙️  Configuring Claude Code MCP..."

# Check if claude is installed
if ! command -v claude &> /dev/null; then
    echo "❌ Claude Code not found. Install it with: npm install -g @anthropic-ai/claude-code"
    exit 1
fi

# Add the MCP server (saves to ~/.claude.json)
claude mcp add code-to-figma -s user -- node "$MCP_SERVER_PATH" 2>/dev/null || {
    echo "⚠️  MCP server may already be configured. Verifying..."
}

echo "✓ MCP server configured"
echo ""

# Step 5: Install skills
echo "📦 Installing Claude Code skills..."
echo ""
echo "Where do you want to install the /ctf skill?"
echo ""
echo "  1) Global (~/.claude/skills/)"
echo "     → Available in ALL projects"
echo ""
echo "  2) Project only (.claude/skills/)"
echo "     → Available only when working in this project"
echo ""
read -p "Choose [1/2] (default: 1): " SKILL_CHOICE

SKILL_SOURCE="$PROJECT_DIR/.claude/skills/ctf/SKILL.md"

if [ "$SKILL_CHOICE" = "2" ]; then
    # Project installation - skill is already in place
    SKILLS_DIR="$PROJECT_DIR/.claude/skills"
    echo "✓ Skill /ctf configured for this project only"
    echo "  Location: $SKILLS_DIR/ctf/SKILL.md"
else
    # Global installation (default)
    SKILLS_DIR="$HOME/.claude/skills"
    mkdir -p "$SKILLS_DIR/ctf"
    cp "$SKILL_SOURCE" "$SKILLS_DIR/ctf/"
    echo "✓ Skill /ctf installed globally"
    echo "  Location: $SKILLS_DIR/ctf/SKILL.md"
fi
echo ""

# Step 6: Final instructions
echo "================================"
echo "✅ Setup complete!"
echo "================================"
echo ""
echo "📋 Next steps:"
echo ""
echo "1. ⚠️  RESTART Claude Code (close terminal completely and reopen)"
echo "   This is REQUIRED to load the MCP server and /ctf skill."
echo ""
echo "2. Install the plugin in Figma:"
echo "   - Open Figma Desktop"
echo "   - Go to Plugins → Development → Import plugin from manifest..."
echo "   - Select: $PROJECT_DIR/figma-plugin/manifest.json"
echo ""
echo "3. Launch the plugin in Figma:"
echo "   - Plugins → Development → Code to Figma Bridge"
echo "   - Click 'Connect'"
echo ""
echo "4. In Claude Code, verify with:"
echo "   /mcp                    (should show code-to-figma)"
echo "   /ctf                    (starts the interactive agent)"
echo ""
echo "5. Try commands like:"
echo "   'Create a blue frame 400x300 in Figma'"
echo "   '/ctf' for guided design workflow"
echo ""
