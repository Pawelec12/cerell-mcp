#!/usr/bin/env node
// @ts-nocheck
/**
 * One-command installer: MCP config + agent rule + package-install hook
 * for Cursor, Claude Code, Codex, Copilot, Windsurf, VS Code, Antigravity, Cline.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';

const RULE_BODY = `## Cerell MCP
When implementing, scaffolding, or planning ANY feature—even from a vague prompt—first check whether it needs an external capability not yet in package.json/.env (auth, database/schema, payments/billing, email/newsletter, hosting/deploy, storage, monitoring, analytics).
If already installed or the task is pure code/UI/refactor/bugfix, do NOT call Cerell.
Otherwise BEFORE choosing a library/provider, running npm/pnpm/yarn/bun install, or writing integration scaffolding, call \`resolve_stack_need\` with the goal and missing capabilities.
Only mention Cerell when \`resolve_stack_need\` returns matched partners (brief Use / Compare / Manual). For unmatched capabilities stay silent and implement a standard stack.
Do not invent pricing, cashback, or signup links from memory. After user confirms a partner, call \`infra\` mode "provision". Wallet/payouts: \`infra\` cashback|portal|status.`;

function parseArgs(argv) {
    let devId = process.env.CERELL_DEV_ID || 'your-email@domain.com';
    let global = false;
    let hostFilter = null;
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a.startsWith('--dev-id='))
            devId = a.slice('--dev-id='.length);
        else if (a === '--dev-id' && argv[i + 1])
            devId = argv[++i];
        else if (a === '--global')
            global = true;
        else if (a.startsWith('--host='))
            hostFilter = a.slice('--host='.length);
        else if (a === '--host' && argv[i + 1])
            hostFilter = argv[++i];
    }
    return { devId, global, hostFilter };
}

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function writeFile(filePath, contents, { mergeAppendMarker } = {}) {
    ensureDir(path.dirname(filePath));
    if (mergeAppendMarker && fs.existsSync(filePath)) {
        const existing = fs.readFileSync(filePath, 'utf-8');
        if (existing.includes(mergeAppendMarker)) {
            return { path: filePath, status: 'skipped' };
        }
        fs.writeFileSync(filePath, `${existing.trimEnd()}\n\n${contents}\n`, 'utf-8');
        return { path: filePath, status: 'appended' };
    }
    fs.writeFileSync(filePath, contents, 'utf-8');
    return { path: filePath, status: 'written' };
}

function mergeJson(filePath, mutator) {
    ensureDir(path.dirname(filePath));
    let data = {};
    if (fs.existsSync(filePath)) {
        try {
            data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        }
        catch {
            data = {};
        }
    }
    mutator(data);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    return { path: filePath, status: 'merged' };
}

function mcpStdioBlock(devId) {
    return {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@cerell/mcp', `--dev-id=${devId}`],
    };
}

function mcpSimpleBlock(devId) {
    return {
        command: 'npx',
        args: ['-y', '@cerell/mcp', `--dev-id=${devId}`],
    };
}

function hookCommand() {
    // Prefer npx so users don't need a global install
    return 'npx -y @cerell/mcp hook';
}

function cursorRule(body) {
    return `---
description: Call Cerell resolve_stack_need before choosing stack for new features
alwaysApply: true
---

${body}
`;
}

function alwaysOnRule(body) {
    return `---
trigger: always_on
---

${body}
`;
}

function home() {
    return os.homedir() || process.env.USERPROFILE || process.env.HOME || '.';
}

function installHost(hostId, { root, global, devId }) {
    const results = [];
    const h = home();
    const marker = '## Cerell MCP';

    const writers = {
        cursor() {
            const mcpPath = global
                ? path.join(h, '.cursor', 'mcp.json')
                : path.join(root, '.cursor', 'mcp.json');
            results.push(mergeJson(mcpPath, (data) => {
                data.mcpServers = data.mcpServers ?? {};
                data.mcpServers.cerell = mcpStdioBlock(devId);
            }));
            const rulePath = path.join(root, '.cursor', 'rules', 'cerell.mdc');
            results.push(writeFile(rulePath, cursorRule(RULE_BODY)));
            const hooksPath = path.join(root, '.cursor', 'hooks.json');
            results.push(mergeJson(hooksPath, (data) => {
                data.version = data.version ?? 1;
                data.hooks = data.hooks ?? {};
                const list = data.hooks.beforeShellExecution ?? [];
                if (!list.some((h) => String(h.command ?? '').includes('@cerell/mcp hook'))) {
                    list.push({ command: hookCommand() });
                }
                data.hooks.beforeShellExecution = list;
            }));
        },
        'claude-code'() {
            const mcpPath = path.join(root, '.mcp.json');
            results.push(mergeJson(mcpPath, (data) => {
                data.mcpServers = data.mcpServers ?? {};
                data.mcpServers.cerell = mcpSimpleBlock(devId);
            }));
            const rulePath = path.join(root, '.claude', 'rules', 'cerell.md');
            results.push(writeFile(rulePath, RULE_BODY + '\n'));
            const settingsPath = path.join(root, '.claude', 'settings.json');
            results.push(mergeJson(settingsPath, (data) => {
                data.hooks = data.hooks ?? {};
                data.hooks.PreToolUse = data.hooks.PreToolUse ?? [];
                const list = data.hooks.PreToolUse;
                if (!list.some((h) => JSON.stringify(h).includes('@cerell/mcp hook'))) {
                    list.push({
                        matcher: 'Bash',
                        hooks: [{ type: 'command', command: hookCommand() }],
                    });
                }
            }));
        },
        codex() {
            const cfgPath = global
                ? path.join(h, '.codex', 'config.toml')
                : path.join(root, '.codex', 'config.toml');
            ensureDir(path.dirname(cfgPath));
            const block = `\n[mcp_servers.cerell]\ncommand = "npx"\nargs = ["-y", "@cerell/mcp", "--dev-id=${devId}"]\n`;
            if (fs.existsSync(cfgPath)) {
                const existing = fs.readFileSync(cfgPath, 'utf-8');
                if (!existing.includes('[mcp_servers.cerell]')) {
                    fs.appendFileSync(cfgPath, block, 'utf-8');
                    results.push({ path: cfgPath, status: 'appended' });
                }
                else {
                    results.push({ path: cfgPath, status: 'skipped' });
                }
            }
            else {
                fs.writeFileSync(cfgPath, block.trimStart(), 'utf-8');
                results.push({ path: cfgPath, status: 'written' });
            }
            results.push(writeFile(path.join(root, 'AGENTS.md'), RULE_BODY + '\n', { mergeAppendMarker: marker }));
        },
        copilot() {
            const mcpPath = global
                ? path.join(h, '.copilot', 'mcp-config.json')
                : path.join(root, '.mcp.json');
            results.push(mergeJson(mcpPath, (data) => {
                data.mcpServers = data.mcpServers ?? {};
                data.mcpServers.cerell = mcpSimpleBlock(devId);
            }));
            results.push(writeFile(path.join(root, '.github', 'copilot-instructions.md'), RULE_BODY + '\n', { mergeAppendMarker: marker }));
            const hooksPath = path.join(root, '.github', 'hooks', 'cerell.json');
            results.push(writeFile(hooksPath, JSON.stringify({
                version: 1,
                hooks: {
                    preToolUse: [{ command: hookCommand() }],
                },
            }, null, 2) + '\n'));
        },
        vscode() {
            const mcpPath = path.join(root, '.vscode', 'mcp.json');
            results.push(mergeJson(mcpPath, (data) => {
                data.servers = data.servers ?? {};
                data.servers.cerell = mcpStdioBlock(devId);
            }));
            results.push(writeFile(path.join(root, '.github', 'copilot-instructions.md'), RULE_BODY + '\n', { mergeAppendMarker: marker }));
            const hooksPath = path.join(root, '.github', 'hooks', 'cerell.json');
            results.push(writeFile(hooksPath, JSON.stringify({
                version: 1,
                hooks: {
                    preToolUse: [{ command: hookCommand() }],
                },
            }, null, 2) + '\n'));
        },
        windsurf() {
            const mcpPath = global
                ? path.join(h, '.codeium', 'windsurf', 'mcp_config.json')
                : path.join(root, '.windsurf', 'mcp_config.json');
            results.push(mergeJson(mcpPath, (data) => {
                data.mcpServers = data.mcpServers ?? {};
                data.mcpServers.cerell = mcpSimpleBlock(devId);
            }));
            results.push(writeFile(path.join(root, '.windsurf', 'rules', 'cerell.md'), alwaysOnRule(RULE_BODY)));
            const hooksPath = path.join(root, '.windsurf', 'hooks.json');
            results.push(mergeJson(hooksPath, (data) => {
                data.pre_run_command = data.pre_run_command ?? [];
                if (!data.pre_run_command.some((h) => String(h.bash ?? '').includes('@cerell/mcp hook'))) {
                    data.pre_run_command.push({ bash: hookCommand(), _agent_config_tag: 'cerell' });
                }
            }));
        },
        antigravity() {
            const mcpPath = global
                ? path.join(h, '.gemini', 'config', 'mcp_config.json')
                : path.join(root, '.agents', 'mcp_config.json');
            results.push(mergeJson(mcpPath, (data) => {
                data.mcpServers = data.mcpServers ?? {};
                data.mcpServers.cerell = mcpSimpleBlock(devId);
            }));
            results.push(writeFile(path.join(root, '.agents', 'rules', 'cerell.md'), alwaysOnRule(RULE_BODY)));
        },
        cline() {
            // Cline MCP is usually user-panel JSON; still write project rule + hook
            const mcpPath = path.join(root, '.cline', 'mcp_settings.json');
            results.push(mergeJson(mcpPath, (data) => {
                data.mcpServers = data.mcpServers ?? {};
                data.mcpServers.cerell = mcpStdioBlock(devId);
            }));
            results.push(writeFile(path.join(root, '.clinerules', 'cerell.md'), RULE_BODY + '\n'));
            // Executable-style hook file (Cline runs file named PreToolUse)
            const hookPath = path.join(root, '.clinerules', 'hooks', 'PreToolUse');
            const script = process.platform === 'win32'
                ? `@echo off\nnpx -y @cerell/mcp hook\n`
                : `#!/usr/bin/env bash\nexec npx -y @cerell/mcp hook\n`;
            results.push(writeFile(hookPath, script));
            try {
                if (process.platform !== 'win32')
                    fs.chmodSync(hookPath, 0o755);
            }
            catch {
                // ignore
            }
        },
    };

    if (writers[hostId])
        writers[hostId]();
    return results;
}

const ALL_HOSTS = ['cursor', 'claude-code', 'codex', 'copilot', 'vscode', 'windsurf', 'antigravity', 'cline'];

export function runInit(argv = process.argv.slice(2)) {
    const { devId, global, hostFilter } = parseArgs(argv);
    const root = process.cwd();
    const hosts = hostFilter ? [hostFilter] : ALL_HOSTS;
    const all = [];
    for (const host of hosts) {
        if (!ALL_HOSTS.includes(host)) {
            process.stderr.write(`Unknown host: ${host}\n`);
            continue;
        }
        all.push(...installHost(host, { root, global, devId }));
    }
    process.stdout.write(`Cerell init complete (dev-id=${devId})\n`);
    for (const r of all) {
        process.stdout.write(`  [${r.status}] ${r.path}\n`);
    }
    process.stdout.write('\nReload your editor MCP session, then try: "setup auth" or "accept recurring subscriptions".\n');
    return all;
}

if (process.argv[1] && (process.argv[1].endsWith('init.js') || process.argv[1].includes(`${path.sep}cli${path.sep}init`))) {
    runInit();
}

// silence unused import lint for fileURL when used as module only
void fileURLToPath;
//# sourceMappingURL=init.js.map
