import path from 'node:path';

// Glob-style path matching for state store subscriptions.
//
// Supports:
// - Exact match: '/data/config' matches '/data/config'
// - Single-level wildcard: * matches one segment
// - Recursive wildcard: ** matches any number of segments (including zero)
// - Mixed: '/sessions/*/state' matches '/sessions/slack-abc/state'
export function globMatch(pathStr: string, pattern: string): boolean {
  if (path.matchesGlob(pathStr, pattern)) {
    return true;
  }

  // path.matchesGlob treats trailing /** as one-or-more segments;
  // we need zero-or-more, so also check the base path without /**
  if (pattern.endsWith('/**')) {
    const base = pattern.slice(0, -3);
    return pathStr.replace(/\/+$/, '') === base.replace(/\/+$/, '');
  }

  return false;
}
