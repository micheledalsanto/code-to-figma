// ============================================
// Shared Types for Code to Figma MCP Server
// ============================================

// RGB color (normalized 0-1 for Figma API)
export interface RGB {
  r: number;
  g: number;
  b: number;
}

// Bounding box
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Padding
export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

// UI Component detected from screenshot
export interface UIComponent {
  type: 'frame' | 'text' | 'button' | 'input' | 'card' | 'image' | 'container';
  bounds: Bounds;
  properties: {
    text?: string;
    backgroundColor?: RGB;
    textColor?: RGB;
    fontSize?: number;
    fontWeight?: 'normal' | 'medium' | 'semibold' | 'bold';
    fontFamily?: string;
    cornerRadius?: number;
    borderWidth?: number;
    borderColor?: RGB;
    padding?: Padding;
    opacity?: number;
  };
  children?: UIComponent[];
}

// Analysis result from Claude Vision
export interface AnalysisResult {
  components: UIComponent[];
  colors: {
    primary: RGB;
    secondary: RGB;
    background: RGB;
    text: RGB;
  };
  layout: {
    type: 'column' | 'row' | 'grid' | 'absolute';
    gap: number;
  };
  typography: {
    headingSize: number;
    bodySize: number;
    fontFamily: string;
  };
}

// ============================================
// WebSocket Protocol Types
// ============================================

export interface PluginCommand {
  id: string;
  action: FigmaAction;
  payload: unknown;
  timestamp: number;
}

export interface PluginResponse {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export type FigmaAction =
  | 'CREATE_FRAME'
  | 'CREATE_TEXT'
  | 'CREATE_RECTANGLE'
  | 'CREATE_ELLIPSE'
  | 'CREATE_COMPONENT'
  | 'CREATE_IMAGE'
  | 'SET_SELECTION'
  | 'PING'
  // Bidirectional actions
  | 'GET_NODE'
  | 'UPDATE_NODE'
  | 'DELETE_NODE'
  | 'LIST_NODES'
  | 'CONVERT_TO_COMPONENT'
  | 'GET_SELECTION'
  | 'REORDER_NODE';

// ============================================
// Tool Input Types
// ============================================

export interface CreateFrameInput {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fills?: Array<{ type: 'SOLID'; color: RGB }>;
  cornerRadius?: number;
  // Individual corner radii (overrides cornerRadius if set)
  topLeftRadius?: number;
  topRightRadius?: number;
  bottomLeftRadius?: number;
  bottomRightRadius?: number;
  // Auto-layout
  layoutMode?: 'HORIZONTAL' | 'VERTICAL' | 'NONE';
  padding?: Padding;
  itemSpacing?: number;
  primaryAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
  counterAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX';
  layoutSizingHorizontal?: 'FIXED' | 'HUG' | 'FILL';
  layoutSizingVertical?: 'FIXED' | 'HUG' | 'FILL';
  // Strokes
  strokes?: Array<{ type: 'SOLID'; color: RGB }>;
  strokeWeight?: number;
  parentId?: string;
}

export interface CreateTextInput {
  content: string;
  x: number;
  y: number;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: 'thin' | 'extralight' | 'light' | 'normal' | 'medium' | 'semibold' | 'bold' | 'extrabold' | 'black';
  color?: RGB;
  width?: number;
  textAlignHorizontal?: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
  textAlignVertical?: 'TOP' | 'CENTER' | 'BOTTOM';
  parentId?: string;
}

export interface CreateRectangleInput {
  x: number;
  y: number;
  width: number;
  height: number;
  fills?: Array<{ type: 'SOLID'; color: RGB }>;
  cornerRadius?: number;
  strokes?: Array<{ type: 'SOLID'; color: RGB }>;
  strokeWeight?: number;
  name?: string;
  parentId?: string;
}

export interface AnalyzeScreenshotInput {
  screenshot: string; // File path or base64
  options?: {
    extractColors?: boolean;
    extractTypography?: boolean;
    extractSpacing?: boolean;
    detailLevel?: 'basic' | 'detailed';
  };
}

export interface ReconstructUIInput {
  screenshot: string;
  targetX?: number;
  targetY?: number;
  scale?: number;
}

export interface CreateImageInput {
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  name?: string;
  cornerRadius?: number;
  scaleMode?: 'FILL' | 'FIT' | 'CROP' | 'TILE';
  parentId?: string;
  usePlaceholderOnError?: boolean;
  timeoutMs?: number;
}

// ============================================
// Bidirectional Tool Input Types
// ============================================

export interface GetNodeInput {
  nodeId: string;
  includeChildren?: boolean;
}

export interface UpdateNodeInput {
  nodeId: string;
  properties: {
    name?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    fills?: Array<{ type: 'SOLID'; color: RGB }>;
    cornerRadius?: number;
    topLeftRadius?: number;
    topRightRadius?: number;
    bottomLeftRadius?: number;
    bottomRightRadius?: number;
    opacity?: number;
    visible?: boolean;
    locked?: boolean;
    // Strokes
    strokes?: Array<{ type: 'SOLID'; color: RGB }>;
    strokeWeight?: number;
    // Auto-layout properties
    layoutMode?: 'HORIZONTAL' | 'VERTICAL' | 'NONE';
    padding?: Padding;
    itemSpacing?: number;
    primaryAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
    counterAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX';
    layoutSizingHorizontal?: 'FIXED' | 'HUG' | 'FILL';
    layoutSizingVertical?: 'FIXED' | 'HUG' | 'FILL';
  };
}

export interface DeleteNodeInput {
  nodeId: string;
}

export interface ListNodesInput {
  parentId?: string; // If not provided, lists from current page
  depth?: number; // How deep to traverse (default 1)
  types?: string[]; // Filter by node types
}

export interface ConvertToComponentInput {
  nodeId: string;
  name?: string;
}

// Node info returned from Figma
export interface FigmaNodeInfo {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  locked: boolean;
  opacity: number;
  fills?: unknown[];
  strokes?: unknown[];
  cornerRadius?: number;
  layoutMode?: string;
  layoutSizingHorizontal?: string;
  layoutSizingVertical?: string;
  children?: FigmaNodeInfo[];
  parentId?: string;
}
