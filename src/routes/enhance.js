const express = require('express');
const multer = require('multer');
const { pool } = require('../db');
const { requireAuth } = require('../auth');
const { enhanceImage } = require('../enhance-engine');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 Mo max
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('seules les images sont acceptees pour le moment'));
    }
    cb(null, true);
  },
});

function hasActivePlan(user) {
  return !!user && user.plan !== 'none' && ['active', 'trialing'].includes(user.plan_status);
}

const router = express.Router();

router.post('/', requireAuth, (req, res) => {
  upload.single('photo')(req, res, async (uploadErr) => {
    if (uploadErr) {
      return res.status(400).json({ error: 'upload_failed', message: uploadErr.message });
    }

    try {
      const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.userId]);
      const user = result.rows[0];
      if (!user) return res.status(401).json({ error: 'not_authenticated' });
      if (!hasActivePlan(user)) {
        return res.status(403).json({ error: 'no_active_plan', message: 'Un abonnement actif est necessaire.' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'missing_file', message: 'Aucune photo recue.' });
      }

      // Plan hebdomadaire -> jusqu'a 2K, plan a vie -> jusqu'a la 4K (voir la page tarifs).
      // La personne peut choisir une resolution plus basse depuis l'interface, mais jamais
      // au-dessus de ce que son plan autorise (on reverifie toujours cote serveur).
      const planCap = user.plan === 'lifetime' ? 3840 : 2048;
      let requestedWidth = parseInt(req.body.maxWidth, 10);
      if (!Number.isFinite(requestedWidth) || requestedWidth <= 0) requestedWidth = planCap;
      const maxWidth = Math.min(requestedWidth, planCap);

      const allowedRatios = ['free', 'square', 'portrait', 'landscape'];
      const ratio = allowedRatios.includes(req.body.ratio) ? req.body.ratio : 'free';
      const quality = req.body.quality === 'fast' ? 'fast' : 'max';

      const outputUrl = await enhanceImage(req.file.buffer, { maxWidth, ratio, quality });

      const inserted = await pool.query(
        'INSERT INTO enhancements (user_id, max_width, image_data) VALUES ($1, $2, $3) RETURNING id, created_at',
        [user.id, maxWidth, outputUrl]
      );
      // On garde seulement les 20 dernieres photos par personne pour ne pas gonfler la base gratuitement.
      await pool.query(
        'DELETE FROM enhancements WHERE user_id = $1 AND id NOT IN (SELECT id FROM enhancements WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20)',
        [user.id]
      );

      res.json({ url: outputUrl, id: inserted.rows[0].id, createdAt: inserted.rows[0].created_at });
    } catch (err) {
      console.error("Erreur d'amelioration:", err.message);
      res.status(500).json({ error: 'enhance_failed', message: err.message });
    }
  });
});

router.get('/history', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, max_width, image_data, created_at FROM enhancements WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
      [req.userId]
    );
    const items = result.rows.map((r) => ({
      id: r.id,
      maxWidth: r.max_width,
      url: r.image_data,
      createdAt: r.created_at,
    }));
    res.json({ items });
  } catch (err) {
    console.error('Erreur historique:', err.message);
    res.status(500).json({ error: 'history_failed', message: err.message });
  }
});

router.delete('/history/:id', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM enhancements WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Erreur suppression historique:', err.message);
    res.status(500).json({ error: 'delete_failed', message: err.message });
  }
});

module.exports = router;
