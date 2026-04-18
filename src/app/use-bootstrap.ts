import { useEffect } from 'react';
import { bootstrapMcp, listMcpServers } from '../features/mcp/index.js';
import { isAuthenticated } from '../features/models/auth.js';
import { type Catalog, findModel, loadCatalog, type ModelRef } from '../features/models/catalog.js';
import type { Config, McpServerConfig } from '../shared/config/user-config.js';
import { errorMessage } from '../shared/errors/index.js';
import type { Phase } from './dispatch.js';

export type McpSnapshot = { ready: number; connecting: number; failed: number };

export type BootstrapDeps = {
  config: Pick<Config, 'providerId' | 'modelId'> & {
    mcpServers?: Record<string, McpServerConfig>;
  };
  setCatalog: (c: Catalog) => void;
  setCatalogStale: (stale: boolean) => void;
  setMcpSnapshot: (snap: McpSnapshot) => void;
  setPhase: (p: Phase) => void;
};

export function useBootstrap(deps: BootstrapDeps): void {
  const { config, setCatalog, setCatalogStale, setMcpSnapshot, setPhase } = deps;
  useEffect(() => {
    let cancelled = false;
    // Poll the MCP registry while servers connect so the bootstrap/chat UI
    // can surface a live "X ready · Y connecting" count instead of waiting
    // for /mcp. Poll stops once every server has settled.
    const mcpPoll = setInterval(() => {
      if (cancelled) return;
      const servers = listMcpServers();
      const snap: McpSnapshot = { ready: 0, connecting: 0, failed: 0 };
      for (const s of servers) {
        if (s.status.state === 'ready') snap.ready++;
        else if (s.status.state === 'connecting') snap.connecting++;
        else snap.failed++;
      }
      setMcpSnapshot(snap);
      if (snap.connecting === 0 && servers.length > 0) clearInterval(mcpPoll);
    }, 200);

    (async () => {
      try {
        void bootstrapMcp(config.mcpServers);
        const { catalog: cat, stale } = await loadCatalog();
        if (cancelled) return;
        setCatalog(cat);
        setCatalogStale(stale);
        const ref: ModelRef | null =
          config.providerId && config.modelId
            ? { providerId: config.providerId, modelId: config.modelId }
            : null;
        const model = ref ? findModel(cat, ref) : undefined;
        const prov = ref ? cat[ref.providerId] : undefined;
        const authed = prov ? isAuthenticated(prov.id, prov.env) : false;
        setPhase(model && authed ? { kind: 'chat' } : { kind: 'picker' });
      } catch (err: unknown) {
        if (cancelled) return;
        setPhase({
          kind: 'bootstrap',
          status: '',
          error: `failed to load catalog: ${errorMessage(err)}`,
        });
      }
    })();
    return () => {
      cancelled = true;
      clearInterval(mcpPoll);
    };
  }, [
    config.modelId,
    config.providerId,
    config.mcpServers,
    setCatalog,
    setCatalogStale,
    setMcpSnapshot,
    setPhase,
  ]);
}
