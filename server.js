require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const path = require('path');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
// Database connection (Supabase via DATABASE_URL)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});


// 1. Connection check route
app.get('/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ message: 'Database Connected Successfully!', time: result.rows[0].now });
  } catch (err) {
    res.status(500).json({ 
      error: 'Database connection failed!', 
      message: err.message, 
      code: err.code 
    });
  }
});

// 2. Tournament list dekhne wali API
app.get('/api/tournaments', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tournaments ORDER BY id ASC');
    res.status(200).json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Tournaments load nahi ho paye!' });
  }
});

// 3. Naya Tournament create karne wali API
app.post('/api/create-tournament', async (req, res) => {
  try {
    const { title, game_type, entry_fee, prize_pool, total_slots, match_time } = req.body;
    
    if (!title || !game_type || !entry_fee || !prize_pool || !total_slots || !match_time) {
      return res.status(400).json({ error: 'Sabhi fields zaroori hain!' });
    }

    const query = `
      INSERT INTO tournaments (title, game_type, entry_fee, prize_pool, total_slots, match_time)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;
    `;
    const values = [title, game_type, entry_fee, prize_pool, total_slots, match_time];
    const newTournament = await pool.query(query, values);

    res.status(201).json({
      message: 'Tournament successfully create ho gaya!',
      tournament: newTournament.rows[0]
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Tournament create nahi ho paya!' });
  }
});

// 4. Player register karne wali API
app.post('/api/register-player', async (req, res) => {
  try {
    const { username, in_game_name, free_fire_uid } = req.body;

    if (!username || !in_game_name || !free_fire_uid) {
      return res.status(400).json({ error: 'Sabhi fields zaroori hain!' });
    }

    const query = 'INSERT INTO users (username, in_game_name, free_fire_uid) VALUES ($1, $2, $3) RETURNING *';
    const newUser = await pool.query(query, [username, in_game_name, free_fire_uid]);

    res.status(201).json({
      message: 'Player successfully register ho gaya!',
      player: newUser.rows[0]
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Yeh Free Fire UID pehle se registered hai!' });
    }
    console.error(err);
    res.status(500).json({ error: 'Registration failed!' });
  }
});

// 5. Tournament join / Slot book karne wali API
app.post('/api/join-tournament', async (req, res) => {
  try {
    const { tournament_id, player_uid, slot_number } = req.body;

    if (!tournament_id || !player_uid || !slot_number) {
      return res.status(400).json({ error: 'Tournament ID, Player UID aur Slot Number sabhi zaroori hain!' });
    }

    const query = `
      INSERT INTO tournament_registrations (tournament_id, player_uid, slot_number)
      VALUES ($1, $2, $3) RETURNING *;
    `;
    const registration = await pool.query(query, [tournament_id, player_uid, slot_number]);

    res.status(201).json({
      message: 'Slot successfully book ho gaya!',
      data: registration.rows[0]
    });
  } catch (err) {
    console.error(err);
    if (err.detail && err.detail.includes('player_uid')) {
      return res.status(400).json({ error: 'Aap pehle hi is tournament mein join ho chuke hain!' });
    }
    if (err.detail && err.detail.includes('slot_number')) {
      return res.status(400).json({ error: 'Yeh slot pehle hi kisi aur ne book kar liya hai!' });
    }
    res.status(500).json({ error: 'Server error! Slot book nahi ho saka.' });
  }
});

// 6. Booked Slots dekhne wali API
app.get('/api/tournament-slots/:tournament_id', async (req, res) => {
  try {
    const { tournament_id } = req.params;
    const query = `
      SELECT tr.slot_number, tr.player_uid, u.in_game_name
      FROM tournament_registrations tr
      LEFT JOIN users u ON tr.player_uid = u.free_fire_uid
      WHERE tr.tournament_id = $1
      ORDER BY tr.slot_number ASC;
    `;
    const result = await pool.query(query, [tournament_id]);

    res.status(200).json({
      tournament_id: Number(tournament_id),
      booked_slots: result.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Slots fetch karne mein error aayi!' });
  }
});

// 7. Room details update karne wali API (Admin)
app.post('/api/update-room', async (req, res) => {
  try {
    const { tournament_id, room_id, room_password } = req.body;

    if (!tournament_id || !room_id || !room_password) {
      return res.status(400).json({ error: 'Sabhi fields zaroori hain!' });
    }

    const query = `
      UPDATE tournaments
      SET room_id = $1, room_password = $2
      WHERE id = $3 RETURNING *;
    `;
    const updated = await pool.query(query, [room_id, room_password, tournament_id]);

    res.status(200).json({
      message: 'Room details update ho gayi!',
      tournament: updated.rows[0]
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Room details update nahi ho payi!' });
  }
});

// 8. Room details dekhne wali API
app.get('/api/room-details/:tournament_id', async (req, res) => {
  try {
    const { tournament_id } = req.params;
    const query = 'SELECT room_id, room_password FROM tournaments WHERE id = $1';
    const result = await pool.query(query, [tournament_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tournament nahi mila!' });
    }

    const roomData = result.rows[0];
    res.status(200).json({
      room_id: roomData.room_id,
      room_password: roomData.room_password
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error! Room details load nahi ho payi.' });
  }
});
// 8. Match Result Submit Karne Wali API
app.post('/api/submit-result', async (req, res) => {
  const { tournament_id, player_uid, rank, kills } = req.body;

  if (!tournament_id || !player_uid || rank === undefined || kills === undefined) {
    return res.status(400).json({ error: 'Tournament ID, Player UID, Rank aur Kills sabhi zaroori hain!' });
  }

  try {
    // Pehle check karo ki kya result pehle se exist karta hai
    const checkQuery = `
      SELECT id FROM match_results 
      WHERE tournament_id = $1 AND player_uid = $2
    `;
    const existing = await pool.query(checkQuery, [tournament_id, player_uid]);

    let result;
    if (existing.rows.length > 0) {
      // Exist karta hai toh Update karo
      const updateQuery = `
        UPDATE match_results 
        SET rank = $3, kills = $4 
        WHERE tournament_id = $1 AND player_uid = $2 
        RETURNING *;
      `;
      result = await pool.query(updateQuery, [tournament_id, player_uid, rank, kills]);
    } else {
      // Naya record insert karo
      const insertQuery = `
        INSERT INTO match_results (tournament_id, player_uid, rank, kills) 
        VALUES ($1, $2, $3, $4) 
        RETURNING *;
      `;
      result = await pool.query(insertQuery, [tournament_id, player_uid, rank, kills]);
    }

    res.status(200).json({
      message: 'Result successfully save ho gaya!',
      data: result.rows[0]
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error! Result save nahi ho saka.' });
  }
});
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
// Port & Server Listen
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server ${PORT} port par chalu ho gaya hai!`);
});
