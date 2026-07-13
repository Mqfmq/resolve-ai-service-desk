import { env } from "cloudflare:workers";

type RuntimeEnv = {
  DB: D1Database;
  FILES?: R2Bucket;
  DEEPSEEK_API_KEY?: string;
  OPENAI_API_KEY?: string;
  MQF_ADMIN_PASSWORD?: string;
  AUTH_SECRET?: string;
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
    d1.prepare(`CREATE TABLE IF NOT EXISTS agent_sessions (id TEXT PRIMARY KEY, display_name TEXT NOT NULL, mode TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS app_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS employee_accounts (id TEXT PRIMARY KEY, display_name TEXT NOT NULL, normalized_name TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, role TEXT NOT NULL, created_at TEXT NOT NULL)`),
    d1.prepare(`CREATE INDEX IF NOT EXISTS documents_created_idx ON documents(created_at)`),
    d1.prepare(`CREATE INDEX IF NOT EXISTS tickets_status_idx ON tickets(status)`),
  ]);
  const conversationColumns = await d1.prepare("PRAGMA table_info(conversations)").all<{ name: string }>();
  if (!conversationColumns.results.some(column => column.name === "session_id")) {
    await d1.prepare("ALTER TABLE conversations ADD COLUMN session_id TEXT NOT NULL DEFAULT 'legacy'").run();
  }
  const sessionColumns = await d1.prepare("PRAGMA table_info(agent_sessions)").all<{ name: string }>();
  if (!sessionColumns.results.some(column => column.name === "account_id")) await d1.prepare("ALTER TABLE agent_sessions ADD COLUMN account_id TEXT").run();
  if (!sessionColumns.results.some(column => column.name === "auth_token_hash")) await d1.prepare("ALTER TABLE agent_sessions ADD COLUMN auth_token_hash TEXT").run();
  const now = new Date().toISOString();
  await d1.prepare("INSERT OR IGNORE INTO agent_sessions (id, display_name, mode, created_at, updated_at) VALUES ('legacy', '历史会话', 'guest', ?, ?)").bind(now, now).run();
  const seedVersion = await d1.prepare("SELECT value FROM app_metadata WHERE key = 'knowledge_seed_version'").first<{ value: string }>();
  if (seedVersion?.value !== "2") {
    await seed(d1);
    await d1.prepare("INSERT INTO app_metadata (key, value) VALUES ('knowledge_seed_version', '2') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  }
  ready = true;
  return d1;
}

async function seed(d1: D1Database) {
  const now = new Date().toISOString();
  const docs = [
    ["doc-login", "企业账号登录故障处理指南.md", "账号连续 5 次登录失败会被锁定 30 分钟。若重置密码后仍无法登录，请记录错误码、发生时间与账号邮箱，并检查单点登录状态。错误码 SSO-403 通常表示企业身份服务未授权，应创建“账号与权限”高优先级工单。"],
    ["doc-refund", "退款与售后政策.md", "标准套餐可在购买后 7 天内申请退款。企业年付套餐需由管理员提交，并附订单号。已使用超过 20% 配额的订单将转人工审核，处理时效为 2 个工作日。"],
    ["doc-sla", "客户支持 SLA.md", "紧急故障 P0 响应时间 15 分钟；高优先级 P1 响应时间 1 小时；普通问题 P2 在 8 个工作小时内响应。涉及安全、数据泄露或大面积服务不可用的问题必须立即升级人工。"],
    ["doc-api-limit", "API 调用与限流处理.md", "API 默认速率限制为每分钟 60 次请求。收到 HTTP 429 时，应读取 Retry-After 响应头并采用指数退避重试，首次等待至少 2 秒。企业高级套餐可申请提高配额，需提供应用 ID、峰值 QPS、业务场景和预计调用量。连续大量重试会触发 10 分钟临时封禁。"],
    ["doc-billing", "账单、发票与付款说明.md", "电子发票可由企业管理员在控制台的“账单与用量”页面申请。增值税专用发票需填写企业名称、统一社会信用代码、开户行及账号。月结客户应在账单生成后 15 天内完成付款；付款失败会有 3 天宽限期，宽限期结束后写入功能将暂停。"],
    ["doc-security", "数据安全与隐私事件响应.md", "平台传输使用 TLS 加密，企业数据默认静态加密。发现疑似数据泄露、异常下载、密钥暴露或未授权访问时，不得在普通工单中粘贴敏感数据；应立即吊销相关密钥、保留时间与 IP 等审计信息，并创建 P0 安全事件交由人工处理。"],
    ["doc-members", "企业成员与权限管理.md", "企业角色分为所有者、管理员、成员和只读成员。只有所有者可以转移组织所有权和删除企业；管理员可以邀请成员、配置单点登录和管理账单，但不能删除所有者。成员离职时应先停用账号，再转移其工单与资源，最后移除成员。"],
    ["doc-incident", "服务故障排查与状态通知.md", "遇到页面无法访问或接口 5xx 时，先检查状态页与本地网络，再记录请求 ID、发生时间、区域、浏览器或 SDK 版本。单个用户受影响按 P2 处理；多个团队同时受影响按 P1；核心服务大面积不可用按 P0，必须立即升级并每 30 分钟同步进展。"],
    ["doc-plans", "套餐升级、降级与配额.md", "套餐升级即时生效，费用按当前计费周期剩余天数折算。降级在下一个计费周期生效；若当前成员数、存储量或调用量超过目标套餐限制，需先降低用量。企业套餐的席位、存储和 API 配额可以单独扩容。"],
    ["doc-export", "数据导出、保留与删除.md", "管理员可以导出工单、对话和审计日志，导出文件生成后保留 7 天。已关闭工单默认保留 365 天，审计日志保留 180 天。企业删除申请需所有者确认，进入 30 天恢复期后永久清除；安全或合规冻结的数据不受普通删除申请影响。"],
    ["doc-onboarding", "企业接入与上线检查清单.md", "企业上线前应完成域名验证、管理员设置、成员导入、角色分配、单点登录测试、知识库导入和通知渠道配置。正式切换前至少完成一次登录、工单创建、权限隔离和数据导出演练，并指定业务负责人和安全联系人。"],
    ["doc-password", "密码、多因素认证与密钥安全.md", "密码至少 12 位，建议使用密码管理器。企业管理员可强制启用多因素认证。恢复码只能使用一次并应离线保存。API Key 不得写入代码仓库、聊天记录或客户端页面；一旦暴露应立即吊销并重新生成，同时检查最近调用日志。"],
  ];
  await d1.batch(docs.map(([id, name, content]) => d1.prepare("INSERT OR IGNORE INTO documents VALUES (?, ?, 'text/markdown', ?, 'ready', 1, ?)").bind(id, name, content, now)));
  await d1.prepare("INSERT OR IGNORE INTO tickets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind("TK-1042", "企业账号无法登录", "重置密码后仍提示 SSO-403", "账号与权限", "high", "open", "林小满", now, now).run();
}

export function files() { return runtime.FILES; }
export function deepSeekKey() { return runtime.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY; }
export function openAIKey() { return runtime.OPENAI_API_KEY || process.env.OPENAI_API_KEY; }
export function adminPassword() { return runtime.MQF_ADMIN_PASSWORD || process.env.MQF_ADMIN_PASSWORD; }
export function authSecret() { return runtime.AUTH_SECRET || process.env.AUTH_SECRET; }
export function id(prefix: string) { return `${prefix}-${crypto.randomUUID().slice(0, 8)}`; }
