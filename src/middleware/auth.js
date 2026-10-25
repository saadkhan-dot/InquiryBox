const jwt = require('jsonwebtoken');
const db = require('../config/db');

function secret() { return process.env.JWT_SECRET; }
async function authenticate(req, res, next) {
  const header = req.get('authorization') || '';
  const match = /^Bearer ([^\s]+)$/i.exec(header);
  if (!match || !secret()) return res.status(401).json({ error: 'Unauthorized', message: 'A valid Bearer token is required' });
  let payload;
  try {
    payload = jwt.verify(match[1], secret(), { algorithms: ['HS256'] });
    if (!payload.sub || !/^\d+$/.test(String(payload.sub))) throw new Error('invalid subject');
  } catch (_) { return res.status(401).json({ error: 'Unauthorized', message: 'A valid Bearer token is required' }); }
  try {
    const result = await db.query('SELECT id, name, email, role FROM users WHERE id = $1', [Number(payload.sub)]);
    if (!result.rows.length) return res.status(401).json({ error: 'Unauthorized', message: 'A valid Bearer token is required' });
    req.user = result.rows[0];
    return next();
  } catch (error) { return next(error); }
}
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden', message: 'Administrator access is required' });
  next();
}
module.exports = { authenticate, requireAdmin };
