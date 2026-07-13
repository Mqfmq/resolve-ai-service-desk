import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  contentType: text("content_type").notNull(),
  content: text("content").notNull(),
  status: text("status").notNull(),
  chunkCount: integer("chunk_count").notNull(),
  createdAt: text("created_at").notNull(),
});

export const tickets = sqliteTable("tickets", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  priority: text("priority").notNull(),
  status: text("status").notNull(),
  requester: text("requester").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  citations: text("citations").notNull(),
  trace: text("trace").notNull(),
  createdAt: text("created_at").notNull(),
  sessionId: text("session_id").notNull().default("legacy"),
});

export const agentSessions = sqliteTable("agent_sessions", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  mode: text("mode").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  accountId: text("account_id"),
  authTokenHash: text("auth_token_hash"),
});

export const employeeAccounts = sqliteTable("employee_accounts", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  normalizedName: text("normalized_name").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  role: text("role").notNull(),
  createdAt: text("created_at").notNull(),
});

export const conversationMemory = sqliteTable("conversation_memory", {
  id: text("id").primaryKey(),
  summary: text("summary").notNull(),
  sourceCount: integer("source_count").notNull(),
  updatedAt: text("updated_at").notNull(),
});
