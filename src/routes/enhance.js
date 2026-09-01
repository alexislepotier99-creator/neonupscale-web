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

      // Plan hebdomadaire -> jusqu'a 2K, plan a vie -> jusqu'a la 4K (voir la page tarifs)
      const maxWidth = user.plan === 'lifetime' ? 3840 : 2048;
      const outputUrl = await enhanceImage(req.file.buffer, { maxWidth });
      res.json({ url: outputUrl });
    } catch (err) {
      console.error("Erreur d'amelioration:", err.message);
      res.status(500).json({ error: 'enhance_failed', message: err.message });
    }
  });
});

module.exports = router;
