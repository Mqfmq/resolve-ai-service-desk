import { db, deepSeekKey, id, openAIKey } from "@/lib/store";

type Doc = { id: string; name: string; content: string };
const stop = new Set(["的", "了", "是", "我", "在", "和", "有", "请", "吗", "怎么", "什么"]);
function terms(text: string) { return [...new Set(text.toLowerCase().match(/[a-z0-9-]{2,}|[\u4e00-\u9fff]{2,}/g) || [])].filter(x => !stop.has(x)); }

export async function POST(request: Request) {
  const { message } = await request.json() as { message?: string };
  if (!message?.trim()) return Response.json({ error: "请输入问题" }, { status: 400 });
  const d1 = await db();
  const docs = (await d1.prepare("SELECT id, name, content FROM documents").all<Doc>()).results;
  const queryTerms = terms(message);
  const ranked = docs.map(doc => ({ ...doc, score: queryTerms.reduce((score, term) => score + (doc.content.toLowerCase().includes(term) ? 3 : 0) + (doc.name.toLowerCase().includes(term) ? 2 : 0), 0) })).sort((a, b) => b.score - a.score).slice(0, 3).filter(d => d.score > 0);
  const urgent = /安全|泄露|全部|无法使用|sso-403|紧急/i.test(message);
  const wantsTicket = /工单|人工|处理|解决|登录不了|无法登录/i.test(message);
  const trace = [
    { step: "意图识别", detail: wantsTicket ? "故障诊断 / 可能创建工单" : "知识问答", status: "done" },
    { step: "混合检索", detail: `命中 ${ranked.length} 份知识文档`, status: "done" },
    { step: "风险判断", detail: urgent ? "检测到高风险信号，建议人工介入" : "未检测到高风险操作", status: "done" },
  ];
  let ticket: Record<string, string> | null = null;
  if (wantsTicket && ranked.length) {
    const now = new Date().toISOString();
    ticket = { id: id("TK").toUpperCase(), title: message.slice(0, 36), description: message, category: /登录|账号|密码|SSO/i.test(message) ? "账号与权限" : "技术支持", priority: urgent ? "high" : "medium", status: "open", requester: "当前访客", createdAt: now, updatedAt: now };
    await d1.prepare("INSERT INTO tickets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(ticket.id, ticket.title, ticket.description, ticket.category, ticket.priority, ticket.status, ticket.requester, now, now).run();
    trace.push({ step: "工具调用", detail: `已创建 ${ticket.id}，优先级 ${ticket.priority}`, status: "done" });
  }
  const context = ranked.map((d, i) => `[${i + 1}] ${d.name}: ${d.content}`).join("\n");
  let answer = ranked.length ? `我查阅了相关资料。${ranked[0].content}${urgent ? "\n\n该问题包含高风险信号，建议立即转人工处理。" : ""}${ticket ? `\n\n我已创建工单 ${ticket.id}，客服会按 ${ticket.priority === "high" ? "高" : "普通"}优先级跟进。` : ""}` : "当前知识库中没有找到足够可靠的答案。请补充错误码、发生时间、账号类型或订单号，我会继续诊断。";
  const deepSeek = deepSeekKey();
  const openAI = openAIKey();
  if (deepSeek && ranked.length) {
    try {
      const ai = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${deepSeek}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "deepseek-chat",
          temperature: 0.2,
          messages: [
            { role: "system", content: "你是企业客服 Agent。只能依据提供的企业资料回答；如果资料不足，明确说明并主动追问。回答要简洁、专业，并保留引用编号。" },
            { role: "user", content: `问题：${message}\n\n企业资料：\n${context}` },
          ],
        }),
      });
      const data = await ai.json() as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
      const generated = data.choices?.[0]?.message?.content;
      if (!ai.ok) throw new Error(data.error?.message || `DeepSeek 请求失败：${ai.status}`);
      if (generated) answer = `${generated}${ticket ? `\n\n已创建工单 ${ticket.id}。` : ""}`;
      trace.push({ step: "模型生成", detail: "DeepSeek 已基于检索资料生成回答", status: "done" });
    } catch {
      trace.push({ step: "模型降级", detail: "DeepSeek 暂不可用，已使用检索式回答", status: "done" });
    }
  } else if (openAI && ranked.length) {
    try {
      const ai = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${openAI}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "gpt-4.1-mini", input: `你是企业客服 Agent。仅依据资料回答，简洁、专业，保留引用编号。\n问题：${message}\n资料：${context}` }) });
      const data = await ai.json() as any;
      if (ai.ok && data.output_text) answer = `${data.output_text}${ticket ? `\n\n已创建工单 ${ticket.id}。` : ""}`;
    } catch { trace.push({ step: "模型降级", detail: "模型暂不可用，已使用检索式回答", status: "done" }); }
  }
  const citations = ranked.map((d, index) => ({ index: index + 1, id: d.id, name: d.name, excerpt: d.content.slice(0, 120) }));
  const now = new Date().toISOString();
  await d1.batch([
    d1.prepare("INSERT INTO conversations VALUES (?, 'user', ?, '[]', '[]', ?)").bind(id("msg"), message.trim(), now),
    d1.prepare("INSERT INTO conversations VALUES (?, 'assistant', ?, ?, ?, ?)").bind(id("msg"), answer, JSON.stringify(citations), JSON.stringify(trace), now),
  ]);
  return Response.json({ answer, citations, trace, ticket });
}
