import { db, files } from "@/lib/store";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const d1 = await db();
  const document = await d1.prepare("SELECT id, name, content_type AS contentType, content, status, chunk_count AS chunkCount, created_at AS createdAt FROM documents WHERE id = ?").bind(id).first();
  if (!document) return Response.json({ error: "文档不存在" }, { status: 404 });
  return Response.json(document);
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const d1 = await db();
  const document = await d1.prepare("SELECT id, name FROM documents WHERE id = ?").bind(id).first<{ id: string; name: string }>();
  if (!document) return Response.json({ error: "文档不存在" }, { status: 404 });
  await d1.prepare("DELETE FROM documents WHERE id = ?").bind(id).run();
  const bucket = files();
  if (bucket) {
    const objects = await bucket.list({ prefix: `${id}/` });
    if (objects.objects.length) await bucket.delete(objects.objects.map(object => object.key));
  }
  return Response.json({ ok: true, id });
}
