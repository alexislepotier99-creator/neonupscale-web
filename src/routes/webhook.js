const { pool } = require('../db');

async function handleStripeWebhook(req, res, stripe) {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Signature webhook invalide:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata && session.metadata.userId;
        const plan = session.metadata && session.metadata.plan;
        // L'achat "a vie" est un paiement unique: on active direct.
        // L'abonnement "hebdomadaire" est confirme par les evenements subscription.* ci-dessous.
        if (userId && plan === 'lifetime') {
          await pool.query(
            'UPDATE users SET plan = $1, plan_status = $2 WHERE id = $3',
            ['lifetime', 'active', userId]
          );
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        await pool.query(
          `UPDATE users SET plan = 'weekly', plan_status = $1 WHERE stripe_customer_id = $2`,
          [sub.status, sub.customer]
        );
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await pool.query(
          `UPDATE users SET plan_status = 'canceled' WHERE stripe_customer_id = $1`,
          [sub.customer]
        );
        break;
      }
      default:
        break;
    }
    res.json({ received: true });
  } catch (err) {
    console.error('Erreur de traitement du webhook:', err.message);
    res.status(500).json({ error: 'webhook_handler_failed' });
  }
}

module.exports = { handleStripeWebhook };
