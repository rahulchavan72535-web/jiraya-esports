-- 1. Users table (Players ki details)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    in_game_name VARCHAR(100) NOT NULL,
    free_fire_uid VARCHAR(50) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tournaments table
CREATE TABLE IF NOT EXISTS tournaments (
    id SERIAL PRIMARY KEY,
    title VARCHAR(150) NOT NULL,
    game VARCHAR(50) DEFAULT 'Free Fire',
    entry_fee INT NOT NULL DEFAULT 0,
    status VARCHAR(50) DEFAULT 'upcoming',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Match Results table (Kills aur Points store karne ke liye)
CREATE TABLE IF NOT EXISTS match_results (
    id SERIAL PRIMARY KEY,
    tournament_id INT REFERENCES tournaments(id),
    player_uid VARCHAR(50) NOT NULL,
    rank INT NOT NULL,
    kills INT NOT NULL DEFAULT 0,
    total_points INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);