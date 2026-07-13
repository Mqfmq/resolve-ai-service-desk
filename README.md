# Resolve AI：企业智能服务台

Resolve AI 是一个面向企业客服与内部服务台场景的 AI Agent 项目。它将企业知识库检索、故障诊断、工单管理和执行轨迹整合到一个工作台中，让每次回答都有来源、每次操作都有记录。

## 项目亮点

- 企业知识库：支持上传 TXT、Markdown 和 CSV 文档，并自动生成可检索知识片段。
- 混合检索问答：根据用户问题召回相关资料，回答中展示引用来源和内容摘要。
- Agent 工具路由：自动判断用户意图，在知识检索、风险识别和工单创建之间选择工具。
- 工单处理闭环：支持工单自动分类、优先级判断、创建、查询和状态更新。
- 执行过程可追踪：展示意图识别、文档检索、风险判断和工具调用等完整轨迹。
- 安全降级：检测安全事件、数据泄露和大面积故障等高风险信号，并建议转人工处理。
- 持久化存储：使用 Cloudflare D1 保存知识、工单和对话记录，使用 R2 保存上传的原始文件。
- 响应式界面：适配桌面端、平板和移动端。

## 演示流程

可以在 Agent 对话中输入：

> 企业账号重置密码后仍无法登录，错误码 SSO-403，请帮我处理。

Agent 将执行以下步骤：

1. 识别为账号登录故障；
2. 检索企业账号故障处理指南；
3. 返回带引用来源的诊断建议；
4. 识别 SSO-403 高风险信号；
5. 自动创建“账号与权限”高优先级工单；
6. 保存对话、引用与工具调用轨迹。

## 技术架构

- 前端：Next.js 16、React 19、TypeScript
- 全栈运行时：vinext、Cloudflare Workers
- 数据库：Cloudflare D1、Drizzle ORM
- 文件存储：Cloudflare R2
- AI 接口：DeepSeek Chat Completions API（首选）、OpenAI Responses API（备用）
- 样式：Tailwind CSS 4 + 自定义响应式 CSS
- 部署：OpenAI Sites / Cloudflare

## 项目结构

```text
app/
├── api/
│   ├── bootstrap/      # 初始化知识库、工单和对话数据
│   ├── chat/           # Agent 检索、回答和工具调用
│   ├── documents/      # 文档上传与入库
│   └── tickets/        # 工单创建和状态更新
├── globals.css         # 产品界面与响应式样式
├── layout.tsx          # 页面元数据和社交分享配置
└── page.tsx            # Agent 工作台主界面
db/                     # Drizzle 数据表定义
drizzle/                # 数据库迁移文件
lib/store.ts            # D1、R2 与种子数据访问层
```

## 本地运行

### 环境要求

- Node.js 22.13 或更高版本
- npm

### 启动步骤

```bash
npm install
npm run dev
```

启动后访问 `http://localhost:3000`。

### 构建与检查

```bash
npx tsc --noEmit
npm run build
npm run db:generate
```

## 配置 AI 模型

项目没有配置 API Key 时仍可使用本地检索式回答和工单工具。默认优先调用 DeepSeek：

```env
DEEPSEEK_API_KEY=你的密钥
```

也可以配置 OpenAI 作为备用模型：

```env
OPENAI_API_KEY=你的密钥
```

请勿将真实 API Key 提交到 Git 仓库。

## 当前支持范围

- 已支持：TXT、Markdown、CSV 文档上传与检索。
- 已支持：知识问答、引用、风险判断和工单流转。
- 已支持：D1 数据持久化和 R2 原文件保存。
- 后续计划：PDF/Word 解析、向量检索与重排序、用户认证、离线评测集和 Agent 可观测性。

## 简历描述参考

> 基于 Next.js、Cloudflare Workers 与 OpenAI API 构建企业知识库和工单处理 Agent，实现知识检索、引用问答、风险识别、工单自动创建及执行轨迹追踪；使用 D1 和 R2 完成结构化数据与文档持久化，并通过响应式工作台展示完整业务闭环。

## 许可证

本项目用于学习、作品集展示与 AI Agent 工程实践。
