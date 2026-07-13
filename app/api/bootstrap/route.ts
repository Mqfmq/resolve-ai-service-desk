import { db } from "@/lib/store";

type ConversationRow = { citations: string; trace: string; [key: string]: unknown };
type SessionRow = { id: string; displayName: string; mode: "employee" | "guest"; createdAt: string; updatedAt: string };

function canView(viewer: SessionRow, target: SessionRow) {
  if (viewer.displayName.trim().toLowerCase() === "mqf") return true;
  if (viewer.mode === "guest") return viewer.id === target.id;
  return target.mode === "employee" && viewer.displayName.trim().toLowerCase() === target.displayName.trim().toLowerCase();
}

export async function GET(request: Request) {
  const d1 = await db();
  const params = new URL(request.url).searchParams;
  const viewerSessionId = params.get("viewerSessionId");
  const requestedSessionId = params.get("sessionId");
  const [documents, tickets] = await Promise.all([
    d1.prepare("SELECT id, name, content_type AS contentType, status, chunk_count AS chunkCount, created_at AS createdAt FROM documents ORDER BY created_at DESC").all(),
    d1.prepare("SELECT * FROM tickets ORDER BY updated_at DESC").all(),
  ]);

  if (!viewerSessionId) return Response.json({ documents: documents.results, tickets: tickets.results, sessions: [], conversations: [], activeSessionId: null });
  const viewer = await d1.prepare("SELECT id, display_name AS displayName, mode, created_at AS createdAt, updated_at AS updatedAt FROM agent_sessions WHERE id = ?").bind(viewerSessionId).first<SessionRow>();
  if (!viewer) return Response.json({ error: "当前身份已失效，请重新新建对话" }, { status: 401 });

  let sessionQuery;
  if (viewer.displayName.trim().toLowerCase() === "mqf") {
    sessionQuery = d1.prepare("SELECT id, display_name AS displayName, mode, created_at AS createdAt, updated_at AS updatedAt FROM agent_sessions ORDER BY updated_at DESC");
  } else if (viewer.mode === "guest") {
    sessionQuery = d1.prepare("SELECT id, display_name AS displayName, mode, created_at AS createdAt, updated_at AS updatedAt FROM agent_sessions WHERE id = ? ORDER BY updated_at DESC").bind(viewer.id);
  } else {
    sessionQuery = d1.prepare("SELECT id, display_name AS displayName, mode, created_at AS createdAt, updated_at AS updatedAt FROM agent_sessions WHERE mode = 'employee' AND lower(trim(display_name)) = lower(trim(?)) ORDER BY updated_at DESC").bind(viewer.displayName);
  }
  const sessions = await sessionQuery.all<SessionRow>();
  const requested = sessions.results.find(session => session.id === requestedSessionId);
  const target = requested || sessions.results.find(session => session.id === viewer.id) || viewer;
  if (!canView(viewer, target)) return Response.json({ error: "无权查看该对话" }, { status: 403 });

  const conversations = await d1.prepare("SELECT * FROM (SELECT * FROM conversations WHERE session_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 200) ORDER BY created_at ASC").bind(target.id).all<ConversationRow>();
  return Response.json({
    documents: documents.results,
    tickets: tickets.results,
    sessions: sessions.results,
    activeSessionId: target.id,
    conversations: conversations.results.map(row => ({ ...row, citations: JSON.parse(row.citations), trace: JSON.parse(row.trace) })),
  });
}
