// Envoi d'emails via l'API HTTP de Resend (https://resend.com) - pas besoin de configurer
// un serveur SMTP, juste une cle API (variable d'environnement RESEND_API_KEY sur Render).
//
// IMPORTANT : sans domaine verifie sur Resend, l'adresse d'envoi par defaut
// "onboarding@resend.dev" ne peut envoyer des emails qu'a l'adresse du compte Resend
// lui-meme (limitation imposee par Resend, pas par ce code). Pour envoyer de vrais
// codes de verification a n'importe quel client, il faut verifier un nom de domaine
// dans le tableau de bord Resend puis definir RESEND_FROM_EMAIL avec une adresse de
// ce domaine (ex: "NeonUpscale <noreply@votredomaine.com>").

async function sendVerificationEmail(to, code) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('email_service_not_configured');
  }
  const from = process.env.RESEND_FROM_EMAIL || 'NeonUpscale <onboarding@resend.dev>';

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: 'Your NeonUpscale verification code',
      html: `
        <div style="font-family:Arial,sans-serif;background:#050409;color:#f1edf8;padding:32px;border-radius:16px;">
          <h2 style="margin:0 0 16px;color:#fff;">NeonUpscale</h2>
          <p style="margin:0 0 8px;">Here is your verification code:</p>
          <p style="font-size:32px;font-weight:800;letter-spacing:8px;margin:16px 0;color:#EC4899;">${code}</p>
          <p style="color:#9a93b3;font-size:13px;margin:0;">This code expires in 15 minutes. If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`resend_request_failed: ${response.status} ${text}`);
  }
}

module.exports = { sendVerificationEmail };
