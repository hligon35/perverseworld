-- Archive the two artwork/mockup entries without deleting catalog history.
UPDATE products SET active=0, updated_at=CURRENT_TIMESTAMP WHERE id IN (1,6);
