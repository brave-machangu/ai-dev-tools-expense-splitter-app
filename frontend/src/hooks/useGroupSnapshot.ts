import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/lib/api";
import { ApiError, type GroupSnapshot } from "@/lib/types";

export type SnapshotStatus = "loading" | "ready" | "not_found" | "error";

const POLL_MS = 5000;

/**
 * §F9 live sync: poll the fat snapshot endpoint every 5s, pause while the tab
 * is hidden, fetch immediately on refocus, and hold snapshot application while
 * a form is open so a timer never clobbers half-typed input.
 */
export function useGroupSnapshot(code: string) {
  const [snapshot, setSnapshot] = useState<GroupSnapshot | null>(null);
  const [status, setStatus] = useState<SnapshotStatus>("loading");
  const [openForms, setOpenForms] = useState(0);

  const pendingRef = useRef<GroupSnapshot | null>(null);
  const heldRef = useRef(false);
  heldRef.current = openForms > 0;

  const applySnapshot = useCallback((next: GroupSnapshot, force: boolean) => {
    if (heldRef.current && !force) {
      pendingRef.current = next;
      return;
    }
    pendingRef.current = null;
    setSnapshot(next);
  }, []);

  const fetchSnapshot = useCallback(async () => {
    try {
      const next = await api.getGroup(code);
      applySnapshot(next, false);
      setStatus("ready");
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) setStatus("not_found");
      else setStatus((current) => (current === "ready" ? current : "error"));
    }
  }, [code, applySnapshot]);

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void fetchSnapshot();
    };

    void fetchSnapshot();
    const interval = window.setInterval(tick, POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void fetchSnapshot();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchSnapshot]);

  // A queued snapshot lands as soon as the last open form closes.
  useEffect(() => {
    if (openForms === 0 && pendingRef.current) {
      setSnapshot(pendingRef.current);
      pendingRef.current = null;
    }
  }, [openForms]);

  const holdSync = useCallback(() => setOpenForms((n) => n + 1), []);
  const releaseSync = useCallback(() => setOpenForms((n) => Math.max(0, n - 1)), []);

  /** For results of the user's own mutation — applied straight away. */
  const commit = useCallback(
    (next: GroupSnapshot) => {
      applySnapshot(next, true);
      setStatus("ready");
    },
    [applySnapshot],
  );

  return { snapshot, status, refetch: fetchSnapshot, commit, holdSync, releaseSync };
}
