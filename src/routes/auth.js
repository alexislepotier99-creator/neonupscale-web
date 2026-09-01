const express = require('express');
const { pool } = require('../db');
const { verifyGoogleCredential, signSession, requireAuth } = require('../auth');

const router = express.Router();

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    picture: row.picture,
    plan: row.plan,
    planStatus: row.plan_status,
  };
}

router.post('/google', async (req, res) => {
  const { credential } = req.body || {};
  if (!credential) return res.status(400).json({ error: 'missing_credential' });

  try {
    const payload = await verifyGoogleCredential(credential);
    const { sub, email, name, picture } = payload;

    const existing = await pool.query('SELECT * FROM users WHERE google_sub = $1', [sub]);
    let user;
    if (existing.rows.length) {
      user = existing.rows[0];
    } else {
      const inserted = await pool.query(
        `INSERT INTO users (google_sub, email, name, picture) VALUES ($1,$2,$3,$4) RETURNING *`,
        [sub, email, name, picture]
      );
      user = inserted.rows[0];
    }

    const token = signSession(user.id);
    res.cookie('session', token, COOKIE_OPTS);
    res.json({ user: publicUser(user) });
  } catch (err) {
    console.error('Erreur de connexion Google:', err.message);
    res.status(401).json({ error: 'google_verification_failed' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.userId]);
  if (!result.rows.length) return res.status(401).json({ error: 'not_authenticated' });
  res.json({ user: publicUser(result.rows[0]) });
});

router.post('/logout', (req, res) => {
  res.clearCookie('session', COOKIE_OPTS);
  res.json({ ok: true });
});

module.exports = router;
