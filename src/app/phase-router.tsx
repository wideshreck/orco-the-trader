import type { ReactNode } from 'react';
import type { ChatRow } from '../features/chat/types.js';
import { AuthPrompt } from '../features/models/auth-prompt.js';
import type { Catalog, ModelRef } from '../features/models/catalog.js';
import { ModelPicker } from '../features/models/model-picker.js';
import type { CompactionPoint } from '../features/sessions/index.js';
import { SessionPicker } from '../features/sessions/session-picker.js';
import type { SessionChannel } from '../features/sessions/use-session.js';
import { type Config, saveConfig } from '../shared/config/user-config.js';
import { Bootstrap } from '../shared/ui/bootstrap.js';
import type { Phase } from './dispatch.js';
import type { McpSnapshot } from './use-bootstrap.js';

export type PhaseRouterProps = {
  phase: Phase;
  mcpSnapshot: McpSnapshot;
  catalog: Catalog | null;
  config: Config;
  setConfig: (c: Config) => void;
  setPhase: (p: Phase) => void;
  session: SessionChannel;
  resetChat: (load: { rows: ChatRow[]; compactionPoint: CompactionPoint | null }) => void;
};

// Returns the non-chat phase UI or null when the chat view should render.
// Keeps app.tsx under the 300-line cap — otherwise the phase branches alone
// eat ~60 lines of routing code.
export function renderPhase(props: PhaseRouterProps): ReactNode {
  const { phase, mcpSnapshot, catalog, config, setConfig, setPhase, session, resetChat } = props;

  if (phase.kind === 'bootstrap') {
    return <Bootstrap status={phase.status} error={phase.error ?? null} mcp={mcpSnapshot} />;
  }

  if (phase.kind === 'picker' && catalog) {
    const current: ModelRef | undefined =
      config.providerId && config.modelId
        ? { providerId: config.providerId, modelId: config.modelId }
        : undefined;
    return (
      <ModelPicker
        catalog={catalog}
        {...(current ? { current } : {})}
        onCancel={() => {
          if (config.providerId && config.modelId) setPhase({ kind: 'chat' });
        }}
        onPick={(ref, authed) => {
          const next: Config = { providerId: ref.providerId, modelId: ref.modelId };
          setConfig(next);
          saveConfig(next);
          setPhase(authed ? { kind: 'chat' } : { kind: 'auth', providerId: ref.providerId });
        }}
      />
    );
  }

  if (phase.kind === 'auth' && catalog) {
    const prov = catalog[phase.providerId];
    if (!prov) {
      setPhase({ kind: 'picker' });
      return null;
    }
    return (
      <AuthPrompt
        provider={prov}
        onCancel={() => setPhase({ kind: 'picker' })}
        onDone={() => setPhase({ kind: 'chat' })}
      />
    );
  }

  if (phase.kind === 'sessions') {
    return (
      <SessionPicker
        sessions={session.list()}
        currentId={session.currentId}
        onCancel={() => setPhase({ kind: 'chat' })}
        onPick={(id) => {
          const load = session.switchTo(id);
          resetChat(load);
          setPhase({ kind: 'chat' });
        }}
        onDelete={(id) => session.remove(id)}
      />
    );
  }

  return null;
}
