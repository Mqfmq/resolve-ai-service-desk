import { db } from "@/lib/store";

type ConversationRow = { citations: string; trace: string; [key: string]: unknown };

export async function GET(request: Request) {
  const d1 = await db();
  const sessionId = new URL(request.url).searchParams.get("sessionId") || "legacy";
  const [documents, tickets, conversations, sessions] = await Promise.all([
    d1.prepare("SELECT id, name, content_type AS contentType, status, chunk_count AS chunkCount, created_at AS createdAt FROM documents ORDER BY created_at DESC").all(),
    d1.prepare("SELECT * FROM tickets ORDER BY updated_at DESC").all(),
    d1.prepare("SELECT * FROM (SELECT * FROM conversations WHERE session_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 200) ORDER BY created_at ASC").bind(sessionId).all<ConversationRow>(),
    d1.prepare("SELECT id, display_name AS displayName, mode, created_at AS createdAt, updated_at AS updatedAt FROM agent_sessions ORDER BY updated_at DESC").all(),
  ]);
  return Response.json({
    documents: documents.results,
    tickets: tickets.results,
    sessions: sessions.results,
    conversations: conversations.results.map(row => ({ ...row, citations: JSON.parse(row.citations), trace: JSON.parse(row.trace) })),
  });
}
