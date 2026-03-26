require('dotenv').config();

const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// SUPABASE / DB CONNECTION
const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('\n  ✗ SUPABASE_DB_URL is not set.');
  console.error('  Get it from: Supabase Dashboard → Project Settings → Database → URI\n');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

// MIDDLEWARE
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Redirect root to the landing page
app.get('/', (req, res) => {
  res.redirect('/index.html');
});

// HELPERS

// Convert snake_case DB rows to camel case for the frontend
function toCamel(row) {
  if (!row) return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const camelKey = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    out[camelKey] = v;
  }
  return out;
}

function rowsToCamel(rows) {
  return rows.map(toCamel);
}

// Admin middleware — checks x-user-role header
function adminOnly(req, res, next) {
  if (req.headers['x-user-role'] !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// TEST CONNECTION + SEED ADMIN
async function initDB() {
  // Verify connection
  await pool.query('SELECT 1');
  console.log('Connected to Supabase.');

  // Seed default admin account if it doesn't exist yet
  const adminEmail = 'admin@flashyed.edu';
  const exists = await pool.query('SELECT id FROM users WHERE email = $1', [adminEmail]);
  if (exists.rows.length === 0) {
    const hash = await bcrypt.hash('admin123', 10);
    await pool.query(
      "INSERT INTO users (name, email, password_hash, role) VALUES ('Admin', $1, $2, 'admin')",
      [adminEmail, hash]
    );
    console.log('Admin seeded → admin@flashyed.edu / admin123');
  }

  console.log('Database ready.');
}

// AUTH ROUTES

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (name, email, password_hash, role, is_active) VALUES ($1, $2, $3, 'student', true) RETURNING id, name, email, role, is_active, created_at",
      [name || email.split('@')[0], email.toLowerCase().trim(), hash]
    );
    res.json(toCamel(result.rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already registered' });
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (!result.rows.length) return res.status(401).json({ error: 'No account found with that email' });

    const user = result.rows[0];

    if (user.is_active === false) {
      return res.status(403).json({ error: 'Your account has been disabled. Contact your administrator.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Incorrect password' });

    res.json({
      id:        user.id,
      name:      user.name,
      email:     user.email,
      role:      user.role || 'student',
      isActive:  user.is_active,
      createdAt: user.created_at,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// FLASHCARD ROUTES

app.get('/api/flashcards', async (req, res) => {
  const { userId } = req.query;
  try {
    const result = await pool.query(
      'SELECT * FROM flashcards WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    res.json(rowsToCamel(result.rows));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/flashcards', async (req, res) => {
  const { userId, title, source, cards } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO flashcards (user_id, title, source, cards) VALUES ($1, $2, $3, $4) RETURNING *',
      [userId, title, source, JSON.stringify(cards)]
    );
    res.json(toCamel(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/flashcards/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM flashcards WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// QUIZ ROUTES 

app.get('/api/quizzes', async (req, res) => {
  const { userId } = req.query;
  try {
    const result = await pool.query(
      'SELECT * FROM quizzes WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    res.json(rowsToCamel(result.rows));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/quizzes', async (req, res) => {
  const { userId, title, source, questions } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO quizzes (user_id, title, source, questions) VALUES ($1, $2, $3, $4) RETURNING *',
      [userId, title, source, JSON.stringify(questions)]
    );
    res.json(toCamel(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/quizzes/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM quizzes WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Quiz not found' });
    res.json(toCamel(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/quizzes/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM quizzes WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ATTEMPT ROUTES

app.get('/api/quizzes/:quizId/attempts', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM attempts WHERE quiz_id = $1 ORDER BY created_at DESC',
      [req.params.quizId]
    );
    res.json(rowsToCamel(result.rows));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/quizzes/:quizId/attempts', async (req, res) => {
  const { userId, score, total, answers, timeSec } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO attempts (quiz_id, user_id, score, total, time_sec, answers) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [req.params.quizId, userId, score, total, timeSec || 0, JSON.stringify(answers)]
    );
    res.json(toCamel(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADMIN ROUTES

app.get('/api/admin/stats', adminOnly, async (req, res) => {
  try {
    const [users, fcs, quizzes, attempts] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM users WHERE role != 'admin'"),
      pool.query('SELECT COUNT(*) FROM flashcards'),
      pool.query('SELECT COUNT(*) FROM quizzes'),
      pool.query('SELECT COUNT(*) FROM attempts'),
    ]);
    res.json({
      users:         parseInt(users.rows[0].count),
      flashcardSets: parseInt(fcs.rows[0].count),
      quizzes:       parseInt(quizzes.rows[0].count),
      attempts:      parseInt(attempts.rows[0].count),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/users', adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, is_active, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(rowsToCamel(result.rows));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/admin/users/:id', adminOnly, async (req, res) => {
  const { isActive, role } = req.body;
  const updates = [];
  const values = [];
  let idx = 1;

  if (isActive !== undefined) { updates.push(`is_active = $${idx++}`); values.push(isActive); }
  if (role !== undefined)     { updates.push(`role = $${idx++}`);      values.push(role); }

  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });

  values.push(req.params.id);
  try {
    const result = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, name, email, role, is_active, created_at`,
      values
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(toCamel(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/users/:id', adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/all-flashcards', adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT f.id, f.title, f.source, f.created_at,
             jsonb_array_length(f.cards) AS card_count,
             u.name AS user_name, u.email AS user_email
      FROM flashcards f
      JOIN users u ON u.id = f.user_id
      ORDER BY f.created_at DESC
    `);
    res.json(result.rows.map(r => ({
      id:        r.id,
      title:     r.title,
      source:    r.source,
      createdAt: r.created_at,
      cardCount: parseInt(r.card_count) || 0,
      userName:  r.user_name,
      userEmail: r.user_email,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/all-quizzes', adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT q.id, q.title, q.source, q.created_at,
             jsonb_array_length(q.questions) AS question_count,
             u.name AS user_name, u.email AS user_email
      FROM quizzes q
      JOIN users u ON u.id = q.user_id
      ORDER BY q.created_at DESC
    `);
    res.json(result.rows.map(r => ({
      id:            r.id,
      title:         r.title,
      source:        r.source,
      createdAt:     r.created_at,
      questionCount: parseInt(r.question_count) || 0,
      userName:      r.user_name,
      userEmail:     r.user_email,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// AI GENERATE ROUTE

app.post('/api/generate', async (req, res) => {
  const { prompt, maxTokens = 2000 } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

  const apiKey = process.env.ANTHROPIC_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_KEY not configured in .env' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'AI service error' });
    }

    const raw = data.content?.map(b => b.text || '').join('').replace(/```json|```/g, '').trim();
    if (!raw) return res.status(500).json({ error: 'Empty AI response' });

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = raw.match(/\[[\s\S]*\]/);
      if (m) parsed = JSON.parse(m[0]);
      else return res.status(500).json({ error: 'Could not parse AI response' });
    }

    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// START
initDB()
  .then(() => {
    app.listen(PORT, () => console.log(`FlashyEd running → http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error('Database connection failed:', err.message);
    console.error('Check your SUPABASE_DB_URL in .env');
    process.exit(1);
  });