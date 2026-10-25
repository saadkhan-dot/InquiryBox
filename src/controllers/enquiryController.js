const db = require('../config/db');
const VALID_STATUSES = ['new', 'in_progress', 'resolved'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SORTS = { created_at: 'created_at', updated_at: 'updated_at', customer_name: 'customer_name', status: 'status' };
const validId = value => typeof value === 'string' && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value));
const fail = (res, details) => res.status(400).json({ error: 'Validation failed', details });
const own = user => user.role === 'admin' ? '' : 'user_id = $1';

async function createEnquiry(req, res, next) {
  try {
    const b = req.body;
    if (!b || typeof b !== 'object' || Array.isArray(b)) return fail(res, ['Request body must be a JSON object']);
    const errors = [];
    for (const [key, max] of [['customer_name',100],['email',255],['subject',150],['message',10000]]) {
      if (typeof b[key] !== 'string' || !b[key].trim()) errors.push(`${key} is required and must be a non-empty string`);
      else if (b[key].trim().length > max) errors.push(`${key} must be at most ${max} characters`);
    }
    if (typeof b.email === 'string' && !EMAIL.test(b.email.trim())) errors.push('email must be a valid email address');
    if (b.phone !== undefined && b.phone !== null && (typeof b.phone !== 'string' || b.phone.trim().length > 20)) errors.push('phone must be at most 20 characters');
    if (b.status !== undefined && !VALID_STATUSES.includes(b.status)) errors.push('unsupported status');
    if (errors.length) return fail(res, errors);
    const values = [req.user.id, b.customer_name.trim(), b.email.trim().toLowerCase(), typeof b.phone === 'string' ? (b.phone.trim() || null) : null, b.subject.trim(), b.message.trim(), b.status || 'new'];
    const result = await db.query('INSERT INTO enquiries (user_id, customer_name, email, phone, subject, message, status) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *', values);
    return res.status(201).json({ data: result.rows[0] });
  } catch (e) { next(e); }
}
async function getAllEnquiries(req, res, next) {
  try {
    const q = req.query;
    const errors = [];
    const single = key => q[key] === undefined || typeof q[key] === 'string';
    for (const key of ['limit','offset','status','search','sort','order']) if (!single(key)) errors.push(`${key} must be supplied once`);
    const limit = q.limit === undefined ? 20 : Number(q.limit), offset = q.offset === undefined ? 0 : Number(q.offset);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) errors.push('limit must be an integer from 1 to 100');
    if (!Number.isSafeInteger(offset) || offset < 0) errors.push('offset must be a non-negative integer');
    if (q.status && !VALID_STATUSES.includes(q.status)) errors.push('unsupported status');
    if (q.search && q.search.length > 200) errors.push('search must be at most 200 characters');
    const sort = q.sort || 'created_at', order = (q.order || 'desc').toLowerCase();
    if (!SORTS[sort]) errors.push('unsupported sort field');
    if (!['asc','desc'].includes(order)) errors.push('order must be asc or desc');
    if (errors.length) return fail(res, errors);
    const conditions = [], params = [];
    if (req.user.role !== 'admin') { params.push(req.user.id); conditions.push(`user_id = $${params.length}`); }
    if (q.status) { params.push(q.status); conditions.push(`status = $${params.length}`); }
    if (q.search) { params.push(`%${q.search}%`); conditions.push(`(customer_name ILIKE $${params.length} OR email ILIKE $${params.length} OR subject ILIKE $${params.length} OR message ILIKE $${params.length})`); }
    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
    const count = await db.query(`SELECT COUNT(*)::int AS total FROM enquiries${where}`, params);
    params.push(limit, offset);
    const data = await db.query(`SELECT * FROM enquiries${where} ORDER BY ${SORTS[sort]} ${order.toUpperCase()}, id ASC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    return res.json({ count: data.rows.length, total: count.rows[0].total, limit, offset, data: data.rows });
  } catch (e) { next(e); }
}
async function getEnquiryById(req, res, next) {
  try {
    if (!validId(req.params.id)) return fail(res, ['ID must be a positive integer']);
    const admin = req.user.role === 'admin';
    const result = admin ? await db.query('SELECT * FROM enquiries WHERE id = $1', [Number(req.params.id)]) : await db.query('SELECT * FROM enquiries WHERE id = $1 AND user_id = $2', [Number(req.params.id), req.user.id]);
    return result.rows.length ? res.json({ data: result.rows[0] }) : res.status(404).json({ error: 'Not found', message: 'Enquiry not found' });
  } catch (e) { next(e); }
}
async function updateEnquiryStatus(req, res, next) {
  try {
    if (!validId(req.params.id)) return fail(res, ['ID must be a positive integer']);
    if (!req.body || Object.keys(req.body).some(k => k !== 'status') || !VALID_STATUSES.includes(req.body.status)) return fail(res, [`status must be one of: ${VALID_STATUSES.join(', ')}`]);
    const result = req.user.role === 'admin'
      ? await db.query('UPDATE enquiries SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *', [req.body.status, Number(req.params.id)])
      : await db.query('UPDATE enquiries SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3 RETURNING *', [req.body.status, Number(req.params.id), req.user.id]);
    return result.rows.length ? res.json({ data: result.rows[0] }) : res.status(404).json({ error: 'Not found', message: 'Enquiry not found' });
  } catch (e) { next(e); }
}
async function deleteEnquiry(req, res, next) {
  try {
    if (!validId(req.params.id)) return fail(res, ['ID must be a positive integer']);
    const result = req.user.role === 'admin' ? await db.query('DELETE FROM enquiries WHERE id = $1 RETURNING id', [Number(req.params.id)]) : await db.query('DELETE FROM enquiries WHERE id = $1 AND user_id = $2 RETURNING id', [Number(req.params.id), req.user.id]);
    return result.rows.length ? res.json({ message: 'Enquiry deleted successfully', deletedId: result.rows[0].id }) : res.status(404).json({ error: 'Not found', message: 'Enquiry not found' });
  } catch (e) { next(e); }
}
module.exports = { createEnquiry, getAllEnquiries, getEnquiryById, updateEnquiryStatus, deleteEnquiry };
