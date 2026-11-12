ALTER TABLE products ADD COLUMN options_json TEXT NOT NULL DEFAULT '[]';
UPDATE products SET name='Worldscape Tee',description='White / landscape print',category='tees',price_cents=2800,image_url='builtin:2',updated_at=CURRENT_TIMESTAMP WHERE id=2;
UPDATE products SET name='Perverse Puppeteer Tee',description='Black / puppeteer graphic',category='tees',price_cents=2800,image_url='builtin:3',updated_at=CURRENT_TIMESTAMP WHERE id=3;
UPDATE products SET name='Midnight Terror Hoodie',description='Black / graphic hoodie',category='hoodies',price_cents=6500,image_url='builtin:4',updated_at=CURRENT_TIMESTAMP WHERE id=4;
UPDATE products SET name='World Logo Set',description='Black / hoodie and sweatpants',category='sets',price_cents=4500,image_url='builtin:5',options_json='[{"id":"hoodie","price_cents":6500},{"id":"sweats","price_cents":4500}]',updated_at=CURRENT_TIMESTAMP WHERE id=5;
