"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type Citation = { index: number; id: string; name: string; excerpt: string };
type Trace = { step: string; detail: string; status: string };
type Message = { id?: string; role: "user" | "assistant"; content: string; citations?: Citation[]; trace?: Trace[] };
type Ticket = { id: string; title: string; category: string; priority: string; status: string; requester: string; updatedAt?: string; updated_at?: string };
type Document = { id: string; name: string; status: string; chunkCount: number; createdAt: string };

const starters = ["企业账号重置密码后仍无法登录，错误码 SSO-403", "企业年付套餐如何申请退款？", "服务大面积不可用时的响应时限是多少？"];

export default function Home() {
  const [tab, setTab] = useState<"chat" | "tickets" | "knowledge">("chat");
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", content: "你好，我是 Resolve AI。我可以检索企业知识、诊断问题并创建工单。你今天遇到了什么问题？" }]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    const response = await fetch("/api/bootstrap");
    if (!response.ok) return;
    const data = await response.json() as { tickets: Ticket[]; documents: Document[]; conversations: Message[] };
    setTickets(data.tickets || []);
    setDocuments(data.documents || []);
    if (data.conversations?.length) setMessages(data.conversations);
  }
  useEffect(() => { refresh(); }, []);

  async function send(text = input) {
    const clean = text.trim();
    if (!clean || loading) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: clean }]);
    setLoading(true);
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: clean }) });
      const data = await response.json() as { error?: string; answer: string; citations: Citation[]; trace: Trace[]; ticket?: Ticket };
      if (!response.ok) throw new Error(data.error);
      setMessages(prev => [...prev, { role: "assistant", content: data.answer, citations: data.citations, trace: data.trace }]);
      const createdTicket = data.ticket;
      if (createdTicket) setTickets(prev => [createdTicket, ...prev]);
    } catch (error) { setNotice(error instanceof Error ? error.message : "请求失败，请稍后再试"); }
    finally { setLoading(false); }
  }

  async function upload(file?: File) {
    if (!file) return;
    const form = new FormData(); form.append("file", file);
    setNotice("正在处理文档…");
    const response = await fetch("/api/documents", { method: "POST", body: form });
    const data = await response.json() as (Document & { error?: string });
    if (response.ok) { setDocuments(prev => [data, ...prev]); setNotice(`${file.name} 已加入知识库`); }
    else setNotice(data.error || "上传失败");
  }

  async function updateTicket(ticket: Ticket, status: string) {
    await fetch("/api/tickets", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: ticket.id, status }) });
    setTickets(prev => prev.map(item => item.id === ticket.id ? { ...item, status } : item));
  }

  const openCount = tickets.filter(t => t.status !== "closed").length;
  return <main className="shell">
    <aside className="sidebar">
      <div className="brand"><span className="brandMark">R</span><div><strong>Resolve AI</strong><small>智能服务台</small></div></div>
      <nav>
        <button className={tab === "chat" ? "active" : ""} onClick={() => setTab("chat")}><span>◫</span>Agent 对话</button>
        <button className={tab === "tickets" ? "active" : ""} onClick={() => setTab("tickets")}><span>◎</span>工单中心<i>{openCount}</i></button>
        <button className={tab === "knowledge" ? "active" : ""} onClick={() => setTab("knowledge")}><span>▤</span>知识库</button>
      </nav>
      <div className="sideFoot"><div className="statusDot"/><div><b>Agent 在线</b><small>检索与工具调用正常</small></div></div>
    </aside>

    <section className="workspace">
      <header><div><h1>{tab === "chat" ? "Agent 工作台" : tab === "tickets" ? "工单中心" : "企业知识库"}</h1><p>{tab === "chat" ? "让每个客户问题都有据可查、有迹可循" : tab === "tickets" ? "跟踪、分级并推进客户问题" : "管理 Agent 可检索的企业资料"}</p></div><div className="headerStats"><span><b>{documents.length}</b> 文档</span><span><b>{tickets.length}</b> 工单</span><div className="avatar">M</div></div></header>

      {tab === "chat" && <div className="chatLayout">
        <section className="conversation">
          <div className="messages">
            {messages.map((message, idx) => <article key={message.id || idx} className={`message ${message.role}`}>
              <div className="messageAvatar">{message.role === "assistant" ? "R" : "你"}</div>
              <div className="bubble"><div className="messageMeta">{message.role === "assistant" ? "Resolve Agent" : "你"}</div><p>{message.content}</p>
                {!!message.citations?.length && <div className="citations"><b>参考来源</b>{message.citations.map(c => <button key={c.id} title={c.excerpt}><span>[{c.index}]</span>{c.name}</button>)}</div>}
                {!!message.trace?.length && <details><summary>查看 Agent 执行轨迹 · {message.trace.length} 步</summary>{message.trace.map((t, i) => <div className="trace" key={i}><em>✓</em><div><b>{t.step}</b><small>{t.detail}</small></div></div>)}</details>}
              </div>
            </article>)}
            {loading && <article className="message assistant"><div className="messageAvatar">R</div><div className="bubble typing"><i/><i/><i/></div></article>}
          </div>
          {messages.length <= 1 && <div className="suggestions">{starters.map(x => <button key={x} onClick={() => send(x)}>{x}<span>↗</span></button>)}</div>}
          <form className="composer" onSubmit={(e: FormEvent) => { e.preventDefault(); send(); }}><textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="描述问题，Agent 会检索知识并选择合适的工具…"/><div><span>Enter 发送 · Shift + Enter 换行</span><button disabled={!input.trim() || loading}>发送 ↑</button></div></form>
        </section>
        <aside className="insight">
          <div className="panelTitle"><span>实时概览</span><i>LIVE</i></div>
          <div className="metricGrid"><div><b>{documents.length}</b><small>可检索文档</small></div><div><b>{openCount}</b><small>待处理工单</small></div><div><b>3</b><small>Agent 工具</small></div><div><b>100%</b><small>引用覆盖</small></div></div>
          <div className="toolList"><h3>可用工具</h3><div><span className="toolIcon blue">⌕</span><p><b>知识检索</b><small>混合关键词与语义召回</small></p><i>就绪</i></div><div><span className="toolIcon orange">◎</span><p><b>工单管理</b><small>创建、更新与状态跟踪</small></p><i>就绪</i></div><div><span className="toolIcon green">◇</span><p><b>风险判断</b><small>识别升级与人工审批</small></p><i>就绪</i></div></div>
          <div className="guard"><b>安全护栏已开启</b><p>高风险操作与低置信度回答会自动建议转人工。</p></div>
        </aside>
      </div>}

      {tab === "tickets" && <div className="contentPage"><div className="toolbar"><div className="search">⌕ 搜索工单</div><button onClick={() => { setTab("chat"); setInput("请帮我创建一个工单："); }}>+ 新建工单</button></div><div className="table"><div className="tr th"><span>工单</span><span>分类</span><span>优先级</span><span>状态</span><span>提交人</span><span>操作</span></div>{tickets.map(ticket => <div className="tr" key={ticket.id}><span><b>{ticket.title}</b><small>{ticket.id}</small></span><span>{ticket.category}</span><span><i className={`priority ${ticket.priority}`}>{ticket.priority === "high" ? "高" : ticket.priority === "low" ? "低" : "普通"}</i></span><span><i className={`ticketStatus ${ticket.status}`}>{ticket.status === "closed" ? "已关闭" : ticket.status === "resolved" ? "已解决" : "处理中"}</i></span><span>{ticket.requester}</span><span><select value={ticket.status} onChange={e => updateTicket(ticket, e.target.value)}><option value="open">处理中</option><option value="resolved">已解决</option><option value="closed">已关闭</option></select></span></div>)}</div></div>}

      {tab === "knowledge" && <div className="contentPage"><div className="uploadCard" onClick={() => fileRef.current?.click()}><div>＋</div><h3>添加企业资料</h3><p>上传 TXT、Markdown 或 CSV，Agent 会自动切分并加入检索索引</p><button>选择文件</button><input ref={fileRef} hidden type="file" accept=".txt,.md,.csv" onChange={e => upload(e.target.files?.[0])}/></div><div className="docHeader"><h2>已索引文档</h2><span>{documents.length} 份资料</span></div><div className="docGrid">{documents.map(doc => <article key={doc.id}><div className="fileIcon">{doc.name.endsWith(".md") ? "MD" : "TXT"}</div><div><b>{doc.name}</b><small>{doc.chunkCount} 个知识片段 · 可检索</small></div><i>✓</i></article>)}</div></div>}
    </section>
    {notice && <button className="toast" onClick={() => setNotice("")}>{notice}<span>×</span></button>}
  </main>;
}
