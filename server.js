require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Database connection
const pool = new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME
});

// 1. Connection check route
app.get('/test-db', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.json({ message: "Database connected successfully!", time: result.rows[0].now });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database connection failed!" });
    }
});

// 2. Tournament create karne wali API
app.post('/api/create-tournament', async (req, res) => {
    try {
        const { title, entry_fee } = req.body;
        
        const allowedFees = [0, 10, 20, 50];
        if (!allowedFees.includes(entry_fee)) {
            return res.status(400).json({ error: "Invalid entry fee! Sirf 0, 10, 20, ya 50 allow hai." });
        }

        const query = 'INSERT INTO tournaments (title, entry_fee) VALUES ($1, $2) RETURNING *';
        const newTournament = await pool.query(query, [title, entry_fee]);
        
        res.status(201).json({
            message: "Tournament successfully create ho gaya!",
            tournament: newTournament.rows[0]
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error! Tournament create nahi ho paya." });
    }
});

// 3. Saare tournaments dekhne wali API
app.get('/api/tournaments', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, title, game, entry_fee, created_at FROM tournaments ORDER BY id DESC');
        res.status(200).json({
            count: result.rows.length,
            tournaments: result.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Tournaments load nahi ho paye!" });
    }
});

// 4. Player register karne wali API
app.post('/api/register-player', async (req, res) => {
    try {
        const { username, in_game_name, free_fire_uid } = req.body;

        if (!username || !in_game_name || !free_fire_uid) {
            return res.status(400).json({ error: "Sabhi fields zaroori hain!" });
        }

        const query = 'INSERT INTO users (username, in_game_name, free_fire_uid) VALUES ($1, $2, $3) RETURNING *';
        const newUser = await pool.query(query, [username, in_game_name, free_fire_uid]);

        res.status(201).json({
            message: "Player successfully register ho gaya!",
            player: newUser.rows[0]
        });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({ error: "Yeh Free Fire UID pehle se registered hai!" });
        }
        console.error(err);
        res.status(500).json({ error: "Server error! Registration nahi ho paya." });
    }
});

// 5. Match Result submit karne wali API
app.post('/api/submit-result', async (req, res) => {
    try {
        const { tournament_id, player_uid, rank, kills } = req.body;

        if (!tournament_id || !player_uid || rank === undefined || kills === undefined) {
            return res.status(400).json({ error: "Sabhi fields zaroori hain!" });
        }

        let rankPoints = 0;
        if (rank === 1) rankPoints = 12;
        else if (rank === 2) rankPoints = 9;
        else if (rank === 3) rankPoints = 8;
        else if (rank === 4) rankPoints = 7;
        else if (rank <= 10) rankPoints = 11 - rank;

        const totalPoints = rankPoints + (kills * 2);

        const query = `
            INSERT INTO match_results (tournament_id, player_uid, rank, kills, total_points) 
            VALUES ($1, $2, $3, $4, $5) 
            RETURNING *
        `;
        const result = await pool.query(query, [tournament_id, player_uid, rank, kills, totalPoints]);

        res.status(201).json({
            message: "Result successfully save ho gaya!",
            data: result.rows[0]
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error! Result submit nahi ho saka." });
    }
});

// 6. Tournament Leaderboard dekhne wali API
app.get('/api/leaderboard/:tournament_id', async (req, res) => {
    try {
        const { tournament_id } = req.params;

        const query = `
            SELECT 
                mr.rank, 
                mr.player_uid, 
                u.in_game_name, 
                mr.kills, 
                mr.total_points 
            FROM match_results mr
            LEFT JOIN users u ON mr.player_uid = u.free_fire_uid
            WHERE mr.tournament_id = $1
            ORDER BY mr.total_points DESC, mr.kills DESC
        `;
        const result = await pool.query(query, [tournament_id]);

        res.status(200).json({
            tournament_id: Number(tournament_id),
            leaderboard: result.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Leaderboard fetch nahi ho paya!" });
    }
});

// 7. Tournament Join / Slot Booking API
app.post('/api/join-tournament', async (req, res) => {
    try {
        const { tournament_id, player_uid, slot_number } = req.body;

        if (!tournament_id || !player_uid || !slot_number) {
            return res.status(400).json({ error: "Tournament ID, Player UID aur Slot number zaroori hain!" });
        }

        if (slot_number < 1 || slot_number > 48) {
            return res.status(400).json({ error: "Slot number 1 se 48 ke beech hona chahiye!" });
        }

        const userCheck = await pool.query('SELECT * FROM users WHERE free_fire_uid = $1', [player_uid]);
        if (userCheck.rows.length === 0) {
            return res.status(404).json({ error: "Player registered nahi hai! Pehle register karein." });
        }

        const query = `
            INSERT INTO tournament_registrations (tournament_id, player_uid, slot_number)
            VALUES ($1, $2, $3)
            RETURNING *
        `;
        const booking = await pool.query(query, [tournament_id, player_uid, slot_number]);

        res.status(201).json({
            message: "Slot successfully book ho gaya!",
            registration: booking.rows[0]
        });
    } catch (err) {
        if (err.code === '23505') {
            if (err.detail.includes('slot_number')) {
                return res.status(400).json({ error: "Yeh slot pehle se kisi aur ne book kar liya hai!" });
            }
            if (err.detail.includes('player_uid')) {
                return res.status(400).json({ error: "Aap pehle hi is tournament mein join ho chuke hain!" });
            }
        }
        console.error(err);
        res.status(500).json({ error: "Server error! Slot book nahi ho saka." });
    }
});

// 8. Booked Slots dekhne wali API
app.get('/api/tournament-slots/:tournament_id', async (req, res) => {
    try {
        const { tournament_id } = req.params;
        const query = `
            SELECT tr.slot_number, tr.player_uid, u.in_game_name 
            FROM tournament_registrations tr
            LEFT JOIN users u ON tr.player_uid = u.free_fire_uid
            WHERE tr.tournament_id = $1
            ORDER BY tr.slot_number ASC
        `;
        const result = await pool.query(query, [tournament_id]);

        res.status(200).json({
            tournament_id: Number(tournament_id),
            booked_slots: result.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Slots load nahi ho paye!" });
    }
});

// 9. Admin: Set Room ID & Password
app.post('/api/set-room-details', async (req, res) => {
    try {
        const { tournament_id, room_id, room_password } = req.body;

        if (!tournament_id || !room_id || !room_password) {
            return res.status(400).json({ error: "Tournament ID, Room ID aur Password zaroori hain!" });
        }

        const query = `
            UPDATE tournaments 
            SET room_id = $1, room_password = $2 
            WHERE id = $3 
            RETURNING id, title, room_id, room_password
        `;
        const result = await pool.query(query, [room_id, room_password, tournament_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Tournament nahi mila!" });
        }

        res.status(200).json({
            message: "Room ID & Password successfully update ho gaya!",
            tournament: result.rows[0]
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Room details update nahi ho saki!" });
    }
});

// 10. Player: Get Room Details
app.post('/api/get-room-details', async (req, res) => {
    try {
        const { tournament_id, player_uid } = req.body;

        if (!tournament_id || !player_uid) {
            return res.status(400).json({ error: "Tournament ID aur Player UID zaroori hain!" });
        }

        const regCheck = await pool.query(
            'SELECT * FROM tournament_registrations WHERE tournament_id = $1 AND player_uid = $2',
            [tournament_id, player_uid]
        );

        if (regCheck.rows.length === 0) {
            return res.status(403).json({ error: "Access Denied! Aapne is tournament mein slot book nahi kiya hai." });
        }

        const tourCheck = await pool.query(
            'SELECT room_id, room_password FROM tournaments WHERE id = $1',
            [tournament_id]
        );

        const roomData = tourCheck.rows[0];
        if (!roomData.room_id || !roomData.room_password) {
            return res.status(200).json({
                ready: false,
                message: "Room abhi generate nahi hua hai. Match time par refresh karein!"
            });
        }

        res.status(200).json({
            ready: true,
            slot_number: regCheck.rows[0].slot_number,
            room_id: roomData.room_id,
            room_password: roomData.room_password
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error! Room details load nahi ho payi." });
    }
});

app.listen(5000, () => {
    console.log("Server 5000 port par chalu ho gaya hai!");
});
app.get('/', (req, res) => {
  res.send('Jiraya Esports Backend is Running Live!');
});