import { createMCPClient } from '@ai-sdk/mcp';
import type { ToolSet } from 'ai';
import { isAlwaysAllowed } from '../tools/approvals.js';
import type { Approver } from '../tools/types.js';
import type { McpServerConfig } from './types.js';

type McpClient = Awaited<ReturnType<typeof createMCPClient>>;

export type ConnectedServer = {
  name: string;
  client: McpClient;
  tools: ToolSet;
};

export async function connectServer(
  name: string,
  config: McpServerConfig,
): Promise<ConnectedServer> {
  const client = await createMCPClient({
    transport: {
      type: 'http',
      url: config.url,
      ...(config.headers ? { headers: config.headers } : {}),
    },
  });
  const tools = await client.tools();
  return { name, client, tools };
}

/** Wrap an MCP tool's execute with our approval gate so MCP calls obey the
 * same allow/deny/always flow as native tools. The tool's schema is preserved
 * so the LLM still sees the original signature. */
export function gateMcpTools(server: ConnectedServer, approver: Approver): ToolSet {
  const gated: ToolSet = {};
  for (const [toolName, tool] of Object.entries(server.tools)) {
    const displayName = `${server.name}/${toolName}`;
    const originalExecute = tool.execute;
    if (!originalExecute) {
      gated[toolName] = tool;
      continue;
    }
    gated[toolName] = {
      ...tool,
      execute: async (
        input: unknown,
        callCtx: Parameters<NonNullable<typeof originalExecute>>[1],
      ) => {
        if (!isAlwaysAllowed(displayName)) {
          const decision = await approver({
            toolCallId: callCtx.toolCallId,
            toolName: displayName,
            input,
          });
          if (decision === 'deny') {
            throw new Error('denied by user');
          }
        }
        return originalExecute(input, callCtx);
      },
    };
  }
  return gated;
}
