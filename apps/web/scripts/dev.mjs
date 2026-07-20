/**
 * dev 启动器 - 在 next dev 之前注入 NO_PROXY，让 Supabase 域名绕过本地代理直连。
 *
 * 背景：Clash/V2Ray 等本地代理节点经常返回签给自身 IP 的证书，
 * 导致 Node.js fetch 报 ERR_TLS_CERT_ALTNAME_INVALID。
 * Supabase 在亚洲有直连节点，不走代理更稳定。
 *
 * 用法：npm run dev   （内部调用本脚本）
 */
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

// 需要绕过代理的域名（Supabase + 本地开发地址）
const BYPASS = '*.supabase.co,supabase.co,localhost,127.0.0.1';

const existing = process.env.NO_PROXY || '';
process.env.NO_PROXY = existing
  ? `${existing},${BYPASS}`
  : BYPASS;

// undici 同时读取小写变量
if (!process.env.no_proxy) {
  process.env.no_proxy = process.env.NO_PROXY;
}

// 通过 node 直接调用 next 的 JS 入口，跨平台且无 shell 注入风险
// （Windows 上 node_modules/.bin/next 实际是 .cmd/.ps1，spawn 无法直接执行）
const nextEntry = resolve('node_modules/next/dist/bin/next');
const args = [nextEntry, 'dev', ...process.argv.slice(2)];
const child = spawn(process.execPath, args, {
  stdio: 'inherit',
  env: { ...process.env },
});

child.on('exit', (code) => process.exit(code ?? 0));
