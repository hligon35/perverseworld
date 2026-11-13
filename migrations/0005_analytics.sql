CREATE TABLE IF NOT EXISTS daily_analytics (
 day TEXT NOT NULL,
 event TEXT NOT NULL CHECK(event IN ('page_view','store_entry','add_to_bag','bag_enquiry')),
 path TEXT NOT NULL,
 product_id INTEGER NOT NULL DEFAULT 0,
 count INTEGER NOT NULL DEFAULT 0 CHECK(count>=0),
 PRIMARY KEY(day,event,path,product_id)
);
CREATE INDEX IF NOT EXISTS idx_subscribers_created ON subscribers(created_at);
CREATE INDEX IF NOT EXISTS idx_deliveries_sent ON newsletter_deliveries(sent_at);
