UPDATE events
SET guest_token = guest_token_hash
WHERE guest_token != guest_token_hash;
