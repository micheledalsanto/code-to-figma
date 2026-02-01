import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import sharp from 'sharp';
import { bridge } from './websocket-bridge.js';
import { visionAnalyzer } from './vision-analyzer.js';
import {
  CreateFrameInput,
  CreateTextInput,
  CreateRectangleInput,
  CreateImageInput,
  AnalyzeScreenshotInput,
  RGB,
} from './types.js';

// ============================================
// Zod Schemas for Tool Inputs
// ============================================

const RGBSchema = z.object({
  r: z.number().min(0).max(1),
  g: z.number().min(0).max(1),
  b: z.number().min(0).max(1),
});

const PaddingSchema = z.object({
  top: z.number(),
  right: z.number(),
  bottom: z.number(),
  left: z.number(),
});

const FillSchema = z.object({
  type: z.literal('SOLID'),
  color: RGBSchema,
});

const CreateFrameSchema = z.object({
  name: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  fills: z.array(FillSchema).optional(),
  cornerRadius: z.number().optional(),
  topLeftRadius: z.number().optional(),
  topRightRadius: z.number().optional(),
  bottomLeftRadius: z.number().optional(),
  bottomRightRadius: z.number().optional(),
  layoutMode: z.enum(['HORIZONTAL', 'VERTICAL', 'NONE']).optional(),
  padding: PaddingSchema.optional(),
  itemSpacing: z.number().optional(),
  primaryAxisAlignItems: z.enum(['MIN', 'CENTER', 'MAX', 'SPACE_BETWEEN']).optional(),
  counterAxisAlignItems: z.enum(['MIN', 'CENTER', 'MAX']).optional(),
  layoutSizingHorizontal: z.enum(['FIXED', 'HUG', 'FILL']).optional(),
  layoutSizingVertical: z.enum(['FIXED', 'HUG', 'FILL']).optional(),
  strokes: z.array(FillSchema).optional(),
  strokeWeight: z.number().optional(),
  parentId: z.string().optional(),
});

const CreateTextSchema = z.object({
  content: z.string(),
  x: z.number(),
  y: z.number(),
  fontSize: z.number().optional().default(16),
  fontFamily: z.string().optional().default('Inter'),
  fontWeight: z.enum(['thin', 'extralight', 'light', 'normal', 'medium', 'semibold', 'bold', 'extrabold', 'black']).optional().default('normal'),
  color: RGBSchema.optional(),
  width: z.number().optional(),
  textAlignHorizontal: z.enum(['LEFT', 'CENTER', 'RIGHT', 'JUSTIFIED']).optional(),
  textAlignVertical: z.enum(['TOP', 'CENTER', 'BOTTOM']).optional(),
  parentId: z.string().optional(),
});

const CreateRectangleSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  fills: z.array(FillSchema).optional(),
  cornerRadius: z.number().optional(),
  strokes: z.array(FillSchema).optional(),
  strokeWeight: z.number().optional(),
  name: z.string().optional(),
  parentId: z.string().optional(),
});

