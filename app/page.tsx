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
  const [viewerSessionId, setViewerSessionId] = useState("");
  const [showNewSession, setShowNewSession] = useState(false);
  const [employeeName, setEmployeeName] = useState("");
  const [password, setPassword] = useState("");
  const [preview, setPreview] = useState<Document | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const currentSession = sessions.find(session => session.id === sessionId);
  const viewerSession = sessions.find(session => session.id === viewerSessionId);
  const canWrite = !!currentSession && !!viewerSession && (viewerSession.mode === "guest" ? viewerSession.id === currentSession.id : currentSession.mode === "employee" && viewerSession.displayName.trim().toLowerCase() === currentSession.displayName.trim().toLowerCase());

  async function refresh(targetSessionId?: string) {
    const selected = targetSessionId || sessionId;
    const response = await fetch(`/api/bootstrap?sessionId=${encodeURIComponent(selected)}`);
    if (response.status === 401) { setSessionId(""); setViewerSessionId(""); setSessions([]); setMessages([welcome()]); openSessionModal(); return; }
    if (!response.ok) return;
    const data = await response.json() as { tickets: Ticket[]; documents: Document[]; conversations: Message[]; sessions: Session[]; activeSessionId?: string | null; viewerSessionId?: string };
    setTickets(data.tickets || []);
    setDocuments(data.documents || []);
    setSessions(data.sessions || []);
    if (data.viewerSessionId) {
      setViewerSessionId(data.viewerSessionId);
      const viewer = data.sessions.find(item => item.id === data.viewerSessionId);
      if (viewer?.mode === "employee") setEmployeeName(viewer.displayName);
    }
    if (data.activeSessionId) setSessionId(data.activeSessionId);
    setMessages(data.conversations?.length ? data.conversations : [welcome(data.sessions.find(item => item.id === data.activeSessionId)?.displayName)]);
  }

  useEffect(() => {
    const saved = window.sessionStorage.getItem("resolve-session") || "";
    setSessionId(saved);
    refresh(saved);
  }, []);

  useEffect(() => {
    if (!showNewSession) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeSessionModal();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [showNewSession]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  function closeSessionModal() {
    setPassword("");
    setShowNewSession(false);
  }

  function openSessionModal() {
    setPassword("");
    setShowNewSession(true);
  }

  async function createSession(mode: "employee" | "guest") {
    if (mode === "employee" && !employeeName.trim()) { setNotice("请先输入员工姓名"); setPassword(""); return; }
    if (mode === "employee" && password.length < 8) { setNotice("密码至少需要 8 位"); setPassword(""); return; }
    const response = await fetch("/api/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, displayName: employeeName, password }) });
    const data = await response.json() as Session & { error?: string };
    if (!response.ok) { setNotice(data.error || "新建对话失败"); setPassword(""); return; }
    setSessions(prev => [data, ...prev]);
    setSessionId(data.id);
    setViewerSessionId(data.id);
    window.sessionStorage.setItem("resolve-session", data.id);
    setMessages([welcome(data.displayName)]);
    setInput("");
    if (data.mode === "employee") setEmployeeName(data.displayName);
    setPassword("");
    setShowNewSession(false);
    setTab("chat");
    await refresh(data.id);
  }

  async function createConversation() {
    if (viewerSession?.mode !== "employee") { openSessionModal(); return; }
    const response = await fetch("/api/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "newConversation" }) });
    const data = await response.json() as Session & { error?: string };
    if (!response.ok) {
      if (response.status === 401) {
        window.sessionStorage.removeItem("resolve-session");
        setSessionId(""); setViewerSessionId(""); setSessions([]); openSessionModal();
      }
      setNotice(data.error || "新建对话失败");
      return;
    }
    setSessionId(data.id);
    window.sessionStorage.setItem("resolve-session", data.id);
    setMessages([welcome(data.displayName)]);
    setInput("");
    setTab("chat");
    await refresh(data.id);
  }

  async function switchSession(id: string) {
    setSessionId(id);
    window.sessionStorage.setItem("resolve-session", id);
    setTab("chat");
    await refresh(id);
  }

  async function deleteSession(session: Session) {
    const deletingLoginSession = session.id === viewerSessionId;
    const consequence = deletingLoginSession ? "删除后会退出当前登录。" : "";
    if (!window.confirm(`确定删除“${session.displayName}”的这条对话吗？其中的消息和长期记忆也会被删除。${consequence}`)) return;
    const response = await fetch(`/api/sessions?sessionId=${encodeURIComponent(session.id)}`, { method: "DELETE" });
    const data = await response.json() as { error?: string; loggedOut?: boolean };
    if (!response.ok) { setNotice(data.error || "删除对话失败"); return; }
    if (data.loggedOut || deletingLoginSession) {
      const lastEmployeeName = viewerSession?.mode === "employee" ? viewerSession.displayName : employeeName;
      window.sessionStorage.removeItem("resolve-session");
      setSessionId(""); setViewerSessionId(""); setSessions([]); setMessages([welcome()]);
      setEmployeeName(lastEmployeeName); openSessionModal();
      setNotice("当前对话已删除，请重新登录");
      return;
    }
    const nextSessionId = session.id === sessionId ? viewerSessionId : sessionId;
    await refresh(nextSessionId);
    setNotice("历史对话已删除");
  }

  async function send(text = input) {
    const clean = text.trim();
    if (!sessionId) { openSessionModal(); return; }
    if (!clean || loading) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: clean }]);
    setLoading(true);
    try {
      if (!canWrite) throw new Error("该对话为只读历史，不能使用他人身份发送消息");
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

  async function logout() {
    const lastEmployeeName = viewerSession?.mode === "employee" ? viewerSession.displayName : employeeName;
    await fetch("/api/sessions", { method: "DELETE" });
    window.sessionStorage.removeItem("resolve-session");
    setSessionId(""); setViewerSessionId(""); setSessions([]); setMessages([welcome()]);
    setEmployeeName(lastEmployeeName); openSessionModal();
  }

  const openCount = tickets.filter(ticket => ticket.status !== "closed").length;

  return <main className="shell">
    <aside className="sidebar">
      <div className="brand"><span className="brandMark">R</span><div><strong>Resolve AI</strong><small>智能服务台</small></div></div>
      <button className="newChat" onClick={createConversation}>＋ 新建 Agent 对话</button>
      <nav>
        <button className={tab === "chat" ? "active" : ""} onClick={() => setTab("chat")}><span>◫</span>Agent 对话</button>
        <button className={tab === "tickets" ? "active" : ""} onClick={() => setTab("tickets")}><span>◎</span>工单中心<i>{openCount}</i></button>
        <button className={tab === "knowledge" ? "active" : ""} onClick={() => setTab("knowledge")}><span>▤</span>知识库</button>
      </nav>
      <div className="sessionList"><h4>{viewerSession?.displayName.toLowerCase() === "mqf" ? "全部最近对话" : "我的最近对话"}</h4>{sessions.slice(0, 8).map(session => <div className="sessionItem" key={session.id}><button className={`sessionOpen ${session.id === sessionId ? "selected" : ""}`} onClick={() => switchSession(session.id)}><span>{session.mode === "guest" ? "游" : session.displayName.slice(0, 1)}</span><div><b>{session.displayName}</b><small>{session.id === viewerSessionId ? "当前身份" : session.mode === "guest" ? "游客模式" : "历史会话"}</small></div></button><button className="sessionDelete" aria-label={`删除 ${session.displayName} 的对话`} title="删除对话" onClick={() => deleteSession(session)}>×</button></div>)}</div>
      <div className="sideFoot"><div className="statusDot"/><div><b>{viewerSession?.displayName || "尚未登录"}</b><small>{viewerSession ? "密码验证已通过" : "请登录"}</small></div>{viewerSession && <button className="logoutButton" onClick={logout}>退出</button>}</div>
    </aside>

    <section className="workspace">
      <header><div><h1>{tab === "chat" ? "Agent 工作台" : tab === "tickets" ? "工单中心" : "企业知识库"}</h1><p>{tab === "chat" ? `${currentSession?.displayName || "未登录"} · 独立对话与长期记忆` : tab === "tickets" ? "跟踪、分级并推进客户问题" : "预览、上传和维护 Agent 可检索的企业资料"}</p></div><div className="headerStats"><span><b>{documents.length}</b> 文档</span><span><b>{tickets.length}</b> 工单</span><div className="avatar">{currentSession?.displayName.slice(0, 1) || "?"}</div></div></header>

    {tab === "chat" && <div className="chatLayout"><section className="conversation"><div className="messages">{!canWrite && currentSession && <div className="readOnlyBanner">只读查看：你正在查看 {currentSession.displayName} 的历史对话</div>}{messages.map((message, index) => <article key={message.id || index} className={`message ${message.role}`}><div className="messageAvatar">{message.role === "assistant" ? "R" : currentSession?.displayName.slice(0, 1) || "你"}</div><div className="bubble"><div className="messageMeta">{message.role === "assistant" ? "Resolve Agent" : currentSession?.displayName || "你"}</div><p>{message.content}</p>{!!message.citations?.length && <div className="citations"><b>参考来源</b>{message.citations.map(citation => <button key={`${citation.id}-${citation.index}`} title={citation.excerpt} onClick={() => { setTab("knowledge"); const doc = documents.find(item => item.id === citation.id); if (doc) previewDocument(doc); }}><span>[{citation.index}]</span>{citation.name}</button>)}</div>}{!!message.trace?.length && <details><summary>查看 Agent 执行轨迹 · {message.trace.length} 步</summary>{message.trace.map((trace, i) => <div className="trace" key={i}><em>✓</em><div><b>{trace.step}</b><small>{trace.detail}</small></div></div>)}</details>}</div></article>)}{loading && <article className="message assistant"><div className="messageAvatar">R</div><div className="bubble typing"><i/><i/><i/></div></article>}</div>{messages.length <= 1 && canWrite && <div className="suggestions">{starters.map(item => <button key={item} onClick={() => send(item)}>{item}<span>↗</span></button>)}</div>}<form className="composer" onSubmit={(event: FormEvent) => { event.preventDefault(); send(); }}><textarea disabled={!canWrite} value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} placeholder={!sessionId ? "请先新建员工或游客对话" : canWrite ? "描述问题，Agent 会检索知识并调用合适的工具…" : "只读历史，不能以他人身份发送消息"}/><div><span>{canWrite ? "Enter 发送 · Shift + Enter 换行" : "只读模式"}</span><button disabled={!canWrite || !input.trim() || loading}>发送 ↑</button></div></form></section><aside className="insight"><div className="panelTitle"><span>查看身份</span><i>{currentSession?.mode === "guest" ? "GUEST" : "EMPLOYEE"}</i></div><div className="identityCard"><div>{currentSession?.displayName.slice(0, 1) || "?"}</div><b>{currentSession?.displayName || "未选择"}</b><small>{canWrite ? "可继续对话" : `由 ${viewerSession?.displayName || "管理员"} 只读查看`}</small></div><div className="metricGrid"><div><b>{documents.length}</b><small>可检索文档</small></div><div><b>{openCount}</b><small>待处理工单</small></div></div><div className="guard"><b>历史权限已开启</b><p>mqf 可查看全部历史；其他员工仅能查看同名会话；游客只能查看自己的会话。</p></div></aside></div>}

      {tab === "tickets" && <div className="contentPage"><div className="toolbar"><div className="search">⌕ 搜索工单</div><button onClick={() => { setTab("chat"); setInput("请帮我创建一个工单："); }}>＋ 新建工单</button></div><div className="table"><div className="tr th"><span>工单</span><span>分类</span><span>优先级</span><span>状态</span><span>提交人</span><span>操作</span></div>{tickets.map(ticket => <div className="tr" key={ticket.id}><span><b>{ticket.title}</b><small>{ticket.id}</small></span><span>{ticket.category}</span><span><i className={`priority ${ticket.priority}`}>{ticket.priority === "high" ? "高" : ticket.priority === "low" ? "低" : "普通"}</i></span><span><i className={`ticketStatus ${ticket.status}`}>{ticket.status === "closed" ? "已关闭" : ticket.status === "resolved" ? "已解决" : "处理中"}</i></span><span>{ticket.requester}</span><span><select value={ticket.status} onChange={event => updateTicket(ticket, event.target.value)}><option value="open">处理中</option><option value="resolved">已解决</option><option value="closed">已关闭</option></select></span></div>)}</div></div>}

      {tab === "knowledge" && <div className="contentPage">{viewerSession?.mode === "employee" && <div className="uploadCard" onClick={() => fileRef.current?.click()}><div>＋</div><h3>添加企业资料</h3><p>上传 TXT、Markdown 或 CSV，Agent 会自动加入检索索引</p><button>选择文件</button><input ref={fileRef} hidden type="file" accept=".txt,.md,.csv" onChange={event => upload(event.target.files?.[0])}/></div>}<div className="docHeader"><h2>已索引文档</h2><span>{documents.length} 份资料 · 点击可预览</span></div><div className="docGrid">{documents.map(document => <article key={document.id}><button className="docMain" onClick={() => previewDocument(document)}><div className="fileIcon">{document.name.endsWith(".md") ? "MD" : "TXT"}</div><div><b>{document.name}</b><small>{document.chunkCount} 个知识片段 · 可检索</small></div></button><div className="docActions"><button onClick={() => previewDocument(document)}>预览</button>{viewerSession?.mode === "employee" && <button className="danger" onClick={() => deleteDocument(document)}>删除</button>}</div></article>)}</div></div>}
    </section>

    {showNewSession && <div className="modalBackdrop" onMouseDown={event => { if (event.target === event.currentTarget) closeSessionModal(); }}><section className="modal sessionModal" role="dialog" aria-modal="true"><button className="modalClose" aria-label="关闭登录窗口" onClick={closeSessionModal}>×</button><span className="modalEyebrow">SECURE SIGN IN</span><h2>员工密码登录</h2><p>首次使用的员工姓名会自动注册；以后必须使用同一密码登录。mqf 使用独立管理员密码。</p><label>员工姓名<input autoFocus value={employeeName} onChange={event => setEmployeeName(event.target.value)} placeholder="例如：林小满" maxLength={30}/></label><label>登录密码<input type="password" name="resolve-ai-employee-password" value={password} onChange={event => setPassword(event.target.value)} onKeyDown={event => { if (event.key === "Enter") createSession("employee"); }} placeholder="至少 8 位" autoComplete="new-password" data-1p-ignore="true" data-lpignore="true"/></label><button className="primaryWide" onClick={() => createSession("employee")}>登录并新建对话</button><div className="modalDivider"><span>或者</span></div><button className="guestWide" onClick={() => createSession("guest")}>使用游客模式</button></section></div>}

    {preview && <div className="modalBackdrop" onMouseDown={event => { if (event.target === event.currentTarget) setPreview(null); }}><section className="modal previewModal" role="dialog" aria-modal="true"><button className="modalClose" onClick={() => setPreview(null)}>×</button><span className="modalEyebrow">KNOWLEDGE PREVIEW</span><h2>{preview.name}</h2><div className="previewMeta"><span>{preview.contentType || "text/markdown"}</span><span>{preview.chunkCount} 个知识片段</span><span>状态：可检索</span></div><pre>{preview.content}</pre><footer>{viewerSession?.mode === "employee" && <button className="dangerButton" onClick={() => deleteDocument(preview)}>删除文档</button>}<button className="primaryButton" onClick={() => setPreview(null)}>关闭预览</button></footer></section></div>}

    {notice && <button className="toast" onClick={() => setNotice("")}>{notice}<span>×</span></button>}
  </main>;
}
