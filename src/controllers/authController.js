const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const safeUser = ({ id, name, email, role, created_at }) => ({ id, name, email, role, ...(created_at ? { created_at } : {}) });

async function register(req, res, next) {
  try {
    const { name, email, password } = req.body || {};
    const errors = [];
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) errors.push('name must be a non-empty string of at most 100 characters');
    if (typeof email !== 'string' || email.trim().length > 255 || !EMAIL.test(email.trim())) errors.push('email must be a valid address of at most 255 characters');
    if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) errors.push('password must be at least 12 characters, at most 72 UTF-8 bytes, and include lowercase, uppercase, and a number');
    if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });
    const hash = await bcrypt.hash(password, 12);
    const result = await db.query('INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, created_at', [name.trim(), email.trim().toLowerCase(), hash, 'user']);
    return res.status(201).json({ data: safeUser(result.rows[0]) });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Conflict', message: 'An account with this email already exists' });
    return next(err);
  }
}
async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || !EMAIL.test(email.trim()) || typeof password !== 'string' || !password) return res.status(400).json({ error: 'Validation failed', details: ['Valid email and password are required'] });
    const result = await db.query('SELECT id, name, email, password_hash, role, created_at FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Unauthorized', message: 'Invalid email or password' });
    if (!process.env.JWT_SECRET) return next(new Error('JWT configuration unavailable'));
    const token = jwt.sign({}, process.env.JWT_SECRET, { subject: String(user.id), expiresIn: process.env.JWT_EXPIRES_IN || '1h', algorithm: 'HS256' });
    return res.json({ token, token_type: 'Bearer', expires_in: process.env.JWT_EXPIRES_IN || '1h', user: safeUser(user) });
  } catch (err) { return next(err); }
}
function me(req, res) { return res.json({ data: safeUser(req.user) }); }
module.exports = { register, login, me };
