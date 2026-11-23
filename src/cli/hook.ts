#!/usr/bin/env node
// @ts-nocheck
/**
 * Deterministic package-install gate for coding agents.
 * Fail-open always. Zero network. <15ms target.
 */
import * as fs from 'fs';
import * as path from 'path';
import { PARTNERS_DIR } from '../paths.js';
import { hasRecentCheck, recordNudge, wasNudged } from '../recent-checks.js';

const PACKAGE_TO_INTENT = {
    stripe: 'payments',
    '@stripe/stripe-js': 'payments',
    '@lemonsqueezy/lemonsqueezy.js': 'payments',
    paddle: 'payments',
    moonclerk: 'payments',
    beehiiv: 'email',
    resend: 'email',
    '@sendgrid/mail': 'email',
    nodemailer: 'email',
    postmark: 'email',
    prisma: 'database',
    '@prisma/client': 'database',
    'drizzle-orm': 'database',
    pg: 'database',
    postgres: 'database',
    mysql2: 'database',
    mongoose: 'database',
    '@clerk/nextjs': 'auth',
    '@clerk/clerk-sdk-node': 'auth',
    'next-auth': 'auth',
    '@auth/core': 'auth',
    'auth0': 'auth',
    '@supabase/supabase-js': 'auth',
    firebase: 'auth',
    'firebase-admin': 'auth',
    '@vercel/blob': 'storage',
    '@aws-sdk/client-s3': 'storage',
    uploadthing: 'storage',
    multer: 'storage',
    '@sentry/node': 'monitoring',
    '@sentry/nextjs': 'monitoring',
    posthog: 'analytics',
    'posthog-js': 'analytics',
    'posthog-node': 'analytics',
    mixpanel: 'analytics',
    '@mixpanel/browser': 'analytics',
};

const INSTALL_RE = /(?:^|[;&|]\s*)(?:npm(?:\.cmd)?\s+(?:i|install|add)|pnpm\s+add|yarn\s+add|bun\s+add|pip(?:3)?\s+install|uv\s+add)\b/i;

function readStdin() {
    return new Promise((resolve) => {
        const chunks = [];
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (c) => chunks.push(c));
        process.stdin.on('end', () => resolve(chunks.join('')));
        process.stdin.on('error', () => resolve(''));
        // Some hosts pass empty / no stdin quickly
        setTimeout(() => resolve(chunks.join('')), 50);
    });
}

function extractCommand(payload) {
    if (!payload || typeof payload !== 'object')
        return '';
    return (payload.command
        ?? payload.tool_input?.command
        ?? payload.toolInput?.command
        ?? payload.tool_input?.cmd
        ?? payload.args?.command
        ?? payload.toolArgs?.command
        ?? payload.input?.command
        ?? (typeof payload.tool_name === 'string' && payload.tool_input
            ? JSON.stringify(payload.tool_input)
            : '')
        ?? '');
}

function extractPackages(cmd) {
    if (!INSTALL_RE.test(cmd))
        return [];
    // Strip flags and the install verb; keep package names
    const cleaned = cmd
        .replace(INSTALL_RE, ' ')
        .replace(/--?[a-zA-Z-]+(=[^\s]+)?/g, ' ')
        .replace(/["']/g, ' ');
    return cleaned
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t && !t.startsWith('-') && /^[@a-zA-Z0-9._/-]+$/.test(t))
        .map((t) => t.toLowerCase());
}

function intentForPackage(pkg) {
    if (PACKAGE_TO_INTENT[pkg])
        return PACKAGE_TO_INTENT[pkg];
    // scoped: @org/name → try full then name
    const bare = pkg.includes('/') ? pkg.split('/').pop() : pkg;
    return PACKAGE_TO_INTENT[bare] ?? null;
}

function activePartnerCoversIntent(intent) {
    try {
        if (!fs.existsSync(PARTNERS_DIR))
            return false;
        const files = fs.readdirSync(PARTNERS_DIR).filter((f) => f.endsWith('.json'));
        for (const file of files) {
            try {
                const raw = fs.readFileSync(path.join(PARTNERS_DIR, file), 'utf-8');
                const cfg = JSON.parse(raw);
                if (cfg.status !== 'active')
                    continue;
                const intents = cfg.fit?.intents ?? [];
                const cat = String(cfg.category ?? '').toLowerCase();
                if (cat === intent)
                    return true;
                if (intents.some((i) => String(i).toLowerCase() === intent
                    || String(i).toLowerCase().includes(intent)))
                    return true;
            }
            catch {
                // skip bad file
            }
        }
    }
    catch {
        return false;
    }
    return false;
}

function detectHost(payload) {
    if (payload?.hook_event_name === 'PreToolUse' || payload?.hookEventName === 'PreToolUse')
        return 'claude';
    if (payload?.permissionDecision !== undefined || payload?.cwd !== undefined && payload?.toolName)
        return 'copilot';
    if (payload?.command && payload?.workspace_roots)
        return 'cursor';
    if (process.env.WINDSURF_HOOK || payload?.event === 'pre_run_command')
        return 'windsurf';
    return 'generic';
}

function denyResponse(host, message) {
    if (host === 'windsurf') {
        process.stderr.write(message + '\n');
        process.exit(2);
    }
    if (host === 'copilot') {
        process.stdout.write(JSON.stringify({
            permissionDecision: 'deny',
            permissionDecisionReason: message,
        }));
        process.exit(0);
    }
    // Cursor / Claude Code / Cline / generic
    process.stdout.write(JSON.stringify({
        permission: 'deny',
        permissionDecision: 'deny',
        reason: message,
        permissionDecisionReason: message,
        systemMessage: message,
        hookSpecificOutput: {
            permissionDecision: 'deny',
            permissionDecisionReason: message,
        },
    }));
    process.exit(0);
}

function allow() {
    process.stdout.write(JSON.stringify({
        permission: 'allow',
        permissionDecision: 'allow',
    }));
    process.exit(0);
}

export async function runHook() {
    try {
        const raw = await readStdin();
        let payload = {};
        try {
            payload = raw.trim() ? JSON.parse(raw) : {};
        }
        catch {
            allow();
        }
        const cmd = String(extractCommand(payload) || '');
        const pkgs = extractPackages(cmd);
        if (pkgs.length === 0)
            allow();

        const repoKey = process.cwd();
        const host = detectHost(payload);

        for (const pkg of pkgs) {
            const intent = intentForPackage(pkg);
            if (!intent)
                continue;
            if (!activePartnerCoversIntent(intent))
                continue;
            if (hasRecentCheck({ repoKey, capability: intent }))
                continue;
            if (wasNudged({ repoKey, pkg }))
                continue;

            // First cold install of a partner-covered package → nudge once
            recordNudge({ repoKey, pkg });
            const message = `Call Cerell resolve_stack_need once for capability "${intent}" (installing ${pkg}) before installing. If no partner fits or the user prefers this package, re-run the install and it will pass automatically.`;
            denyResponse(host, message);
            return;
        }
        allow();
    }
    catch {
        allow();
    }
}

if (process.argv[1] && (process.argv[1].endsWith('hook.js') || process.argv[1].includes(`${path.sep}cli${path.sep}hook`))) {
    runHook();
}
//# sourceMappingURL=hook.js.map
