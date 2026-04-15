export type HttpTransport = {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
};

export type StdioTransport = {
  type: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

export type McpServerConfig = HttpTransport | StdioTransport;

export type McpServerStatus =
  | { state: 'connecting' }
  | { state: 'ready'; toolCount: number }
  | { state: 'failed'; error: string };

export type McpServerEntry = {
  name: string;
  config: McpServerConfig;
  status: McpServerStatus;
};
