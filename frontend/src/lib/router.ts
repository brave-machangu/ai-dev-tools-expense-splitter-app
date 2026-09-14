/**
 * A tiny History-API router. The app has two screens, `/` and `/g/{code}`
 * (spec F1 — the code is a path segment, not a query parameter).
 */
import { useSyncExternalStore } from "react";

export type Route = { name: "home" } | { name: "group"; code: string } | { name: "not_found" };

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("popstate", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
}

export function navigate(path: string, options: { replace?: boolean } = {}): void {
  if (path === window.location.pathname) return;
  if (options.replace) window.history.replaceState(null, "", path);
  else window.history.pushState(null, "", path);
  window.scrollTo(0, 0);
  listeners.forEach((listener) => listener());
}

export function groupPath(code: string): string {
  return `/g/${code.toUpperCase()}`;
}

export function matchRoute(pathname: string): Route {
  if (pathname === "/" || pathname === "") return { name: "home" };
  const match = /^\/g\/([^/]+)\/?$/.exec(pathname);
  if (match?.[1]) return { name: "group", code: decodeURIComponent(match[1]).toUpperCase() };
  return { name: "not_found" };
}

export function useRoute(): Route {
  const pathname = useSyncExternalStore(subscribe, () => window.location.pathname);
  return matchRoute(pathname);
}
