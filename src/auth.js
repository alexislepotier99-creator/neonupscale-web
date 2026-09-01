const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function signSession(userId) {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET n\'est pas defini');
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

function verifySession(token) {
  if (!process.env.JWT_SECRET) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

async function verifyGoogleCredential(idToken) {
  if (!process.env.GOOGLE_CLIENT_ID) {
    throw new Error('GOOGLE_CLIENT_ID n\'est pas defini cote serveur');
  }
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  return ticket.getPayload(); // { sub, email, name, picture, ... }
}

function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies.session;
  const payload = token && verifySession(token);
  if (!payload) return res.status(401).json({ error: 'not_authenticated' });
  req.userId = payload.userId;
  next();
}

module.exports = { signSession, verifySession, verifyGoogleCredential, requireAuth };
