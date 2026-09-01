const express = require('express');
const { pool } = require('../db');
const {
  verifyGoogleCredential,
  signSession,
  requireAuth,
  hashPassword,
  verifyPassword,
  generateVerificationCode,
} = require('../auth');
const { sendVerificationEmail } = require('../mailer');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes

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

// ---- Compte par email + mot de passe ----

router.post('/signup', async (req, res) => {
  try {
    const { email, password, name } = req.body || {};
    if (!email || !EMAIL_RE.test(String(email).trim())) {
      return res.status(400).json({ error: 'invalid_email' });
    }
    if (!password || String(password).length < 8) {
      return res.status(400).json({ error: 'weak_password' });
    }
    const normalizedEmail = String(email).trim().toLowerCase();

    const existing = await pool.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);
    const passwordHash = await hashPassword(String(password));

    let user;
    if (existing.rows.length) {
      const row = existing.rows[0];
      if (row.password_hash && row.email_verified) {
        return res.status(409).json({ error: 'email_already_registered' });
      }
      const updated = await pool.query(
        `UPDATE users
         SET password_hash = $1, name = COALESCE($2, name), verification_code = $3, verification_code_expires_at = $4
         WHERE id = $5 RETURNING *`,
        [passwordHash, name || null, code, expiresAt, row.id]
      );
      user = updated.rows[0];
    } else {
      const inserted = await pool.query(
        `INSERT INTO users (email, name, password_hash, verification_code, verification_code_expires_at)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [normalizedEmail, name || null, passwordHash, code, expiresAt]
      );
      user = inserted.rows[0];
    }

    await sendVerificationEmail(user.email, code);
    res.json({ ok: true, email: user.email });
  } catch (err) {
    console.error('Erreur inscription:', err.message);
    if (err.message === 'email_service_not_configured') {
      return res.status(500).json({
        error: 'email_service_not_configured',
        message: "L'envoi d'email n'est pas configure sur le serveur (RESEND_API_KEY manquant).",
      });
    }
    res.status(500).json({ error: 'signup_failed' });
  }
});

router.post('/verify-email', async (req, res) => {
  try {
    const { email, code } = req.body || {};
    if (!email || !code) return res.status(400).json({ error: 'missing_fields' });
    const normalizedEmail = String(email).trim().toLowerCase();

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
    const user = result.rows[0];
    if (!user || !user.verification_code) return res.status(400).json({ error: 'invalid_code' });
    if (user.verification_code !== String(code).trim()) return res.status(400).json({ error: 'invalid_code' });
    if (user.verification_code_expires_at && new Date(user.verification_code_expires_at) < new Date()) {
      return res.status(400).json({ error: 'code_expired' });
    }

    const updated = await pool.query(
      `UPDATE users SET email_verified = true, verification_code = NULL, verification_code_expires_at = NULL
       WHERE id = $1 RETURNING *`,
      [user.id]
    );
    const token = signSession(updated.rows[0].id);
    res.cookie('session', token, COOKIE_OPTS);
    res.json({ user: publicUser(updated.rows[0]) });
  } catch (err) {
    console.error('Erreur verification email:', err.message);
    res.status(500).json({ error: 'verify_failed' });
  }
});

router.post('/resend-code', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'missing_email' });
    const normalizedEmail = String(email).trim().toLowerCase();

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
    const user = result.rows[0];
    // On repond "ok" meme si le compte n'existe pas ou est deja verifie, pour ne pas
    // reveler quels emails ont un compte.
    if (!user || user.email_verified || !user.password_hash) return res.json({ ok: true });

    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);
    await pool.query(
      'UPDATE users SET verification_code = $1, verification_code_expires_at = $2 WHERE id = $3',
      [code, expiresAt, user.id]
    );
    await sendVerificationEmail(user.email, code);
    res.json({ ok: true });
  } catch (err) {
    console.error('Erreur renvoi de code:', err.message);
    res.status(500).json({ error: 'resend_failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'missing_fields' });
    const normalizedEmail = String(email).trim().toLowerCase();

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
    const user = result.rows[0];
    if (!user || !user.password_hash) return res.status(401).json({ error: 'invalid_credentials' });

    const ok = await verifyPassword(String(password), user.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid_credentials' });
    if (!user.email_verified) return res.status(403).json({ error: 'email_not_verified' });

    const token = signSession(user.id);
    res.cookie('session', token, COOKIE_OPTS);
    res.json({ user: publicUser(user) });
  } catch (err) {
    console.error('Erreur connexion:', err.message);
    res.status(500).json({ error: 'login_failed' });
  }
});

module.exports = router;
