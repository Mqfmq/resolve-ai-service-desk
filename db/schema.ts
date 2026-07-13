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
});

export const conversationMemory = sqliteTable("conversation_memory", {
  id: text("id").primaryKey(),
  summary: text("summary").notNull(),
  sourceCount: integer("source_count").notNull(),
  updatedAt: text("updated_at").notNull(),
});
