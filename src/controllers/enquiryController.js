const db = require('../config/db');

const VALID_STATUSES = ['new', 'in_progress', 'resolved'];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LIMITS = { customer_name: 100, email: 255, phone: 20, subject: 150 };

function validId(value) {
  return typeof value === 'string' && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value));
}

function validationError(res, details) {
  return res.status(400).json({ error: 'Validation failed', details });
}

const createEnquiry = async (req, res, next) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return validationError(res, ['Request body must be a JSON object']);
    const { customer_name, email, phone, subject, message, status } = body;
    const errors = [];
    for (const [field, value] of Object.entries({ customer_name, email, subject, message })) {
      if (typeof value !== 'string' || !value.trim()) errors.push(`${field} is required and must be a non-empty string`);
    }
    for (const field of ['customer_name', 'email', 'subject']) {
      const value = body[field];
      if (typeof value === 'string' && value.trim().length > LIMITS[field]) errors.push(`${field} must be at most ${LIMITS[field]} characters`);
    }
    if (typeof email === 'string' && email.trim() && !EMAIL_REGEX.test(email.trim())) errors.push('email must be a valid email address');
    if (typeof message === 'string' && message.length > 10000) errors.push('message must be at most 10000 characters');
    if (phone !== undefined && phone !== null && (typeof phone !== 'string' || phone.trim().length > LIMITS.phone)) errors.push('phone must be a string of at most 20 characters when supplied');
    if (status !== undefined && (typeof status !== 'string' || !VALID_STATUSES.includes(status))) errors.push(`status must be one of: ${VALID_STATUSES.join(', ')}`);
    if (errors.length) return validationError(res, errors);
    const result = await db.query(`INSERT INTO enquiries (customer_name, email, phone, subject, message, status)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`, [customer_name.trim(), email.trim().toLowerCase(), typeof phone === 'string' && phone.trim() ? phone.trim() : null, subject.trim(), message.trim(), status || 'new']);
    return res.status(201).json({ message: 'Enquiry submitted successfully', data: result.rows[0] });
  } catch (err) { next(err); }
};

const getAllEnquiries = async (req, res, next) => {
  try {
    const { status } = req.query;
    if (status !== undefined && (typeof status !== 'string' || !VALID_STATUSES.includes(status))) return validationError(res, [`status must be one of: ${VALID_STATUSES.join(', ')}`]);
    const result = status === undefined
      ? await db.query('SELECT * FROM enquiries ORDER BY created_at DESC')
      : await db.query('SELECT * FROM enquiries WHERE status = $1 ORDER BY created_at DESC', [status]);
    return res.status(200).json({ count: result.rows.length, data: result.rows });
  } catch (err) { next(err); }
};

const getEnquiryById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validId(id)) return res.status(400).json({ error: 'Invalid enquiry ID', message: 'ID must be a positive integer' });
    const result = await db.query('SELECT * FROM enquiries WHERE id = $1', [Number(id)]);
    if (!result.rows.length) return res.status(404).json({ error: 'Enquiry not found', message: `No enquiry found with ID ${id}` });
    return res.status(200).json({ data: result.rows[0] });
  } catch (err) { next(err); }
};

const updateEnquiryStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validId(id)) return res.status(400).json({ error: 'Invalid enquiry ID', message: 'ID must be a positive integer' });
    const { status } = req.body || {};
    if (typeof status !== 'string' || !VALID_STATUSES.includes(status)) return validationError(res, [`status must be one of: ${VALID_STATUSES.join(', ')}`]);
    const result = await db.query('UPDATE enquiries SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *', [status, Number(id)]);
    if (!result.rows.length) return res.status(404).json({ error: 'Enquiry not found', message: `No enquiry found with ID ${id}` });
    return res.status(200).json({ message: 'Enquiry status updated successfully', data: result.rows[0] });
  } catch (err) { next(err); }
};

const deleteEnquiry = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validId(id)) return res.status(400).json({ error: 'Invalid enquiry ID', message: 'ID must be a positive integer' });
    const result = await db.query('DELETE FROM enquiries WHERE id = $1 RETURNING id', [Number(id)]);
    if (!result.rows.length) return res.status(404).json({ error: 'Enquiry not found', message: `No enquiry found with ID ${id}` });
    return res.status(200).json({ message: 'Enquiry deleted successfully', deletedId: result.rows[0].id });
  } catch (err) { next(err); }
};

module.exports = { createEnquiry, getAllEnquiries, getEnquiryById, updateEnquiryStatus, deleteEnquiry };
