import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApprovalDecision, ApprovalRequest, Approver } from './index.js';

type Pending = ApprovalRequest & {
  resolve: (d: ApprovalDecision) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export type ApprovalChannel = {
  pending: ApprovalRequest | null;
  approver: Approver;
  resolve: (decision: ApprovalDecision) => void;
};

// If the user walks away mid-approval the stream would otherwise hold forever
// (upstream HTTP keep-alive + memory). Auto-deny after 2 minutes.
export const APPROVAL_TIMEOUT_MS = 120_000;

export function useApproval(): ApprovalChannel {
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);

  const clearPending = useCallback(() => {
    const entry = pendingRef.current;
    if (!entry) return null;
    clearTimeout(entry.timeout);
    pendingRef.current = null;
    setPending(null);
    return entry;
  }, []);

  const approver = useCallback<Approver>(async (req) => {
    return new Promise<ApprovalDecision>((resolve) => {
      const timeout = setTimeout(() => {
        const current = pendingRef.current;
        if (!current || current.toolCallId !== req.toolCallId) return;
        pendingRef.current = null;
        setPending(null);
        resolve('deny');
      }, APPROVAL_TIMEOUT_MS);
      const entry: Pending = { ...req, resolve, timeout };
      pendingRef.current = entry;
      setPending(entry);
    });
  }, []);

  const resolve = useCallback(
    (decision: ApprovalDecision) => {
      const entry = clearPending();
      if (entry) entry.resolve(decision);
    },
    [clearPending],
  );

  useEffect(
    () => () => {
      const entry = clearPending();
      if (entry) entry.resolve('deny');
    },
    [clearPending],
  );

  return {
    pending: pending
      ? { toolCallId: pending.toolCallId, toolName: pending.toolName, input: pending.input }
      : null,
    approver,
    resolve,
  };
}
