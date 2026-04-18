import { get as getNative } from './registry.js';

// Descriptions for tools that live outside the native registry (MCP servers
// register their descriptions here at connect time). Keyed by the name the
// LLM sees — same key as in buildAiSdkTools output.
const externalDescriptions = new Map<string, string>();

export function registerExternalDescription(name: string, description: string): void {
  if (description) externalDescriptions.set(name, description);
}

export function clearExternalDescriptions(): void {
  externalDescriptions.clear();
}

// Returns the first line of the tool's description (what the LLM reads)
// so the UI can surface a human-readable hint next to the call.
export function describeTool(name: string): string | undefined {
  const native = getNative(name);
  if (native) return firstLine(native.description);
  const external = externalDescriptions.get(name);
  if (external) return firstLine(external);
  return undefined;
}

function firstLine(s: string): string {
  const line = s.split('\n')[0]?.trim() ?? '';
  return line.length > 60 ? `${line.slice(0, 59)}…` : line;
}
