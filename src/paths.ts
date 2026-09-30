import { fileURLToPath } from 'url';
import * as path from 'path';
import * as fs from 'fs';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

/** Shared platform data root; resolved from this file so the MCP client's cwd doesn't matter.
 * Supports both standalone repository root (../data) and monorepo structure (../../data).
 */
export const DATA_ROOT = process.env.INFRA_DATA_DIR
  ?? (fs.existsSync(path.resolve(currentDir, '../data'))
      ? path.resolve(currentDir, '../data')
      : path.resolve(currentDir, '../../data'));

export const MCP_DATA_DIR = path.join(DATA_ROOT, 'mcp');
export const PARTNERS_DIR = path.join(DATA_ROOT, 'partners');
export const PAYOUTS_DIR = path.join(DATA_ROOT, 'payouts');

