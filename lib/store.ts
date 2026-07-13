import { env } from "cloudflare:workers";

type RuntimeEnv = {
  DB: D1Database;
  FILES?: R2Bucket;
  DEEPSEEK_API_KEY?: string;
  OPENAI_API_KEY?: string;
};
const runtime = env as unknown as RuntimeEnv;

let ready = false;
export async function db() {
  if (ready) return runtime.DB;
  const d1 = runtime.DB;
  await d1.batch([
    d1.prepare(`CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, name TEXT NOT NULL, content_type TEXT NOT NULL, content TEXT NOT NULL, status TEXT NOT NULL, chunk_count INTEGER NOT NULL, created_at TEXT NOT NULL)`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS tickets (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL, priority TEXT NOT NULL, status TEXT NOT NULL, requester TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, role TEXT NOT NULL, content TEXT NOT NULL, citations TEXT NOT NULL, trace TEXT NOT NULL, created_at TEXT NOT NULL)`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS conversation_memory (id TEXT PRIMARY KEY, summary TEXT NOT NULL, source_count INTEGER NOT NULL, updated_at TEXT NOT NULL)`),
    d1.prepare(`CREATE INDEX IF NOT EXISTS documents_created_idx ON documents(created_at)`),
    d1.prepare(`CREATE INDEX IF NOT EXISTS tickets_status_idx ON tickets(status)`),
  ]);
  const count = await d1.prepare("SELECT COUNT(*) AS count FROM documents").first<{ count: number }>();
  if (!count?.count) await seed(d1);
  ready = true;
  return d1;
}

async function seed(d1: D1Database) {
  const now = new Date().toISOString();
  const docs = [
    ["doc-login", "企业账号登录故障处理指南.md", "账号连续 5 次登录失败会被锁定 30 分钟。若重置密码后仍无法登录，请记录错误码、发生时间与账号邮箱，并检查单点登录状态。错误码 SSO-403 通常表示企业身份服务未授权，应创建“账号与权限”高优先级工单。"],
    ["doc-refund", "退款与售后政策.md", "标准套餐可在购买后 7 天内申请退款。企业年付套餐需由管理员提交，并附订单号。已使用超过 20% 配额的订单将转人工审核，处理时效为 2 个工作日。"],
    ["doc-sla", "客户支持 SLA.md", "紧急故障 P0 响应时间 15 分钟；高优先级 P1 响应时间 1 小时；普通问题 P2 在 8 个工作小时内响应。涉及安全、数据泄露或大面积服务不可用的问题必须立即升级人工。"],
  ];
  await d1.batch(docs.map(([id, name, content]) => d1.prepare("INSERT INTO documents VALUES (?, ?, 'text/markdown', ?, 'ready', 1, ?)").bind(id, name, content, now)));
  await d1.prepare("INSERT INTO tickets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind("TK-1042", "企业账号无法登录", "重置密码后仍提示 SSO-403", "账号与权限", "high", "open", "林小满", now, now).run();
}

export function files() { return runtime.FILES; }
export function deepSeekKey() { return runtime.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY; }
export function openAIKey() { return runtime.OPENAI_API_KEY || process.env.OPENAI_API_KEY; }
export function id(prefix: string) { return `${prefix}-${crypto.randomUUID().slice(0, 8)}`; }
