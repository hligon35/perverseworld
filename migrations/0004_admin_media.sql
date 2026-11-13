ALTER TABLE products ADD COLUMN images_json TEXT NOT NULL DEFAULT '[]';
CREATE INDEX IF NOT EXISTS idx_mailbox_folder ON mailbox(direction,status,id);
ALTER TABLE mailbox ADD COLUMN provider_id TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_mailbox_provider ON mailbox(provider_id) WHERE provider_id!='';