const CreateImageSchema = z.object({
  url: z.string().url(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  name: z.string().optional(),
  cornerRadius: z.number().optional(),
  scaleMode: z.enum(['FILL', 'FIT', 'CROP', 'TILE']).optional().default('FILL'),
  parentId: z.string().optional(),
  usePlaceholderOnError: z.boolean().optional().default(true),
  timeoutMs: z.number().optional().default(30000),
});

const AnalyzeScreenshotSchema = z.object({
  screenshot: z.string().describe('File path or base64 encoded image'),
  options: z.object({
    extractColors: z.boolean().optional().default(true),
    extractTypography: z.boolean().optional().default(true),
    extractSpacing: z.boolean().optional().default(true),
    detailLevel: z.enum(['basic', 'detailed']).optional().default('detailed'),
  }).optional(),
});

// Bidirectional schemas
const GetNodeSchema = z.object({
  nodeId: z.string(),
  includeChildren: z.boolean().optional().default(false),
});

const BlendModeSchema = z.enum([
  'PASS_THROUGH', 'NORMAL', 'DARKEN', 'MULTIPLY', 'LINEAR_BURN', 'COLOR_BURN',
  'LIGHTEN', 'SCREEN', 'LINEAR_DODGE', 'COLOR_DODGE', 'OVERLAY', 'SOFT_LIGHT',
  'HARD_LIGHT', 'DIFFERENCE', 'EXCLUSION', 'HUE', 'SATURATION', 'COLOR', 'LUMINOSITY'
]);

const UpdateNodeSchema = z.object({
  nodeId: z.string(),
  properties: z.object({
    name: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    fills: z.array(FillSchema).optional(),
    cornerRadius: z.number().optional(),
    topLeftRadius: z.number().optional(),
    topRightRadius: z.number().optional(),
    bottomLeftRadius: z.number().optional(),
    bottomRightRadius: z.number().optional(),
    opacity: z.number().min(0).max(1).optional(),
    blendMode: BlendModeSchema.optional(),
    visible: z.boolean().optional(),
    locked: z.boolean().optional(),
    strokes: z.array(FillSchema).optional(),
    strokeWeight: z.number().optional(),
    layoutMode: z.enum(['HORIZONTAL', 'VERTICAL', 'NONE']).optional(),
    padding: PaddingSchema.optional(),
    itemSpacing: z.number().optional(),
    primaryAxisAlignItems: z.enum(['MIN', 'CENTER', 'MAX', 'SPACE_BETWEEN']).optional(),
    counterAxisAlignItems: z.enum(['MIN', 'CENTER', 'MAX']).optional(),
    layoutSizingHorizontal: z.enum(['FIXED', 'HUG', 'FILL']).optional(),
    layoutSizingVertical: z.enum(['FIXED', 'HUG', 'FILL']).optional(),
  }),
});

const DeleteNodeSchema = z.object({
  nodeId: z.string(),
});

const ListNodesSchema = z.object({
  parentId: z.string().optional(),
  depth: z.number().min(1).max(10).optional().default(1),
  types: z.array(z.string()).optional(),
});

const ConvertToComponentSchema = z.object({
  nodeId: z.string(),
  name: z.string().optional(),
});

const ReorderNodeSchema = z.object({
  nodeId: z.string(),
  index: z.number().min(0),
});

// ============================================
// MCP Server Setup
// ============================================

export function createServer(): Server {
  const server = new Server(
    {
      name: 'code-to-figma',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'check_connection',
        description: 'Check if the Figma plugin is connected to the MCP server',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'analyze_screenshot',
        description:
          'Analyze a UI screenshot using Claude Vision and extract component structure, colors, and typography. Requires ANTHROPIC_API_KEY environment variable.',
        inputSchema: {
          type: 'object',
          properties: {
            screenshot: {
              type: 'string',
              description: 'File path to the screenshot or base64 encoded image data',
            },
            options: {
              type: 'object',
              properties: {
                extractColors: { type: 'boolean', default: true },
                extractTypography: { type: 'boolean', default: true },
                extractSpacing: { type: 'boolean', default: true },
                detailLevel: { type: 'string', enum: ['basic', 'detailed'], default: 'detailed' },
              },
            },
          },
          required: ['screenshot'],
        },
      },
      {
        name: 'create_figma_frame',
        description:
          'Create a frame element in Figma with optional auto-layout, fills, and corner radius',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the frame' },
            x: { type: 'number', description: 'X position on canvas' },
            y: { type: 'number', description: 'Y position on canvas' },
            width: { type: 'number', description: 'Frame width' },
            height: { type: 'number', description: 'Frame height' },
            fills: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['SOLID'] },
                  color: {
                    type: 'object',
                    properties: {
                      r: { type: 'number', minimum: 0, maximum: 1 },
                      g: { type: 'number', minimum: 0, maximum: 1 },
                      b: { type: 'number', minimum: 0, maximum: 1 },
                    },
                    required: ['r', 'g', 'b'],
                  },
                },
              },
              description: 'Fill colors (RGB values 0-1)',
            },
            cornerRadius: { type: 'number', description: 'Corner radius in pixels (uniform)' },
            topLeftRadius: { type: 'number', description: 'Top-left corner radius' },
            topRightRadius: { type: 'number', description: 'Top-right corner radius' },
            bottomLeftRadius: { type: 'number', description: 'Bottom-left corner radius' },
            bottomRightRadius: { type: 'number', description: 'Bottom-right corner radius' },
            layoutMode: {
              type: 'string',
              enum: ['HORIZONTAL', 'VERTICAL', 'NONE'],
              description: 'Auto-layout direction',
            },
            padding: {
              type: 'object',
              properties: {
                top: { type: 'number' },
                right: { type: 'number' },
                bottom: { type: 'number' },
                left: { type: 'number' },
              },
              description: 'Padding for auto-layout',
            },
            itemSpacing: { type: 'number', description: 'Gap between children in auto-layout' },
            primaryAxisAlignItems: {
              type: 'string',
              enum: ['MIN', 'CENTER', 'MAX', 'SPACE_BETWEEN'],
              description: 'Alignment along the primary axis (requires layoutMode)',
            },
            counterAxisAlignItems: {
              type: 'string',
              enum: ['MIN', 'CENTER', 'MAX'],
              description: 'Alignment along the counter axis (requires layoutMode)',
            },
            layoutSizingHorizontal: {
              type: 'string',
              enum: ['FIXED', 'HUG', 'FILL'],
              description: 'How the frame sizes horizontally: FIXED (explicit size), HUG (fit content), FILL (expand to fill parent)',
            },
            layoutSizingVertical: {
              type: 'string',
              enum: ['FIXED', 'HUG', 'FILL'],
              description: 'How the frame sizes vertically: FIXED (explicit size), HUG (fit content), FILL (expand to fill parent)',
            },
            strokes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['SOLID'] },
                  color: {
                    type: 'object',
                    properties: {
                      r: { type: 'number', minimum: 0, maximum: 1 },
                      g: { type: 'number', minimum: 0, maximum: 1 },
                      b: { type: 'number', minimum: 0, maximum: 1 },
                    },
                  },
                },
              },
              description: 'Stroke colors (RGB 0-1)',
            },
            strokeWeight: { type: 'number', description: 'Stroke weight in pixels' },
            parentId: { type: 'string', description: 'ID of parent node to append to' },
          },
          required: ['name', 'x', 'y', 'width', 'height'],
        },
      },
      {
        name: 'create_figma_text',
        description: 'Create a text element in Figma with typography settings',
        inputSchema: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'Text content' },
            x: { type: 'number', description: 'X position' },
            y: { type: 'number', description: 'Y position' },
            fontSize: { type: 'number', description: 'Font size in pixels', default: 16 },
            fontFamily: { type: 'string', description: 'Font family name', default: 'Inter' },
            fontWeight: {
              type: 'string',
              enum: ['thin', 'extralight', 'light', 'normal', 'medium', 'semibold', 'bold', 'extrabold', 'black'],
              default: 'normal',
            },
            color: {
              type: 'object',
              properties: {
                r: { type: 'number', minimum: 0, maximum: 1 },
                g: { type: 'number', minimum: 0, maximum: 1 },
                b: { type: 'number', minimum: 0, maximum: 1 },
              },
              description: 'Text color (RGB 0-1)',
            },
            width: { type: 'number', description: 'Text box width for wrapping' },
            textAlignHorizontal: {
              type: 'string',
              enum: ['LEFT', 'CENTER', 'RIGHT', 'JUSTIFIED'],
              description: 'Horizontal text alignment',
            },
            textAlignVertical: {
              type: 'string',
              enum: ['TOP', 'CENTER', 'BOTTOM'],
              description: 'Vertical text alignment',
            },
            parentId: { type: 'string', description: 'ID of parent node' },
          },
          required: ['content', 'x', 'y'],
        },
      },
      {
        name: 'create_figma_rectangle',
        description:
          'Create a rectangle element in Figma with fills, strokes, and corner radius',
        inputSchema: {
          type: 'object',
          properties: {
            x: { type: 'number', description: 'X position' },
            y: { type: 'number', description: 'Y position' },
            width: { type: 'number', description: 'Width' },
            height: { type: 'number', description: 'Height' },
            fills: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['SOLID'] },
                  color: {
                    type: 'object',
                    properties: {
                      r: { type: 'number' },
                      g: { type: 'number' },
                      b: { type: 'number' },
                    },
                  },
                },
              },
            },
            cornerRadius: { type: 'number' },
            strokes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['SOLID'] },
                  color: {
                    type: 'object',
                    properties: {
                      r: { type: 'number' },
                      g: { type: 'number' },
                      b: { type: 'number' },
                    },
                  },
                },
              },
            },
            strokeWeight: { type: 'number' },
            name: { type: 'string' },
            parentId: { type: 'string' },
          },
          required: ['x', 'y', 'width', 'height'],
        },
      },
      {
        name: 'create_figma_image',
        description:
          'Create an image element in Figma from a URL (supports Unsplash, direct image URLs, etc.). Handles redirects automatically and can create a placeholder if the image fails to load.',
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL of the image to fetch and display' },
            x: { type: 'number', description: 'X position' },
            y: { type: 'number', description: 'Y position' },
            width: { type: 'number', description: 'Width of the image container' },
            height: { type: 'number', description: 'Height of the image container' },
            name: { type: 'string', description: 'Name for the image layer' },
            cornerRadius: { type: 'number', description: 'Corner radius in pixels' },
            scaleMode: {
              type: 'string',
              enum: ['FILL', 'FIT', 'CROP', 'TILE'],
              default: 'FILL',
              description: 'How the image should scale within the container',
            },
            parentId: { type: 'string', description: 'ID of parent node' },
            usePlaceholderOnError: {
              type: 'boolean',
              default: true,
              description: 'Create a placeholder rectangle if image fetch fails',
            },
            timeoutMs: {
              type: 'number',
              default: 30000,
              description: 'Timeout in milliseconds for fetching the image',
            },
          },
          required: ['url', 'x', 'y', 'width', 'height'],
        },
      },
      // ============================================
      // Bidirectional Tools
      // ============================================
      {
        name: 'get_figma_node',
        description: 'Get information about an existing Figma node by its ID. Returns type, position, size, fills, and other properties.',
        inputSchema: {
          type: 'object',
          properties: {
            nodeId: { type: 'string', description: 'The ID of the node to retrieve' },
            includeChildren: {
              type: 'boolean',
              default: false,
              description: 'Include child nodes in the response'
            },
          },
          required: ['nodeId'],
        },
      },
      {
        name: 'update_figma_node',
        description: 'Update properties of an existing Figma node. Can modify position, size, fills, corner radius, opacity, visibility, and auto-layout settings.',
        inputSchema: {
          type: 'object',
          properties: {
            nodeId: { type: 'string', description: 'The ID of the node to update' },
            properties: {
              type: 'object',
              description: 'Properties to update',
              properties: {
                name: { type: 'string', description: 'New name for the node' },
                x: { type: 'number', description: 'New X position' },
                y: { type: 'number', description: 'New Y position' },
                width: { type: 'number', description: 'New width' },
                height: { type: 'number', description: 'New height' },
                fills: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      type: { type: 'string', enum: ['SOLID'] },
                      color: {
                        type: 'object',
                        properties: {
                          r: { type: 'number', minimum: 0, maximum: 1 },
                          g: { type: 'number', minimum: 0, maximum: 1 },
                          b: { type: 'number', minimum: 0, maximum: 1 },
                        },
                      },
                    },
                  },
                },
                cornerRadius: { type: 'number', description: 'Uniform corner radius' },
                topLeftRadius: { type: 'number', description: 'Top-left corner radius' },
                topRightRadius: { type: 'number', description: 'Top-right corner radius' },
                bottomLeftRadius: { type: 'number', description: 'Bottom-left corner radius' },
                bottomRightRadius: { type: 'number', description: 'Bottom-right corner radius' },
                opacity: { type: 'number', minimum: 0, maximum: 1 },
                blendMode: {
                  type: 'string',
                  enum: ['PASS_THROUGH', 'NORMAL', 'DARKEN', 'MULTIPLY', 'LINEAR_BURN', 'COLOR_BURN',
                         'LIGHTEN', 'SCREEN', 'LINEAR_DODGE', 'COLOR_DODGE', 'OVERLAY', 'SOFT_LIGHT',
                         'HARD_LIGHT', 'DIFFERENCE', 'EXCLUSION', 'HUE', 'SATURATION', 'COLOR', 'LUMINOSITY'],
                  description: 'Blend mode for the layer',
                },
                visible: { type: 'boolean' },
                locked: { type: 'boolean' },
                strokes: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      type: { type: 'string', enum: ['SOLID'] },
                      color: {
                        type: 'object',
                        properties: {
                          r: { type: 'number', minimum: 0, maximum: 1 },
                          g: { type: 'number', minimum: 0, maximum: 1 },
                          b: { type: 'number', minimum: 0, maximum: 1 },
                        },
                      },
                    },
                  },
                },
                strokeWeight: { type: 'number' },
                layoutMode: { type: 'string', enum: ['HORIZONTAL', 'VERTICAL', 'NONE'] },
                padding: {
                  type: 'object',
                  properties: {
                    top: { type: 'number' },
                    right: { type: 'number' },
                    bottom: { type: 'number' },
                    left: { type: 'number' },
                  },
                },
                itemSpacing: { type: 'number' },
                primaryAxisAlignItems: {
                  type: 'string',
                  enum: ['MIN', 'CENTER', 'MAX', 'SPACE_BETWEEN'],
                  description: 'Alignment along the primary axis',
                },
                counterAxisAlignItems: {
                  type: 'string',
                  enum: ['MIN', 'CENTER', 'MAX'],
                  description: 'Alignment along the counter axis',
                },
                layoutSizingHorizontal: {
                  type: 'string',
                  enum: ['FIXED', 'HUG', 'FILL'],
                  description: 'How the frame sizes horizontally',
                },
                layoutSizingVertical: {
                  type: 'string',
                  enum: ['FIXED', 'HUG', 'FILL'],
                  description: 'How the frame sizes vertically',
                },
              },
            },
          },
          required: ['nodeId', 'properties'],
        },
      },
      {
        name: 'delete_figma_node',
        description: 'Delete a Figma node by its ID',
        inputSchema: {
          type: 'object',
          properties: {
            nodeId: { type: 'string', description: 'The ID of the node to delete' },
          },
          required: ['nodeId'],
        },
      },
      {
        name: 'list_figma_nodes',
        description: 'List nodes in the current Figma page or children of a specific node. Useful for discovering node IDs.',
        inputSchema: {
          type: 'object',
          properties: {
            parentId: {
              type: 'string',
              description: 'ID of parent node to list children of. If not provided, lists from current page.'
            },
            depth: {
              type: 'number',
              default: 1,
              minimum: 1,
              maximum: 10,
              description: 'How deep to traverse the node tree'
            },
            types: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by node types (e.g., ["FRAME", "TEXT", "RECTANGLE"])',
            },
          },
        },
      },
      {
        name: 'convert_to_component',
        description: 'Convert an existing frame to a Figma component',
        inputSchema: {
          type: 'object',
          properties: {
            nodeId: { type: 'string', description: 'The ID of the frame to convert' },
            name: { type: 'string', description: 'Optional new name for the component' },
          },
          required: ['nodeId'],
        },
      },
      {
        name: 'get_selection',
        description: 'Get the currently selected nodes in Figma',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'reorder_figma_node',
        description: 'Reorder a node within its parent. Index 0 = bottom (rendered first/behind), higher index = on top (rendered last/in front). Useful for controlling layer stacking order.',
        inputSchema: {
          type: 'object',
          properties: {
            nodeId: { type: 'string', description: 'The ID of the node to reorder' },
            index: {
              type: 'number',
              minimum: 0,
              description: 'Target index within parent. 0 = bottom-most, higher = more on top'
            },
          },
          required: ['nodeId', 'index'],
        },
      },
    ],
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'check_connection': {
          const connected = bridge.isConnected();
          return {
            content: [
              {
                type: 'text',
                text: connected
                  ? 'Figma plugin is connected and ready.'
                  : 'Figma plugin is NOT connected. Please open the "Code to Figma Bridge" plugin in Figma.',
              },
            ],
          };
        }

        case 'analyze_screenshot': {
          const input = AnalyzeScreenshotSchema.parse(args);

          if (!visionAnalyzer.isAvailable()) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Vision analyzer not available. ANTHROPIC_API_KEY environment variable is not set. You can analyze the screenshot directly using Claude Code vision capabilities instead.',
                },
              ],
            };
          }

          const result = await visionAnalyzer.analyzeScreenshot(
            input.screenshot,
            input.options
          );

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case 'create_figma_frame': {
          const input = CreateFrameSchema.parse(args);

          if (!bridge.isConnected()) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Error: Figma plugin is not connected. Please open the plugin in Figma first.',
                },
              ],
              isError: true,
            };
          }

          const response = await bridge.sendCommand('CREATE_FRAME', input);

          if (response.success) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Frame "${input.name}" created successfully. Node ID: ${response.data}`,
                },
              ],
            };
          } else {
            return {
              content: [{ type: 'text', text: `Error creating frame: ${response.error}` }],
              isError: true,
            };
          }
        }

        case 'create_figma_text': {
          const input = CreateTextSchema.parse(args);

          if (!bridge.isConnected()) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Error: Figma plugin is not connected.',
                },
              ],
              isError: true,
            };
          }

          const response = await bridge.sendCommand('CREATE_TEXT', input);

          if (response.success) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Text created successfully. Node ID: ${response.data}`,
                },
              ],
            };
          } else {
            return {
              content: [{ type: 'text', text: `Error creating text: ${response.error}` }],
              isError: true,
            };
          }
        }

        case 'create_figma_rectangle': {
          const input = CreateRectangleSchema.parse(args);

          if (!bridge.isConnected()) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Error: Figma plugin is not connected.',
                },
              ],
              isError: true,
            };
          }

          const response = await bridge.sendCommand('CREATE_RECTANGLE', input);

          if (response.success) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Rectangle created successfully. Node ID: ${response.data}`,
                },
              ],
            };
          } else {
            return {
              content: [{ type: 'text', text: `Error creating rectangle: ${response.error}` }],
              isError: true,
            };
          }
        }

        case 'create_figma_image': {
          const input = CreateImageSchema.parse(args);

          if (!bridge.isConnected()) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Error: Figma plugin is not connected.',
                },
              ],
              isError: true,
            };
          }

          // Helper to create placeholder on error
          const createPlaceholder = async (errorMessage: string) => {
            if (!input.usePlaceholderOnError) {
              return {
                content: [{ type: 'text', text: errorMessage }],
                isError: true,
              };
            }

            // Create a placeholder rectangle instead
            const placeholderPayload = {
              x: input.x,
              y: input.y,
              width: input.width,
              height: input.height,
              name: input.name ? `${input.name} (placeholder)` : 'Image Placeholder',
              cornerRadius: input.cornerRadius,
              fills: [{ type: 'SOLID' as const, color: { r: 0.9, g: 0.9, b: 0.9 } }],
              strokes: [{ type: 'SOLID' as const, color: { r: 0.8, g: 0.8, b: 0.8 } }],
              strokeWeight: 1,
              parentId: input.parentId,
            };

            const placeholderResponse = await bridge.sendCommand('CREATE_RECTANGLE', placeholderPayload);

            if (placeholderResponse.success) {
              return {
                content: [
                  {
                    type: 'text',
                    text: `Image fetch failed (${errorMessage}). Created placeholder instead. Node ID: ${placeholderResponse.data}`,
                  },
                ],
              };
            } else {
              return {
                content: [{ type: 'text', text: `${errorMessage}. Failed to create placeholder: ${placeholderResponse.error}` }],
                isError: true,
              };
            }
          };

          // Check if URL is a data URI (e.g., data:image/svg+xml,... or data:image/png;base64,...)
          const isDataUri = input.url.startsWith('data:');

          let base64: string;
          let contentType: string;

          if (isDataUri) {
            // Parse data URI: data:[<mediatype>][;base64],<data>
            const dataUriMatch = input.url.match(/^data:([^;,]+)?(;base64)?,(.*)$/);

            if (!dataUriMatch) {
              return await createPlaceholder('Invalid data URI format');
            }

            contentType = dataUriMatch[1] || 'image/png';
            const isBase64Encoded = !!dataUriMatch[2];
            const data = dataUriMatch[3];

            if (!contentType.startsWith('image/')) {
              return await createPlaceholder(`Invalid content type in data URI: ${contentType}`);
            }

            let imageBuffer: Buffer;

            if (isBase64Encoded) {
              // Already base64
              imageBuffer = Buffer.from(data, 'base64');
            } else {
              // URL encoded (common for SVG), decode first
              try {
                const decoded = decodeURIComponent(data);
                imageBuffer = Buffer.from(decoded);
              } catch (e) {
                return await createPlaceholder('Failed to decode data URI');
              }
            }

            // If SVG, convert to PNG using sharp (Figma doesn't support SVG as image)
            if (contentType === 'image/svg+xml') {
              try {
                const pngBuffer = await sharp(imageBuffer)
                  .resize(input.width * 2, input.height * 2) // 2x for retina
                  .png()
                  .toBuffer();
                base64 = pngBuffer.toString('base64');
                contentType = 'image/png';
              } catch (e) {
                return await createPlaceholder(`Failed to convert SVG to PNG: ${e instanceof Error ? e.message : String(e)}`);
              }
            }
            // If WebP, convert to PNG (Figma doesn't support WebP)
            else if (contentType === 'image/webp') {
              try {
                const pngBuffer = await sharp(imageBuffer)
                  .png()
                  .toBuffer();
                base64 = pngBuffer.toString('base64');
                contentType = 'image/png';
              } catch (e) {
                return await createPlaceholder(`Failed to convert WebP to PNG: ${e instanceof Error ? e.message : String(e)}`);
              }
            } else {
              base64 = imageBuffer.toString('base64');
            }
          } else {
            // Fetch the image from URL with timeout and redirect handling
            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), input.timeoutMs || 30000);

              const imageResponse = await fetch(input.url, {
                signal: controller.signal,
                redirect: 'follow', // Explicitly follow redirects (Unsplash uses them)
                headers: {
                  'User-Agent': 'Figma-Plugin/1.0', // Some CDNs require User-Agent
                },
              });

              clearTimeout(timeoutId);

              if (!imageResponse.ok) {
                return await createPlaceholder(`HTTP ${imageResponse.status}: ${imageResponse.statusText}`);
              }

              // Verify content-type is an image
              contentType = imageResponse.headers.get('content-type') || '';
              if (!contentType.startsWith('image/')) {
                return await createPlaceholder(`Invalid content type: ${contentType}`);
              }

              const arrayBuffer = await imageResponse.arrayBuffer();

              // Check if we got actual data
              if (arrayBuffer.byteLength === 0) {
                return await createPlaceholder('Empty image response');
              }

              let imageBuffer: Buffer = Buffer.from(arrayBuffer);

              // Convert SVG to PNG (Figma doesn't support SVG as image fill)
              if (contentType === 'image/svg+xml' || input.url.toLowerCase().endsWith('.svg')) {
                try {
                  imageBuffer = await sharp(imageBuffer)
                    .resize(input.width * 2, input.height * 2) // 2x for retina
                    .png()
                    .toBuffer() as Buffer;
                  contentType = 'image/png';
                } catch (e) {
                  return await createPlaceholder(`Failed to convert SVG to PNG: ${e instanceof Error ? e.message : String(e)}`);
                }
              }
              // Convert WebP to PNG (Figma doesn't support WebP)
              else if (contentType === 'image/webp' || input.url.toLowerCase().endsWith('.webp')) {
                try {
                  imageBuffer = await sharp(imageBuffer)
                    .png()
                    .toBuffer() as Buffer;
                  contentType = 'image/png';
                } catch (e) {
                  return await createPlaceholder(`Failed to convert WebP to PNG: ${e instanceof Error ? e.message : String(e)}`);
                }
              }

              base64 = imageBuffer.toString('base64');
            } catch (fetchError) {
              const message = fetchError instanceof Error ? fetchError.message : String(fetchError);
              const isTimeout = fetchError instanceof Error && fetchError.name === 'AbortError';
              const errorText = isTimeout ? 'Request timed out' : message;
              return await createPlaceholder(errorText);
            }
          }

          // Send to plugin with image data
          const payload = {
            ...input,
            imageData: base64,
            mimeType: contentType,
          };

          const response = await bridge.sendCommand('CREATE_IMAGE', payload);

          if (response.success) {
            const sourceInfo = isDataUri ? ' (from data URI)' : '';
            return {
              content: [
                {
                  type: 'text',
                  text: `Image created successfully${sourceInfo}. Node ID: ${response.data}`,
                },
              ],
            };
          } else {
            return {
              content: [{ type: 'text', text: `Error creating image: ${response.error}` }],
              isError: true,
            };
          }
        }

        // ============================================
        // Bidirectional Tool Handlers
        // ============================================

        case 'get_figma_node': {
          const input = GetNodeSchema.parse(args);

          if (!bridge.isConnected()) {
            return {
              content: [{ type: 'text', text: 'Error: Figma plugin is not connected.' }],
              isError: true,
            };
          }

          const response = await bridge.sendCommand('GET_NODE', input);

          if (response.success) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(response.data, null, 2),
                },
              ],
            };
          } else {
            return {
              content: [{ type: 'text', text: `Error getting node: ${response.error}` }],
              isError: true,
            };
          }
        }

        case 'update_figma_node': {
          const input = UpdateNodeSchema.parse(args);

          if (!bridge.isConnected()) {
            return {
              content: [{ type: 'text', text: 'Error: Figma plugin is not connected.' }],
              isError: true,
            };
          }

          const response = await bridge.sendCommand('UPDATE_NODE', input);

          if (response.success) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Node ${input.nodeId} updated successfully.`,
                },
              ],
            };
          } else {
            return {
              content: [{ type: 'text', text: `Error updating node: ${response.error}` }],
              isError: true,
            };
          }
        }

        case 'delete_figma_node': {
          const input = DeleteNodeSchema.parse(args);

          if (!bridge.isConnected()) {
            return {
              content: [{ type: 'text', text: 'Error: Figma plugin is not connected.' }],
              isError: true,
            };
          }

          const response = await bridge.sendCommand('DELETE_NODE', input);

          if (response.success) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Node ${input.nodeId} deleted successfully.`,
                },
              ],
            };
          } else {
            return {
              content: [{ type: 'text', text: `Error deleting node: ${response.error}` }],
              isError: true,
            };
          }
        }

        case 'list_figma_nodes': {
          const input = ListNodesSchema.parse(args);

          if (!bridge.isConnected()) {
            return {
              content: [{ type: 'text', text: 'Error: Figma plugin is not connected.' }],
              isError: true,
            };
          }

          const response = await bridge.sendCommand('LIST_NODES', input);

          if (response.success) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(response.data, null, 2),
                },
              ],
            };
          } else {
            return {
              content: [{ type: 'text', text: `Error listing nodes: ${response.error}` }],
              isError: true,
            };
          }
        }

        case 'convert_to_component': {
          const input = ConvertToComponentSchema.parse(args);

          if (!bridge.isConnected()) {
            return {
              content: [{ type: 'text', text: 'Error: Figma plugin is not connected.' }],
              isError: true,
            };
          }

          const response = await bridge.sendCommand('CONVERT_TO_COMPONENT', input);

          if (response.success) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Converted to component successfully. New Component ID: ${response.data}`,
                },
              ],
            };
          } else {
            return {
              content: [{ type: 'text', text: `Error converting to component: ${response.error}` }],
              isError: true,
            };
          }
        }

        case 'get_selection': {
          if (!bridge.isConnected()) {
            return {
              content: [{ type: 'text', text: 'Error: Figma plugin is not connected.' }],
              isError: true,
            };
          }

          const response = await bridge.sendCommand('GET_SELECTION', {});

          if (response.success) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(response.data, null, 2),
                },
              ],
            };
          } else {
            return {
              content: [{ type: 'text', text: `Error getting selection: ${response.error}` }],
              isError: true,
            };
          }
        }

        case 'reorder_figma_node': {
          const input = ReorderNodeSchema.parse(args);

          if (!bridge.isConnected()) {
            return {
              content: [{ type: 'text', text: 'Error: Figma plugin is not connected.' }],
              isError: true,
            };
          }

          const response = await bridge.sendCommand('REORDER_NODE', input);

          if (response.success) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Node ${input.nodeId} reordered to index ${input.index} successfully.`,
                },
              ],
            };
          } else {
            return {
              content: [{ type: 'text', text: `Error reordering node: ${response.error}` }],
              isError: true,
            };
          }
        }

        default:
          return {
            content: [{ type: 'text', text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  return server;
}

export async function runServer(): Promise<void> {
  // Start WebSocket bridge first
  await bridge.start();

  // Create and start MCP server
  const server = createServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);
  console.error('[MCP] Server running on stdio');

  // Handle shutdown
  process.on('SIGINT', async () => {
    console.error('[MCP] Shutting down...');
    await bridge.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.error('[MCP] Shutting down...');
    await bridge.stop();
    process.exit(0);
  });
}
