require('dotenv').config();
const app = require('./app');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || (process.env.NODE_ENV === 'production' && /change.?me|secret/i.test(process.env.JWT_SECRET))) {
  console.error('[InquiryBox] Set JWT_SECRET to a unique random value of at least 32 characters');
  process.exit(1);
}

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`[InquiryBox] Server is running on http://localhost:${PORT}`);
  console.log(`[InquiryBox] Health check available at http://localhost:${PORT}/api/health`);
});

server.on('error', (err) => {
  console.error('[InquiryBox] Server error:', err.message);
  process.exit(1);
});

async function shutdown(signal) {
  console.log(`[InquiryBox] ${signal} received; closing server`);
  server.close(async () => {
    try { await require('./config/db').pool.end(); process.exit(0); }
    catch (_) { process.exit(1); }
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

module.exports = server;
