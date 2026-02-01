import { WebSocketServer, WebSocket } from 'ws';
import { PluginCommand, PluginResponse, FigmaAction } from './types.js';

const WS_PORT = 3055;

export class WebSocketBridge {
  private wss: WebSocketServer | null = null;
  private client: WebSocket | null = null;
  private pendingRequests: Map<string, {
    resolve: (value: PluginResponse) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();
  private requestTimeout = 30000; // 30 seconds

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({ port: WS_PORT });

        this.wss.on('listening', () => {
          console.error(`[WebSocket] Server listening on ws://localhost:${WS_PORT}`);
          resolve();
        });

        this.wss.on('connection', (ws) => {
          console.error('[WebSocket] Figma plugin connected');
          this.client = ws;

          ws.on('message', (data) => {
            this.handleMessage(data.toString());
          });

          ws.on('close', () => {
            console.error('[WebSocket] Figma plugin disconnected');
            this.client = null;
            // Reject all pending requests
            for (const [id, { reject, timeout }] of this.pendingRequests) {
              clearTimeout(timeout);
              reject(new Error('WebSocket connection closed'));
            }
            this.pendingRequests.clear();
          });

          ws.on('error', (error) => {
            console.error('[WebSocket] Error:', error.message);
          });
        });

        this.wss.on('error', (error) => {
          console.error('[WebSocket] Server error:', error.message);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  private handleMessage(data: string): void {
    try {
      const response: PluginResponse = JSON.parse(data);
      const pending = this.pendingRequests.get(response.id);

      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(response.id);
        pending.resolve(response);
      } else {
        console.error('[WebSocket] Received response for unknown request:', response.id);
      }
    } catch (error) {
      console.error('[WebSocket] Failed to parse message:', error);
    }
  }

  isConnected(): boolean {
    return this.client !== null && this.client.readyState === WebSocket.OPEN;
  }

  async sendCommand(
    action: FigmaAction,
    payload: unknown
  ): Promise<PluginResponse> {
    if (!this.isConnected()) {
      throw new Error('Figma plugin is not connected. Please open the plugin in Figma.');
    }

    const id = this.generateId();
    const command: PluginCommand = {
      id,
      action,
      payload,
      timestamp: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request ${id} timed out after ${this.requestTimeout}ms`));
      }, this.requestTimeout);

      this.pendingRequests.set(id, { resolve, reject, timeout });

      try {
        this.client!.send(JSON.stringify(command));
      } catch (error) {
        clearTimeout(timeout);
        this.pendingRequests.delete(id);
        reject(error);
      }
    });
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.wss) {
        this.wss.close(() => {
          console.error('[WebSocket] Server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

// Singleton instance
export const bridge = new WebSocketBridge();
