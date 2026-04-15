import type { ToolSet } from 'ai';
import { logger } from '../../shared/logging/logger.js';
import type { Approver } from '../tools/types.js';
import { type ConnectedServer, connectServer, gateMcpTools } from './client.js';
import type { McpServerConfig, McpServerEntry, McpServerStatus } from './types.js';

const registry = new Map<string, McpServerEntry>();
const clients = new Map<string, ConnectedServer>();
let bootstrapped = false;

function errorToString(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export async function bootstrapMcp(
  servers: Record<string, McpServerConfig> | undefined,
): Promise<void> {
  if (bootstrapped) return;
  bootstrapped = true;
  if (!servers) return;
  await Promise.all(
    Object.entries(servers).map(async ([name, config]) => {
      registry.set(name, { name, config, status: { state: 'connecting' } });
      logger.info('mcp', 'connecting', { name, url: config.url });
      try {
        const conn = await connectServer(name, config);
        clients.set(name, conn);
        const toolCount = Object.keys(conn.tools).length;
        registry.set(name, {
          name,
          config,
          status: { state: 'ready', toolCount },
        });
        logger.info('mcp', 'ready', { name, toolCount });
      } catch (err) {
        const error = errorToString(err);
        registry.set(name, { name, config, status: { state: 'failed', error } });
        logger.error('mcp', 'connect failed', { name, error });
      }
    }),
  );
}

export async function shutdownMcp(): Promise<void> {
  const closing = [...clients.values()].map((c) => c.client.close().catch(() => undefined));
  clients.clear();
  registry.clear();
  bootstrapped = false;
  await Promise.all(closing);
}

export async function reloadMcp(
  servers: Record<string, McpServerConfig> | undefined,
): Promise<void> {
  await shutdownMcp();
  await bootstrapMcp(servers);
}

export function listMcpServers(): McpServerEntry[] {
  return [...registry.values()];
}

export function listMcpToolNames(): string[] {
  const out: string[] = [];
  for (const conn of clients.values()) {
    for (const name of Object.keys(conn.tools)) {
      out.push(`${conn.name}/${name}`);
    }
  }
  return out;
}

export function getMcpTools(approver: Approver): ToolSet {
  const merged: ToolSet = {};
  for (const conn of clients.values()) {
    const gated = gateMcpTools(conn, approver);
    for (const [toolName, tool] of Object.entries(gated)) {
      // Prefix with server name in case two servers expose tools with the same name.
      const key = clients.size > 1 ? `${conn.name}_${toolName}` : toolName;
      merged[key] = tool;
    }
  }
  return merged;
}

export type { McpServerConfig, McpServerEntry, McpServerStatus };
