import { db, files } from "@/lib/store";
import { resolveViewer } from "@/lib/auth";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const d1 = await db();
  if (!(await resolveViewer(request, d1))) return Response.json({ error: "请先登录" }, { status: 401 });
  const document = await d1.prepare("SELECT id, name, content_type AS contentType, content, status, chunk_count AS chunkCount, created_at AS createdAt FROM documents WHERE id = ?").bind(id).first();
  if (!document) return Response.json({ error: "文档不存在" }, { status: 404 });
  return Response.json(document);
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const d1 = await db();
  const viewer = await resolveViewer(request, d1);
  if (!viewer || viewer.mode !== "employee") return Response.json({ error: "只有已登录员工可以删除知识文档" }, { status: 403 });
  const document = await d1.prepare("SELECT id, name FROM documents WHERE id = ?").bind(id).first<{ id: string; name: string }>();
  if (!document) return Response.json({ error: "文档不存在" }, { status: 404 });
  await d1.batch([
    d1.prepare("DELETE FROM knowledge_chunks WHERE document_id = ?").bind(id),
    d1.prepare("DELETE FROM documents WHERE id = ?").bind(id),
  ]);
  const bucket = files();
  if (bucket) {
    const objects = await bucket.list({ prefix: `${id}/` });
    if (objects.objects.length) await bucket.delete(objects.objects.map(object => object.key));
  }
  return Response.json({ ok: true, id });
}
