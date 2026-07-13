import { authCookie, clearAuthCookie, passwordHash, randomHex, resolveViewer, tokenHash, verifyPassword } from "@/lib/auth";
import { adminPassword, db, id } from "@/lib/store";

type Account = { id: string; displayName: string; passwordHash: string; passwordSalt: string; role: "admin" | "employee" };

export async function GET(request: Request) {
  const d1 = await db();
  const viewer = await resolveViewer(request, d1);
  if (!viewer) return Response.json({ error: "请先登录" }, { status: 401 });
  return Response.json({ viewer });
}

export async function POST(request: Request) {
  try {
  const body = await request.json() as { action?: "newConversation"; mode?: "employee" | "guest"; displayName?: string; password?: string };
  if (body.action === "newConversation") {
    const d1 = await db();
    const viewer = await resolveViewer(request, d1);
    if (!viewer) return Response.json({ error: "登录状态已失效，请重新登录" }, { status: 401 });
    if (viewer.mode !== "employee" || !viewer.accountId) return Response.json({ error: "游客模式请重新选择身份" }, { status: 403 });

    const sessionId = id("session");
    const now = new Date().toISOString();
    await d1.prepare("INSERT INTO agent_sessions (id, display_name, mode, created_at, updated_at, account_id, auth_token_hash) VALUES (?, ?, 'employee', ?, ?, ?, NULL)")
      .bind(sessionId, viewer.displayName, now, now, viewer.accountId)
      .run();
    return Response.json({ id: sessionId, displayName: viewer.displayName, mode: "employee", role: viewer.role, createdAt: now, updatedAt: now });
  }

  const mode = body.mode === "guest" ? "guest" : "employee";
  const cleanName = body.displayName?.trim().slice(0, 30);
  const password = body.password || "";
  if (mode === "employee" && !cleanName) return Response.json({ error: "请输入员工姓名" }, { status: 400 });
  if (mode === "employee" && password.length < 8) return Response.json({ error: "密码至少需要 8 位" }, { status: 400 });

  const d1 = await db();
  let accountId: string | null = null;
  let displayName: string;
  let role: "admin" | "employee" | "guest" = "guest";

  if (mode === "guest") {
    displayName = `游客 ${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
  } else {
    const normalizedName = cleanName!.toLowerCase();
    let account = await d1.prepare("SELECT id, display_name AS displayName, password_hash AS passwordHash, password_salt AS passwordSalt, role FROM employee_accounts WHERE normalized_name = ?").bind(normalizedName).first<Account>();
    if (!account) {
      if (normalizedName === "mqf") {
        const configured = adminPassword();
        if (!configured || password !== configured) return Response.json({ error: "mqf 管理员密码不正确" }, { status: 401 });
        role = "admin";
      } else {
        role = "employee";
      }
      const salt = randomHex(16);
      const hashed = await passwordHash(password, salt);
      accountId = id("account");
      await d1.prepare("INSERT INTO employee_accounts VALUES (?, ?, ?, ?, ?, ?, ?)").bind(accountId, cleanName, normalizedName, hashed, salt, role, new Date().toISOString()).run();
      account = { id: accountId, displayName: cleanName!, passwordHash: hashed, passwordSalt: salt, role };
    } else if (!(await verifyPassword(password, account.passwordSalt, account.passwordHash))) {
      return Response.json({ error: "员工姓名或密码错误" }, { status: 401 });
    }
    accountId = account.id;
    displayName = account.displayName;
    role = account.role;
  }

  const sessionId = id("session");
  const token = randomHex(32);
  const hashedToken = await tokenHash(token);
  const now = new Date().toISOString();
  await d1.prepare("INSERT INTO agent_sessions (id, display_name, mode, created_at, updated_at, account_id, auth_token_hash) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(sessionId, displayName, mode, now, now, accountId, hashedToken).run();
  const secure = new URL(request.url).protocol === "https:";
    return Response.json({ id: sessionId, displayName, mode, role, createdAt: now, updatedAt: now }, { headers: { "Set-Cookie": authCookie(token, secure) } });
  } catch (error) {
    console.error("session login failed", error);
    return Response.json({ error: "登录服务暂不可用" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const d1 = await db();
  const viewer = await resolveViewer(request, d1);

  const targetSessionId = new URL(request.url).searchParams.get("sessionId");
  if (targetSessionId) {
    if (!viewer) return Response.json({ error: "请先登录" }, { status: 401 });
    if (targetSessionId === viewer.id) return Response.json({ error: "当前登录会话不能删除，请先退出登录" }, { status: 400 });

    const target = await d1.prepare("SELECT id, display_name AS displayName, mode, account_id AS accountId FROM agent_sessions WHERE id = ?")
      .bind(targetSessionId)
      .first<{ id: string; displayName: string; mode: "employee" | "guest"; accountId: string | null }>();
    if (!target) return Response.json({ error: "对话不存在或已被删除" }, { status: 404 });

    const sameEmployee = viewer.mode === "employee" && target.mode === "employee" && (
      (viewer.accountId !== null && target.accountId === viewer.accountId) ||
      (target.accountId === null && viewer.displayName.trim().toLowerCase() === target.displayName.trim().toLowerCase())
    );
    if (viewer.role !== "admin" && !sameEmployee) return Response.json({ error: "无权删除该对话" }, { status: 403 });

    await d1.batch([
      d1.prepare("DELETE FROM conversations WHERE session_id = ?").bind(targetSessionId),
      d1.prepare("DELETE FROM conversation_memory WHERE id = ?").bind(targetSessionId),
      d1.prepare("DELETE FROM agent_sessions WHERE id = ?").bind(targetSessionId),
    ]);
    return Response.json({ ok: true });
  }

  if (viewer) await d1.prepare("UPDATE agent_sessions SET auth_token_hash = NULL WHERE id = ?").bind(viewer.id).run();
  const secure = new URL(request.url).protocol === "https:";
  return Response.json({ ok: true }, { headers: { "Set-Cookie": clearAuthCookie(secure) } });
}
