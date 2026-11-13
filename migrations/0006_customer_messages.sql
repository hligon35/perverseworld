ALTER TABLE subscribers ADD COLUMN confirm_token_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE subscribers ADD COLUMN confirm_expires_at TEXT;
ALTER TABLE subscribers ADD COLUMN confirmed_at TEXT;
ALTER TABLE subscribers ADD COLUMN optin_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscribers ADD COLUMN confirmation_requested_at TEXT;
UPDATE subscribers SET confirmed_at=consent_at WHERE status='active';
CREATE TABLE IF NOT EXISTS subscriber_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 subscriber_id INTEGER NOT NULL,
 event TEXT NOT NULL CHECK(event IN ('confirmed','unsubscribed')),
 optin_version INTEGER NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(subscriber_id,event,optin_version)
);
INSERT INTO subscriber_events(subscriber_id,event,optin_version,created_at) SELECT id,'confirmed',optin_version,consent_at FROM subscribers WHERE status='active';
CREATE INDEX IF NOT EXISTS idx_subscriber_events_date ON subscriber_events(event,created_at);
CREATE INDEX IF NOT EXISTS idx_subscriber_confirmation ON subscribers(confirm_token_hash) WHERE confirm_token_hash!='';
ALTER TABLE submissions ADD COLUMN request_key TEXT NOT NULL DEFAULT '';
ALTER TABLE mailbox ADD COLUMN reply_to TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_submission_request ON submissions(request_key) WHERE request_key!='';
CREATE TABLE IF NOT EXISTS email_outbox (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL,
 recipient TEXT NOT NULL,
 payload_json TEXT NOT NULL,
 subscriber_id INTEGER,
 optin_version INTEGER,
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','sent','failed','cancelled')),
 attempts INTEGER NOT NULL DEFAULT 0,
 provider_id TEXT NOT NULL DEFAULT '',
 last_error TEXT NOT NULL DEFAULT '',
 next_attempt_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 locked_until TEXT,
 first_attempt_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 sent_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_outbox_due ON email_outbox(status,next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_outbox_locked ON email_outbox(status,locked_until);
CREATE INDEX IF NOT EXISTS idx_outbox_recipient_kind ON email_outbox(recipient,kind,created_at);

CREATE INDEX IF NOT EXISTS idx_submission_email_time ON submissions(email,created_at);
