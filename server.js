require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const Stripe = require('stripe');

const { initSchema } = require('./src/db');
const authRoutes = require('./src/routes/auth');
const checkoutRoutes = require('./src/routes/checkout');
const { handleStripeWebhook } = require('./src/routes/webhook');

const app = express();
const PORT = process.env.PORT || 3000;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
  apiVersion: '2024-06-20',
});

app.set('trust proxy', 1);

// Le webhook Stripe a besoin du corps BRUT de la requete (pour verifier la signature).
// Cette route doit donc etre declaree AVANT express.json() ci-dessous.
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), (req, res) =>
  handleStripeWebhook(req, res, stripe)
);

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/checkout', checkoutRoutes(stripe));

app.get('/api/health', (req, res) => res.json({ ok: true }));

initSchema()
  .then(() => {
    app.listen(PORT, () => console.log(`NeonUpscale server pret sur le port ${PORT}`));
  })
  .catch((err) => {
    console.error('Impossible d\'initialiser la base de donnees:', err.message);
    process.exit(1);
  });
