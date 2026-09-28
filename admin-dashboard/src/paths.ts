import { fileURLToPath } from "url";
import path from "path";

/** Shared platform data root; resolved from this file so the process cwd doesn't matter. */
export const DATA_ROOT = process.env.INFRA_DATA_DIR
  ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data");

export const MCP_DATA_DIR = path.join(DATA_ROOT, "mcp");
export const PARTNERS_DIR = path.join(DATA_ROOT, "partners");
export const PAYOUTS_DIR = path.join(DATA_ROOT, "payouts");
