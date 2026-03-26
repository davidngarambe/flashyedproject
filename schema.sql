-- ═══════════════════════════════════════════════════════════════
--  FlashyEd — Supabase Database Schema
-- ═══════════════════════════════════════════════════════════════
--
-- HOW TO RUN THIS:
--   1. Open your Supabase project at https://supabase.com/dashboard
--   2. Go to: SQL Editor (left sidebar)
--   3. Click "New query"
--   4. Paste this entire file and click "Run"
--
-- You only need to do this ONCE when setting up a new project.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(255),
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(20) DEFAULT 'student',
    is_active     BOOLEAN DEFAULT true,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS flashcards (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title      VARCHAR(255),
    source     TEXT,
    cards      JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS quizzes (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title      VARCHAR(255),
    source     TEXT,
    questions  JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attempts (
    id         SERIAL PRIMARY KEY,
    quiz_id    INTEGER REFERENCES quizzes(id) ON DELETE CASCADE,
    user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
    score      INTEGER,
    total      INTEGER,
    time_sec   INTEGER DEFAULT 0,
    answers    JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_flashcards_user_id ON flashcards(user_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_user_id    ON quizzes(user_id);
CREATE INDEX IF NOT EXISTS idx_attempts_quiz_id   ON attempts(quiz_id);
CREATE INDEX IF NOT EXISTS idx_attempts_user_id   ON attempts(user_id);
