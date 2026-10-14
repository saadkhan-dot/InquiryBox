require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`[InquiryBox] Server is running on http://localhost:${PORT}`);
  console.log(`[InquiryBox] Health check available at http://localhost:${PORT}/api/health`);
});

server.on('error', (err) => {
  console.error('[InquiryBox] Server error:', err.message);
  process.exit(1);
});

module.exports = server;
