export const QWEN_EMBEDDING_MODEL = "text-embedding-v4";
const QWEN_EMBEDDING_ENDPOINT = "https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings";

type EmbeddingResponse = {
  data?: Array<{ embedding: number[]; index: number }>;
  error?: { message?: string };
  message?: string;
};

export function splitKnowledge(content: string, maxLength = 800, overlap = 100) {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const qaSections = normalized.split(/(?=^##\s+(?:Q\d+|问题\s*\d*)[：:])/gm).map(part => part.trim()).filter(Boolean);
  const qaMode = qaSections.length > 1;
  const sourceSections = qaMode ? qaSections.filter(section => /^##\s+/.test(section)) : normalized.split(/\n{2,}/).map(part => part.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };

  for (const section of sourceSections) {
    if (section.length > maxLength) {
      flush();
      const step = Math.max(1, maxLength - overlap);
      for (let start = 0; start < section.length; start += step) {
        chunks.push(section.slice(start, start + maxLength).trim());
        if (start + maxLength >= section.length) break;
      }
      continue;
    }
    if (qaMode) {
      flush();
      chunks.push(section);
      continue;
    }
    const combined = current ? `${current}\n\n${section}` : section;
    if (combined.length > maxLength) flush();
    current = current ? `${current}\n\n${section}` : section;
  }
  flush();
  return chunks;
}

export async function embedTexts(texts: string[], apiKey: string) {
  const vectors: number[][] = [];
  for (let start = 0; start < texts.length; start += 10) {
    const input = texts.slice(start, start + 10);
    const response = await fetch(QWEN_EMBEDDING_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: QWEN_EMBEDDING_MODEL, input }),
    });
    const data = await response.json() as EmbeddingResponse;
    if (!response.ok || !data.data) throw new Error(data.error?.message || data.message || `千问向量化失败：${response.status}`);
    const batch = [...data.data].sort((a, b) => a.index - b.index).map(item => item.embedding);
    if (batch.length !== input.length) throw new Error("千问返回的向量数量与知识片段数量不一致");
    vectors.push(...batch);
  }
  return vectors;
}

export async function indexDocument(
  d1: D1Database,
  document: { id: string; content: string },
  apiKey?: string,
) {
  const chunks = splitKnowledge(document.content);
  let vectors: number[][] = [];
  let embedded = false;
  if (apiKey && chunks.length) {
    try {
      vectors = await embedTexts(chunks, apiKey);
      embedded = vectors.length === chunks.length;
    } catch (error) {
      console.error("Qwen embedding indexing failed", error);
    }
  }

  await d1.prepare("DELETE FROM knowledge_chunks WHERE document_id = ?").bind(document.id).run();
  const now = new Date().toISOString();
  const statements = chunks.map((content, index) => d1.prepare(
    "INSERT INTO knowledge_chunks (id, document_id, chunk_index, content, embedding, embedding_model, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).bind(
    `${document.id}-chunk-${index + 1}`,
    document.id,
    index,
    content,
    embedded ? JSON.stringify(vectors[index]) : null,
    embedded ? QWEN_EMBEDDING_MODEL : null,
    now,
  ));
  for (let start = 0; start < statements.length; start += 80) await d1.batch(statements.slice(start, start + 80));
  await d1.prepare("UPDATE documents SET chunk_count = ? WHERE id = ?").bind(chunks.length, document.id).run();
  return { chunkCount: chunks.length, embedded };
}

export function parseEmbedding(value: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every(item => typeof item === "number") ? parsed as number[] : null;
  } catch {
    return null;
  }
}

export function cosineSimilarity(left: number[], right: number[]) {
  if (!left.length || left.length !== right.length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index++) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  return leftNorm && rightNorm ? dot / Math.sqrt(leftNorm * rightNorm) : 0;
}
