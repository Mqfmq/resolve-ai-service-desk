import { db, id } from "@/lib/store";
import { resolveViewer } from "@/lib/auth";

export async function POST(request: Request) {
  const d1 = await db();
  const viewer = await resolveViewer(request, d1);
  if (!viewer || viewer.mode !== "employee") return Response.json({ error: "只有已登录员工可以手动创建工单" }, { status: 403 });
  const body = await request.json() as Record<string, string>;
  if (!body.title?.trim()) return Response.json({ error: "工单标题不能为空" }, { status: 400 });
  const now = new Date().toISOString();
  const ticket = { id: id("TK").toUpperCase(), title: body.title.trim(), description: body.description || "", category: body.category || "其他", priority: body.priority || "medium", status: "open", requester: body.requester || "访客用户", createdAt: now, updatedAt: now };
  await d1.prepare("INSERT INTO tickets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(ticket.id, ticket.title, ticket.description, ticket.category, ticket.priority, ticket.status, ticket.requester, now, now).run();
  return Response.json(ticket);
}

export async function PATCH(request: Request) {
  const d1 = await db();
  const viewer = await resolveViewer(request, d1);
  if (!viewer || viewer.mode !== "employee") return Response.json({ error: "只有已登录员工可以更新工单" }, { status: 403 });
  const body = await request.json() as { id?: string; status?: string; priority?: string };
  if (!body.id) return Response.json({ error: "缺少工单 ID" }, { status: 400 });
  await d1.prepare("UPDATE tickets SET status = COALESCE(?, status), priority = COALESCE(?, priority), updated_at = ? WHERE id = ?").bind(body.status || null, body.priority || null, new Date().toISOString(), body.id).run();
  return Response.json({ ok: true });
}
