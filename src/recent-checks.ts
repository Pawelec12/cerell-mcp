import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const CHECKS_FILE = 'recent-checks.json';
export const TTL_MS = 30 * 60 * 1000;

function getCerellConfigDir(): string {
  const home = os.homedir() || process.env.USERPROFILE || process.env.HOME || '.';
  return path.join(home, '.cerell');
}

function checksPath(): string {
  return path.join(getCerellConfigDir(), CHECKS_FILE);
}

interface CheckEntry {
  repoKey?: string;
  capabilities?: string[];
  source?: string;
  ts?: number;
}

interface NudgeEntry {
  repoKey?: string;
  pkg: string;
  ts?: number;
}

interface Store {
  checks?: CheckEntry[];
  nudges?: NudgeEntry[];
}

function readStore(): Store {
  try {
    const p = checksPath();
    if (!fs.existsSync(p)) return { checks: [], nudges: [] };
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as Store;
  } catch {
    return { checks: [], nudges: [] };
  }
}

function writeStore(store: Store): void {
  try {
    const dir = getCerellConfigDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(checksPath(), JSON.stringify(store, null, 2), 'utf-8');
  } catch {
    // fail-open
  }
}

export function recordStackCheck({
  repoKey = 'default',
  capabilities = [],
  source = 'resolve',
}: {
  repoKey?: string;
  capabilities?: string[];
  source?: string;
} = {}): void {
  const store = readStore();
  const now = Date.now();
  store.checks = (store.checks ?? []).filter((c) => now - (c.ts ?? 0) < TTL_MS);
  store.checks.push({
    repoKey,
    capabilities: capabilities.map((c) => String(c).toLowerCase()),
    source,
    ts: now,
  });
  writeStore(store);
}

export function hasRecentCheck({
  repoKey = 'default',
  capability,
  maxAgeMs = TTL_MS,
}: {
  repoKey?: string;
  capability?: string;
  maxAgeMs?: number;
} = {}): boolean {
  const store = readStore();
  const now = Date.now();
  const cap = capability?.toLowerCase();
  return (store.checks ?? []).some((c) => {
    if (now - (c.ts ?? 0) > maxAgeMs) return false;
    if (c.repoKey && c.repoKey !== repoKey && c.repoKey !== 'default') return false;
    if (!cap) return true;
    return (c.capabilities ?? []).includes(cap) || (c.capabilities ?? []).length === 0;
  });
}

export function recordNudge({ repoKey = 'default', pkg }: { repoKey?: string; pkg: string }): void {
  const store = readStore();
  const now = Date.now();
  store.nudges = (store.nudges ?? []).filter((n) => now - (n.ts ?? 0) < TTL_MS);
  store.nudges.push({ repoKey, pkg: String(pkg).toLowerCase(), ts: now });
  writeStore(store);
}

export function wasNudged({
  repoKey = 'default',
  pkg,
  maxAgeMs = TTL_MS,
}: {
  repoKey?: string;
  pkg: string;
  maxAgeMs?: number;
}): boolean {
  const store = readStore();
  const now = Date.now();
  const name = String(pkg).toLowerCase();
  return (store.nudges ?? []).some(
    (n) =>
      n.pkg === name &&
      (n.repoKey === repoKey || n.repoKey === 'default') &&
      now - (n.ts ?? 0) <= maxAgeMs,
  );
}
