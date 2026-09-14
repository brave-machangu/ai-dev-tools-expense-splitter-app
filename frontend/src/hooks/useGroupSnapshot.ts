import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "../api/client";
import { ApiError, type GroupSnapshot } from "../types";

export type SnapshotStatus = "loading" | "ready" | "not_found" | "error";

const POLL_INTERVAL_MS = 5000;

/**
 * F9 live sync. Polls GET /api/groups/{code} every 5 seconds and replaces local
 * state with the response.
 *
 * - Polling pauses while the tab is hidden and fetches once on regaining focus.
 * - While `holdUpdates` is true (a form is open), fetched snapshots are queued
 *   instead of applied, and the latest one lands when the form closes.
 * - `commit` applies the snapshot returned by the user's own mutation right away
 *   and discards any poll that was already in flight (it would be stale).
 */
export function useGroupSnapshot(code: string, holdUpdates: boolean) {
  const [snapshot, setSnapshot] = useState<GroupSnapshot | null>(null);
  const [status, setStatus] = useState<SnapshotStatus>("loading");
  const [lastSyncFailed, setLastSyncFailed] = useState(false);

  const holdRef = useRef(holdUpdates);
  const pendingRef = useRef<GroupSnapshot | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    holdRef.current = holdUpdates;
    if (!holdUpdates && pendingRef.current) {
      setSnapshot(pendingRef.current);
      pendingRef.current = null;
    }
  }, [holdUpdates]);

  const refresh = useCallback(async () => {
    const seq = ++requestSeq.current;
    try {
      const next = await api.getGroup(code);
      if (seq !== requestSeq.current) return;
      if (holdRef.current) pendingRef.current = next;
      else setSnapshot(next);
      setStatus("ready");
      setLastSyncFailed(false);
    } catch (error) {
      if (seq !== requestSeq.current) return;
      if (error instanceof ApiError && error.status === 404) {
        setStatus("not_found");
      } else {
        setLastSyncFailed(true);
        setStatus((current) => (current === "ready" ? current : "error"));
      }
    }
  }, [code]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "hidden") void refresh();
    }, POLL_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refresh]);

  const commit = useCallback((next: GroupSnapshot) => {
    requestSeq.current += 1;
    pendingRef.current = null;
    setSnapshot(next);
    setStatus("ready");
    setLastSyncFailed(false);
  }, []);

  return { snapshot, status, lastSyncFailed, refresh, commit };
}
