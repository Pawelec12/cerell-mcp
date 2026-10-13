#!/usr/bin/env node
/**
 * Build cerell.mcpb for Smithery / Claude Desktop local install.
 * Usage: node scripts/pack-mcpb.mjs
 */
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stage = path.join(root, '.mcpb-stage');
const out = path.join(root, 'cerell.mcpb');

function run(cmd, args, cwd = root) {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log('1/5 build');
run('npm', ['run', 'build']);

console.log('2/5 stage');
rmSync(stage, { recursive: true, force: true });
mkdirSync(path.join(stage, 'server'), { recursive: true });
cpSync(path.join(root, 'dist'), path.join(stage, 'server'), { recursive: true });
cpSync(path.join(root, 'data'), path.join(stage, 'data'), { recursive: true });
cpSync(path.join(root, 'mcpb', 'manifest.json'), path.join(stage, 'manifest.json'));

const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
writeFileSync(
  path.join(stage, 'package.json'),
  JSON.stringify(
    {
      name: 'cerell-mcp',
      version: pkg.version,
      type: 'module',
      private: true,
      dependencies: pkg.dependencies,
    },
    null,
    2,
  ),
);

console.log('3/5 production node_modules');
run('npm', ['install', '--omit=dev', '--ignore-scripts'], stage);

console.log('4/5 pack');
if (existsSync(out)) rmSync(out);
run('npx', ['--yes', '@anthropic-ai/mcpb', 'pack', stage, out]);

console.log('5/5 done →', out);
console.log('\nPublish to Smithery:');
console.log(`  npx @smithery/cli mcp publish ${out} -n apptent/cerell`);
