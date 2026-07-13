"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type Citation = { index: number; id: string; name: string; excerpt: string };
type Trace = { step: string; detail: string; status: string };
type Message = { id?: string; role: "user" | "assistant"; content: string; citations?: Citation[]; trace?: Trace[] };
type Ticket = { id: string; title: string; category: string; priority: string; status: string; requester: string };
type Document = { id: string; name: string; contentType?: string; status: string; chunkCount: number; createdAt: string; content?: string };
type Session = { id: string; displayName: string; mode: "employee" | "guest"; createdAt: string; updatedAt: string };

const welcome = (name = "你") => ({ role: "assistant" as const, content: `你好，${name}。我是 Resolve AI，可以检索企业知识、回答通用问题并协助创建工单。今天需要处理什么？` });
const starters = ["企业账号登录失败，错误码 SSO-403", "企业年付套餐如何申请退款？", "API 返回 429 应该怎么处理？"];

export default function Home() {
  const [tab, setTab] = useState<"chat" | "tickets" | "knowledge">("chat");
  const [messages, setMessages] = useState<Message[]>([welcome()]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [showNewSession, setShowNewSession] = useState(false);
  const [employeeName, setEmployeeName] = useState("");
  const [preview, setPreview] = useState<Document | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const currentSession = sessions.find(session => session.id === sessionId);

  async function refresh(targetSessionId?: string) {
    const selected = targetSessionId || sessionId || "legacy";
    const response = await fetch(`/api/bootstrap?sessionId=${encodeURIComponent(selected)}`);
    if (!response.ok) return;
    const data = await response.json() as { tickets: Ticket[]; documents: Document[]; conversations: Message[]; sessions: Session[] };
    setTickets(data.tickets || []);
    setDocuments(data.documents || []);
    setSessions(data.sessions || []);
    if (targetSessionId || sessionId) setMessages(data.conversations?.length ? data.conversations : [welcome(data.sessions.find(item => item.id === selected)?.displayName)]);
  }

  useEffect(() => {
    const saved = window.sessionStorage.getItem("resolve-session") || "";
    setSessionId(saved);
    refresh(saved || "legacy").then(() => { if (!saved) setShowNewSession(true); });
  }, []);

  async function createSession(mode: "employee" | "guest") {
    if (mode === "employee" && !employeeName.trim()) { setNotice("请先输入员工姓名"); return; }
    const response = await fetch("/api/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, displayName: employeeName }) });
    const data = await response.json() as Session & { error?: string };
    if (!response.ok) { setNotice(data.error || "新建对话失败"); return; }
    setSessions(prev => [data, ...prev]);
    setSessionId(data.id);
    window.sessionStorage.setItem("resolve-session", data.id);
    setMessages([welcome(data.displayName)]);
    setInput("");
    setEmployeeName("");
    setShowNewSession(false);
    setTab("chat");
  }

  async function switchSession(id: string) {
    setSessionId(id);
    window.sessionStorage.setItem("resolve-session", id);
    setTab("chat");
    await refresh(id);
  }

  async function send(text = input) {
    const clean = text.trim();
    if (!sessionId) { setShowNewSession(true); return; }
    if (!clean || loading) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: clean }]);
    setLoading(true);
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: clean, sessionId }) });
      const data = await response.json() as { error?: string; answer: string; citations: Citation[]; trace: Trace[]; ticket?: Ticket };
      if (!response.ok) throw new Error(data.error || "请求失败");
      setMessages(prev => [...prev, { role: "assistant", content: data.answer, citations: data.citations, trace: data.trace }]);
      if (data.ticket) setTickets(prev => [data.ticket!, ...prev]);
    } catch (error) { setNotice(error instanceof Error ? error.message : "请求失败，请稍后再试"); }
    finally { setLoading(false); }
  }

  async function upload(file?: File) {
    if (!file) return;
    const form = new FormData(); form.append("file", file);
    setNotice("正在处理文档…");
    const response = await fetch("/api/documents", { method: "POST", body: form });
    const data = await response.json() as Document & { error?: string };
    if (response.ok) { setDocuments(prev => [data, ...prev]); setNotice(`${file.name} 已加入知识库`); }
    else setNotice(data.error || "上传失败");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function previewDocument(document: Document) {
    const response = await fetch(`/api/documents/${encodeURIComponent(document.id)}`);
    const data = await response.json() as Document & { error?: string };
    if (response.ok) setPreview(data); else setNotice(data.error || "无法预览文档");
  }

  async function deleteDocument(document: Document) {
    if (!window.confirm(`确定删除“${document.name}”吗？删除后 Agent 将无法再检索这份资料。`)) return;
    const response = await fetch(`/api/documents/${encodeURIComponent(document.id)}`, { method: "DELETE" });
    const data = await response.json() as { error?: string };
    if (!response.ok) { setNotice(data.error || "删除失败"); return; }
    setDocuments(prev => prev.filter(item => item.id !== document.id));
    if (preview?.id === document.id) setPreview(null);
    setNotice("文档已删除");
  }

  async function updateTicket(ticket: Ticket, status: string) {
    await fetch("/api/tickets", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: ticket.id, status }) });
    setTickets(prev => prev.map(item => item.id === ticket.id ? { ...item, status } : item));
  }

  const openCount = tickets.filter(ticket => ticket.status !== "closed").length;

  return <main className="shell">
    <aside className="sidebar">
      <div className="brand"><span className="brandMark">R</span><div><strong>Resolve AI</strong><small>智能服务台</small></div></div>
      <button className="newChat" onClick={() => setShowNewSession(true)}>＋ 新建 Agent 对话</button>
      <nav>
        <button className={tab === "chat" ? "active" : ""} onClick={() => setTab("chat")}><span>◫</span>Agent 对话</button>
        <button className={tab === "tickets" ? "active" : ""} onClick={() => setTab("tickets")}><span>◎</span>工单中心<i>{openCount}</i></button>
        <button className={tab === "knowledge" ? "active" : ""} onClick={() => setTab("knowledge")}><span>▤</span>知识库</button>
      </nav>
      <div className="sessionList"><h4>最近对话</h4>{sessions.slice(0, 6).map(session => <button key={session.id} className={session.id === sessionId ? "selected" : ""} onClick={() => switchSession(session.id)}><span>{session.mode === "guest" ? "游" : session.displayName.slice(0, 1)}</span><div><b>{session.displayName}</b><small>{session.mode === "guest" ? "游客模式" : "员工会话"}</small></div></button>)}</div>
      <div className="sideFoot"><div className="statusDot"/><div><b>{currentSession?.displayName || "尚未选择身份"}</b><small>{currentSession ? "Agent 在线" : "请新建对话"}</small></div></div>
    </aside>

    <section className="workspace">
      <header><div><h1>{tab === "chat" ? "Agent 工作台" : tab === "tickets" ? "工单中心" : "企业知识库"}</h1><p>{tab === "chat" ? `${currentSession?.displayName || "未登录"} · 独立对话与长期记忆` : tab === "tickets" ? "跟踪、分级并推进客户问题" : "预览、上传和维护 Agent 可检索的企业资料"}</p></div><div className="headerStats"><span><b>{documents.length}</b> 文档</span><span><b>{tickets.length}</b> 工单</span><div className="avatar">{currentSession?.displayName.slice(0, 1) || "?"}</div></div></header>

      {tab === "chat" && <div className="chatLayout"><section className="conversation"><div className="messages">{messages.map((message, index) => <article key={message.id || index} className={`message ${message.role}`}><div className="messageAvatar">{message.role === "assistant" ? "R" : currentSession?.displayName.slice(0, 1) || "你"}</div><div className="bubble"><div className="messageMeta">{message.role === "assistant" ? "Resolve Agent" : currentSession?.displayName || "你"}</div><p>{message.content}</p>{!!message.citations?.length && <div className="citations"><b>参考来源</b>{message.citations.map(citation => <button key={citation.id} title={citation.excerpt} onClick={() => { setTab("knowledge"); const doc = documents.find(item => item.id === citation.id); if (doc) previewDocument(doc); }}><span>[{citation.index}]</span>{citation.name}</button>)}</div>}{!!message.trace?.length && <details><summary>查看 Agent 执行轨迹 · {message.trace.length} 步</summary>{message.trace.map((trace, i) => <div className="trace" key={i}><em>✓</em><div><b>{trace.step}</b><small>{trace.detail}</small></div></div>)}</details>}</div></article>)}{loading && <article className="message assistant"><div className="messageAvatar">R</div><div className="bubble typing"><i/><i/><i/></div></article>}</div>{messages.length <= 1 && <div className="suggestions">{starters.map(item => <button key={item} onClick={() => send(item)}>{item}<span>↗</span></button>)}</div>}<form className="composer" onSubmit={(event: FormEvent) => { event.preventDefault(); send(); }}><textarea value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} placeholder={sessionId ? "描述问题，Agent 会检索知识并调用合适的工具…" : "请先新建员工或游客对话"}/><div><span>Enter 发送 · Shift + Enter 换行</span><button disabled={!input.trim() || loading}>发送 ↑</button></div></form></section><aside className="insight"><div className="panelTitle"><span>当前身份</span><i>{currentSession?.mode === "guest" ? "GUEST" : "EMPLOYEE"}</i></div><div className="identityCard"><div>{currentSession?.displayName.slice(0, 1) || "?"}</div><b>{currentSession?.displayName || "未选择"}</b><small>本会话拥有独立历史与长期记忆</small></div><div className="metricGrid"><div><b>{documents.length}</b><small>可检索文档</small></div><div><b>{openCount}</b><small>待处理工单</small></div></div><div className="guard"><b>会话隔离已开启</b><p>不同员工和游客的聊天历史、上下文与长期摘要互不混用。</p></div></aside></div>}

      {tab === "tickets" && <div className="contentPage"><div className="toolbar"><div className="search">⌕ 搜索工单</div><button onClick={() => { setTab("chat"); setInput("请帮我创建一个工单："); }}>＋ 新建工单</button></div><div className="table"><div className="tr th"><span>工单</span><span>分类</span><span>优先级</span><span>状态</span><span>提交人</span><span>操作</span></div>{tickets.map(ticket => <div className="tr" key={ticket.id}><span><b>{ticket.title}</b><small>{ticket.id}</small></span><span>{ticket.category}</span><span><i className={`priority ${ticket.priority}`}>{ticket.priority === "high" ? "高" : ticket.priority === "low" ? "低" : "普通"}</i></span><span><i className={`ticketStatus ${ticket.status}`}>{ticket.status === "closed" ? "已关闭" : ticket.status === "resolved" ? "已解决" : "处理中"}</i></span><span>{ticket.requester}</span><span><select value={ticket.status} onChange={event => updateTicket(ticket, event.target.value)}><option value="open">处理中</option><option value="resolved">已解决</option><option value="closed">已关闭</option></select></span></div>)}</div></div>}

      {tab === "knowledge" && <div className="contentPage"><div className="uploadCard" onClick={() => fileRef.current?.click()}><div>＋</div><h3>添加企业资料</h3><p>上传 TXT、Markdown 或 CSV，Agent 会自动加入检索索引</p><button>选择文件</button><input ref={fileRef} hidden type="file" accept=".txt,.md,.csv" onChange={event => upload(event.target.files?.[0])}/></div><div className="docHeader"><h2>已索引文档</h2><span>{documents.length} 份资料 · 点击可预览</span></div><div className="docGrid">{documents.map(document => <article key={document.id}><button className="docMain" onClick={() => previewDocument(document)}><div className="fileIcon">{document.name.endsWith(".md") ? "MD" : "TXT"}</div><div><b>{document.name}</b><small>{document.chunkCount} 个知识片段 · 可检索</small></div></button><div className="docActions"><button onClick={() => previewDocument(document)}>预览</button><button className="danger" onClick={() => deleteDocument(document)}>删除</button></div></article>)}</div></div>}
    </section>

    {showNewSession && <div className="modalBackdrop"><section className="modal sessionModal" role="dialog" aria-modal="true"><button className="modalClose" onClick={() => sessionId && setShowNewSession(false)}>×</button><span className="modalEyebrow">NEW CONVERSATION</span><h2>新建 Agent 对话</h2><p>员工会话会以姓名隔离历史和长期记忆；也可以使用匿名游客模式。</p><label>员工姓名<input autoFocus value={employeeName} onChange={event => setEmployeeName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") createSession("employee"); }} placeholder="例如：林小满" maxLength={30}/></label><button className="primaryWide" onClick={() => createSession("employee")}>以员工身份开始</button><div className="modalDivider"><span>或者</span></div><button className="guestWide" onClick={() => createSession("guest")}>使用游客模式</button></section></div>}

    {preview && <div className="modalBackdrop" onMouseDown={event => { if (event.target === event.currentTarget) setPreview(null); }}><section className="modal previewModal" role="dialog" aria-modal="true"><button className="modalClose" onClick={() => setPreview(null)}>×</button><span className="modalEyebrow">KNOWLEDGE PREVIEW</span><h2>{preview.name}</h2><div className="previewMeta"><span>{preview.contentType || "text/markdown"}</span><span>{preview.chunkCount} 个知识片段</span><span>状态：可检索</span></div><pre>{preview.content}</pre><footer><button className="dangerButton" onClick={() => deleteDocument(preview)}>删除文档</button><button className="primaryButton" onClick={() => setPreview(null)}>关闭预览</button></footer></section></div>}

    {notice && <button className="toast" onClick={() => setNotice("")}>{notice}<span>×</span></button>}
  </main>;
}
