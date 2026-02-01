#!/usr/bin/env node

/**
 * Standalone WebSocket server for Code to Figma Bridge
 * Run this separately to keep the WebSocket connection alive
 * while using the MCP tools from Claude Code.
 */

import { WebSocketServer, WebSocket } from 'ws';

const WS_PORT = 3055;

interface PluginCommand {
  id: string;
  action: string;
  payload: unknown;
  timestamp: number;
}

interface PluginResponse {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

class StandaloneWebSocketBridge {
  private wss: WebSocketServer | null = null;
  private client: WebSocket | null = null;
  private pendingRequests: Map<string, {
    resolve: (value: PluginResponse) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({ port: WS_PORT });

        this.wss.on('listening', () => {
          console.log(`[WebSocket] Server listening on ws://localhost:${WS_PORT}`);
          console.log('[WebSocket] Waiting for Figma plugin to connect...');
          resolve();
        });

        this.wss.on('connection', (ws) => {
          console.log('[WebSocket] Figma plugin connected!');
          this.client = ws;

          ws.on('message', (data) => {
            const message = data.toString();
            console.log('[WebSocket] Received:', message.substring(0, 100) + (message.length > 100 ? '...' : ''));

            try {
              const response: PluginResponse = JSON.parse(message);
              const pending = this.pendingRequests.get(response.id);
              if (pending) {
                clearTimeout(pending.timeout);
                this.pendingRequests.delete(response.id);
                pending.resolve(response);
              }
            } catch (error) {
              console.error('[WebSocket] Failed to parse message:', error);
            }
          });

          ws.on('close', () => {
            console.log('[WebSocket] Figma plugin disconnected');
            this.client = null;
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

  isConnected(): boolean {
    return this.client !== null && this.client.readyState === WebSocket.OPEN;
  }

  async sendCommand(action: string, payload: unknown): Promise<PluginResponse> {
    if (!this.isConnected()) {
      throw new Error('Figma plugin is not connected');
    }

    const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const command: PluginCommand = { id, action, payload, timestamp: Date.now() };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error('Request timed out'));
      }, 30000);

      this.pendingRequests.set(id, { resolve, reject, timeout });
      this.client!.send(JSON.stringify(command));
      console.log(`[WebSocket] Sent command: ${action}`);
    });
  }
}

// Create global instance
const bridge = new StandaloneWebSocketBridge();

// Export for external use
(global as any).figmaBridge = bridge;

// Start server
console.log('='.repeat(50));
console.log('Code to Figma Bridge - Standalone WebSocket Server');
console.log('='.repeat(50));

bridge.start().then(() => {
  console.log('\nServer is running. Keep this terminal open.');
  console.log('Open the Figma plugin and click "Connect".\n');

  // Keep process alive
  process.stdin.resume();

  // Handle shutdown
  process.on('SIGINT', () => {
    console.log('\n[WebSocket] Shutting down...');
    process.exit(0);
  });
}).catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
