import { useCallback, useRef, useState } from 'react';
import type { ApprovalDecision, ApprovalRequest, Approver } from '../tools/index.js';

type Pending = ApprovalRequest & { resolve: (d: ApprovalDecision) => void };

export type ApprovalChannel = {
  pending: ApprovalRequest | null;
  approver: Approver;
  resolve: (decision: ApprovalDecision) => void;
};

export function useApproval(): ApprovalChannel {
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);

  const approver = useCallback<Approver>(async (req) => {
    return new Promise<ApprovalDecision>((resolve) => {
      const entry: Pending = { ...req, resolve };
      pendingRef.current = entry;
      setPending(entry);
    });
  }, []);

  const resolve = useCallback((decision: ApprovalDecision) => {
    const entry = pendingRef.current;
    if (!entry) return;
    pendingRef.current = null;
    setPending(null);
    entry.resolve(decision);
  }, []);

  return {
    pending: pending
      ? { toolCallId: pending.toolCallId, toolName: pending.toolName, input: pending.input }
      : null,
    approver,
    resolve,
  };
}
