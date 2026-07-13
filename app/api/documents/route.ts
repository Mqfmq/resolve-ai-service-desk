import { db, files, id } from "@/lib/store";

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "请选择文件" }, { status: 400 });
  if (file.size > 5_000_000) return Response.json({ error: "文件不能超过 5 MB" }, { status: 400 });
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!ext || !["txt", "md", "csv"].includes(ext)) return Response.json({ error: "MVP 当前支持 TXT、Markdown 和 CSV；PDF/Word 解析将在下一阶段接入。" }, { status: 400 });
  const content = (await file.text()).trim();
  if (!content) return Response.json({ error: "文件内容为空" }, { status: 400 });
  const documentId = id("doc");
  const chunks = Math.max(1, Math.ceil(content.length / 800));
  const now = new Date().toISOString();
  const d1 = await db();
  await d1.prepare("INSERT INTO documents VALUES (?, ?, ?, ?, 'ready', ?, ?)").bind(documentId, file.name, file.type || "text/plain", content.slice(0, 100_000), chunks, now).run();
  await files()?.put(`${documentId}/${file.name}`, file.stream(), { httpMetadata: { contentType: file.type || "text/plain" } });
  return Response.json({ id: documentId, name: file.name, contentType: file.type, status: "ready", chunkCount: chunks, createdAt: now });
}
