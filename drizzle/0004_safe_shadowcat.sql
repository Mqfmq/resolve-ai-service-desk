CREATE TABLE `knowledge_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`content` text NOT NULL,
	`embedding` text,
	`embedding_model` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `knowledge_chunks_document_idx` ON `knowledge_chunks` (`document_id`,`chunk_index`);