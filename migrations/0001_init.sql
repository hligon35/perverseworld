CREATE TABLE IF NOT EXISTS products (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT 'tees',
 price_cents INTEGER NOT NULL CHECK(price_cents>=0), image_url TEXT NOT NULL DEFAULT '',
 badge TEXT NOT NULL DEFAULT '', sizes_json TEXT NOT NULL DEFAULT '{}',
 active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS submissions (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL,
 subject TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS subscribers (
 id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'active',
 consent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, unsub_token TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS newsletters (
 id INTEGER PRIMARY KEY AUTOINCREMENT, subject TEXT NOT NULL, preheader TEXT NOT NULL DEFAULT '',
 body_html TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft',
 sent_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS mailbox (
 id INTEGER PRIMARY KEY AUTOINCREMENT, direction TEXT NOT NULL, sender TEXT NOT NULL,
 recipient TEXT NOT NULL, subject TEXT NOT NULL DEFAULT '', body_text TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'unread', external_id TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(active, category);
CREATE INDEX IF NOT EXISTS idx_submissions_created ON submissions(created_at);
CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers(status);
CREATE INDEX IF NOT EXISTS idx_mailbox_created ON mailbox(created_at);
INSERT INTO products (id,name,description,category,price_cents,image_url,badge,sizes_json) VALUES
(1,'Otherworld Graphic Tee','Heather gray / signature graphic','tees',3500,'builtin:1','SIGNATURE','{"S":10,"M":10,"L":10,"XL":10}'),
(2,'Worldscape Tee','White / landscape print','tees',3800,'builtin:2','NEW DROP','{"S":10,"M":10,"L":10,"XL":10}'),
(3,'Green Flame Set','Gray / matching streetwear','sets',7800,'builtin:3','HEAD TURNER','{"S":5,"M":5,"L":5,"XL":5}'),
(4,'Midnight Riot Hoodie','Black / graphic hoodie','hoodies',6500,'builtin:4','HOT ITEM','{"S":5,"M":5,"L":5,"XL":5}'),
(5,'World Logo Hoodie','Light gray / logo front','hoodies',6500,'builtin:5','CLASSIC','{"S":5,"M":5,"L":5,"XL":5}'),
(6,'Possessed Hand Graphic','Black / artwork concept','sets',3000,'builtin:6','ART SERIES','{"S":5,"M":5,"L":5,"XL":5}');
CREATE TABLE IF NOT EXISTS newsletter_deliveries (
 newsletter_id INTEGER NOT NULL, subscriber_id INTEGER NOT NULL, provider_id TEXT NOT NULL DEFAULT '',
 sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(newsletter_id,subscriber_id)
);