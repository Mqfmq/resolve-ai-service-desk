import { db, id } from "@/lib/store";

export async function GET() {
  const d1 = await db();
  const result = await d1.prepare("SELECT id, display_name AS displayName, mode, created_at AS createdAt, updated_at AS updatedAt FROM agent_sessions ORDER BY updated_at DESC").all();
  return Response.json({ sessions: result.results });
}

export async function POST(request: Request) {
  const body = await request.json() as { mode?: "employee" | "guest"; displayName?: string };
  const mode = body.mode === "guest" ? "guest" : "employee";
  const cleanName = body.displayName?.trim().slice(0, 30);
  if (mode === "employee" && !cleanName) return Response.json({ error: "请输入员工姓名" }, { status: 400 });
  const sessionId = id("session");
  const displayName = mode === "guest" ? `游客 ${sessionId.slice(-4).toUpperCase()}` : cleanName!;
  const now = new Date().toISOString();
  const d1 = await db();
  await d1.prepare("INSERT INTO agent_sessions VALUES (?, ?, ?, ?, ?)").bind(sessionId, displayName, mode, now, now).run();
  return Response.json({ id: sessionId, displayName, mode, createdAt: now, updatedAt: now });
}
