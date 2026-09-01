const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../auth');

module.exports = function checkoutRoutes(stripe) {
  const router = express.Router();

  router.post('/', requireAuth, async (req, res) => {
    const { plan, skipTrial } = req.body || {};
    if (!['weekly', 'lifetime'].includes(plan)) {
      return res.status(400).json({ error: 'invalid_plan' });
    }
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: 'stripe_not_configured' });
    }

    const priceId = plan === 'weekly' ? process.env.STRIPE_PRICE_WEEKLY : process.env.STRIPE_PRICE_LIFETIME;
    if (!priceId) {
      return res.status(500).json({ error: `missing_price_id_for_${plan}` });
    }

    try {
      const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [req.userId]);
      const user = userResult.rows[0];
      if (!user) return res.status(401).json({ error: 'not_authenticated' });

      let customerId = user.stripe_customer_id;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          name: user.name || undefined,
          metadata: { userId: String(user.id) },
        });
        customerId = customer.id;
        await pool.query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customerId, user.id]);
      }

      const baseUrl = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;

      const sessionParams = {
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${baseUrl}/?checkout=success`,
        cancel_url: `${baseUrl}/?checkout=cancel`,
        metadata: { userId: String(user.id), plan },
      };

      if (plan === 'weekly') {
        sessionParams.mode = 'subscription';
        sessionParams.subscription_data = {
          metadata: { userId: String(user.id) },
        };
        // On n'offre l'essai de 3 jours que si la personne ne l'a jamais utilise, et si
        // elle n'a pas explicitement choisi de payer tout de suite ("skipTrial").
        if (!skipTrial && !user.trial_used) {
          sessionParams.subscription_data.trial_period_days = 3;
        }
      } else {
        sessionParams.mode = 'payment';
      }

      const session = await stripe.checkout.sessions.create(sessionParams);
      res.json({ url: session.url });
    } catch (err) {
      console.error('Erreur Stripe checkout:', err.message);
      res.status(500).json({ error: 'checkout_failed' });
    }
  });

  return router;
};
