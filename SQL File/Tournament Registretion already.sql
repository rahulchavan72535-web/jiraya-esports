CREATE TABLE IF NOT EXISTS tournament_registrations (
    id SERIAL PRIMARY KEY,
    tournament_id INT REFERENCES tournaments(id) ON DELETE CASCADE,
    player_uid VARCHAR(50) NOT NULL,
    slot_number INT NOT NULL,
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tournament_id, player_uid),     -- Ek player ek tournament mein do baar register nahi kar sakta
    UNIQUE(tournament_id, slot_number)     -- Ek tournament ka ek slot do alag players ko nahi mil sakta
);