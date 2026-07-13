import { db } from "@/lib/store";
import { resolveViewer } from "@/lib/auth";

type ConversationRow = { citations: string; trace: string; [key: string]: unknown };
type SessionRow = { id: string; displayName: string; mode: "employee" | "guest"; createdAt: string; updatedAt: string; accountId: string | null };

function canView(viewer: Awaited<ReturnType<typeof resolveViewer>>, target: SessionRow) {
  if (!viewer) return false;
  if (viewer.role === "admin") return true;
  if (viewer.mode === "guest") return viewer.id === target.id;
  return target.mode === "employee" && (target.accountId === viewer.accountId || (!target.accountId && viewer.displayName.trim().toLowerCase() === target.displayName.trim().toLowerCase()));
}

export async function GET(request: Request) {
  const d1 = await db();
  const params = new URL(request.url).searchParams;
  const requestedSessionId = params.get("sessionId");
  const [documents, tickets] = await Promise.all([
    d1.prepare("SELECT id, name, content_type AS contentType, status, chunk_count AS chunkCount, created_at AS createdAt FROM documents ORDER BY created_at DESC").all(),
    d1.prepare("SELECT * FROM tickets ORDER BY updated_at DESC").all(),
  ]);

  const viewer = await resolveViewer(request, d1);
  if (!viewer) return Response.json({ error: "当前身份已失效，请重新新建对话" }, { status: 401 });

  let sessionQuery;
  if (viewer.role === "admin") {
    sessionQuery = d1.prepare("SELECT id, display_name AS displayName, mode, created_at AS createdAt, updated_at AS updatedAt, account_id AS accountId FROM agent_sessions ORDER BY updated_at DESC");
  } else if (viewer.mode === "guest") {
    sessionQuery = d1.prepare("SELECT id, display_name AS displayName, mode, created_at AS createdAt, updated_at AS updatedAt, account_id AS accountId FROM agent_sessions WHERE id = ? ORDER BY updated_at DESC").bind(viewer.id);
  } else {
    sessionQuery = d1.prepare("SELECT id, display_name AS displayName, mode, created_at AS createdAt, updated_at AS updatedAt, account_id AS accountId FROM agent_sessions WHERE mode = 'employee' AND (account_id = ? OR (account_id IS NULL AND lower(trim(display_name)) = lower(trim(?)))) ORDER BY updated_at DESC").bind(viewer.accountId, viewer.displayName);
  }
  const sessions = await sessionQuery.all<SessionRow>();
  const requested = sessions.results.find(session => session.id === requestedSessionId);
  const target = requested || sessions.results.find(session => session.id === viewer.id);
  if (!target) return Response.json({ error: "没有可访问的对话" }, { status: 403 });
  if (!canView(viewer, target)) return Response.json({ error: "无权查看该对话" }, { status: 403 });

  const conversations = await d1.prepare("SELECT * FROM (SELECT * FROM conversations WHERE session_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 200) ORDER BY created_at ASC").bind(target.id).all<ConversationRow>();
  return Response.json({
    documents: documents.results,
    tickets: tickets.results,
    sessions: sessions.results,
    viewerSessionId: viewer.id,
    viewerRole: viewer.role,
    activeSessionId: target.id,
    conversations: conversations.results.map(row => ({ ...row, citations: JSON.parse(row.citations), trace: JSON.parse(row.trace) })),
  });
}
