import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { AnalysisResult, RGB } from './types.js';

const ANALYSIS_PROMPT = `Analyze this UI screenshot and extract all UI components. Return a JSON object with this exact structure:

{
  "components": [
    {
      "type": "frame" | "text" | "button" | "input" | "card" | "image" | "container",
      "bounds": { "x": number, "y": number, "width": number, "height": number },
      "properties": {
        "text": "string if applicable",
        "backgroundColor": { "r": 0-1, "g": 0-1, "b": 0-1 },
        "textColor": { "r": 0-1, "g": 0-1, "b": 0-1 },
        "fontSize": number,
        "fontWeight": "normal" | "medium" | "semibold" | "bold",
        "cornerRadius": number,
        "borderWidth": number,
        "borderColor": { "r": 0-1, "g": 0-1, "b": 0-1 },
        "padding": { "top": number, "right": number, "bottom": number, "left": number }
      },
      "children": [ /* nested components */ ]
    }
  ],
  "colors": {
    "primary": { "r": 0-1, "g": 0-1, "b": 0-1 },
    "secondary": { "r": 0-1, "g": 0-1, "b": 0-1 },
    "background": { "r": 0-1, "g": 0-1, "b": 0-1 },
    "text": { "r": 0-1, "g": 0-1, "b": 0-1 }
  },
  "layout": {
    "type": "column" | "row" | "grid" | "absolute",
    "gap": number
  },
  "typography": {
    "headingSize": number,
    "bodySize": number,
    "fontFamily": "string"
  }
}

Important:
- All color values must be normalized between 0 and 1 (e.g., white is {r:1, g:1, b:1})
- Estimate pixel values for bounds based on the image dimensions
- Identify the component hierarchy (what contains what)
- For buttons, cards, and inputs, include appropriate properties
- Return ONLY the JSON object, no other text`;

export class VisionAnalyzer {
  private client: Anthropic | null = null;

  constructor() {
    // Only initialize if API key is available
    if (process.env.ANTHROPIC_API_KEY) {
      this.client = new Anthropic();
    }
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  async analyzeScreenshot(
    screenshotPath: string,
    options?: {
      extractColors?: boolean;
      extractTypography?: boolean;
      detailLevel?: 'basic' | 'detailed';
    }
  ): Promise<AnalysisResult> {
    if (!this.client) {
      throw new Error(
        'ANTHROPIC_API_KEY not set. Set the environment variable or use Claude Code directly for analysis.'
      );
    }

    // Read and encode the image
    const imageData = this.loadImage(screenshotPath);
    const mediaType = this.getMediaType(screenshotPath);

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: imageData,
              },
            },
            {
              type: 'text',
              text: ANALYSIS_PROMPT,
            },
          ],
        },
      ],
    });

    // Extract the text response
    const textContent = response.content.find((c) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from Claude Vision');
    }

    // Parse the JSON response
    try {
      const result = JSON.parse(textContent.text) as AnalysisResult;
      return this.validateAndNormalize(result);
    } catch (error) {
      throw new Error(`Failed to parse analysis result: ${error}`);
    }
  }

  private loadImage(pathOrBase64: string): string {
    // Check if it's already base64
    if (pathOrBase64.startsWith('data:')) {
      return pathOrBase64.split(',')[1];
    }
    if (!pathOrBase64.includes('/') && !pathOrBase64.includes('\\')) {
      // Might be raw base64
      try {
        Buffer.from(pathOrBase64, 'base64');
        return pathOrBase64;
      } catch {
        // Not base64, treat as path
      }
    }

    // Read from file
    const absolutePath = path.resolve(pathOrBase64);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Screenshot file not found: ${absolutePath}`);
    }

    const buffer = fs.readFileSync(absolutePath);
    return buffer.toString('base64');
  }

  private getMediaType(pathOrBase64: string): 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' {
    if (pathOrBase64.startsWith('data:image/png')) return 'image/png';
    if (pathOrBase64.startsWith('data:image/jpeg')) return 'image/jpeg';
    if (pathOrBase64.startsWith('data:image/webp')) return 'image/webp';
    if (pathOrBase64.startsWith('data:image/gif')) return 'image/gif';

    const ext = path.extname(pathOrBase64).toLowerCase();
    switch (ext) {
      case '.png':
        return 'image/png';
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.webp':
        return 'image/webp';
      case '.gif':
        return 'image/gif';
      default:
        return 'image/png'; // Default to PNG
    }
  }

  private validateAndNormalize(result: AnalysisResult): AnalysisResult {
    // Ensure colors are normalized (0-1)
    const normalizeColor = (color: RGB): RGB => ({
      r: Math.max(0, Math.min(1, color.r)),
      g: Math.max(0, Math.min(1, color.g)),
      b: Math.max(0, Math.min(1, color.b)),
    });

    if (result.colors) {
      result.colors.primary = normalizeColor(result.colors.primary);
      result.colors.secondary = normalizeColor(result.colors.secondary);
      result.colors.background = normalizeColor(result.colors.background);
      result.colors.text = normalizeColor(result.colors.text);
    }

    // Normalize component colors recursively
    const normalizeComponent = (comp: typeof result.components[0]): void => {
      if (comp.properties.backgroundColor) {
        comp.properties.backgroundColor = normalizeColor(comp.properties.backgroundColor);
      }
      if (comp.properties.textColor) {
        comp.properties.textColor = normalizeColor(comp.properties.textColor);
      }
      if (comp.properties.borderColor) {
        comp.properties.borderColor = normalizeColor(comp.properties.borderColor);
      }
      if (comp.children) {
        comp.children.forEach(normalizeComponent);
      }
    };

    result.components.forEach(normalizeComponent);

    return result;
  }
}

// Singleton instance
export const visionAnalyzer = new VisionAnalyzer();
