import { db } from "@/lib/store";

export async function GET() {
  const d1 = await db();
  const [documents, tickets, conversations] = await Promise.all([
    d1.prepare("SELECT id, name, content_type AS contentType, status, chunk_count AS chunkCount, created_at AS createdAt FROM documents ORDER BY created_at DESC").all(),
    d1.prepare("SELECT * FROM tickets ORDER BY updated_at DESC").all(),
    d1.prepare("SELECT * FROM (SELECT * FROM conversations ORDER BY created_at DESC LIMIT 200) ORDER BY created_at ASC").all(),
  ]);
  return Response.json({ documents: documents.results, tickets: tickets.results, conversations: conversations.results.map((row: any) => ({ ...row, citations: JSON.parse(row.citations), trace: JSON.parse(row.trace) })) });
}
