/* eslint-disable no-console */
/**
 * Entry point used by the Windows Service wrapper. A service starts with an
 * arbitrary working directory (and the SYSTEM account), so we pin the working
 * directory to the project root BEFORE loading the server. That makes the
 * app's `.env`, `frontend/dist` and `uploads/` resolve exactly as they do when
 * you run `npm run serve` by hand.
 */
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
process.chdir(ROOT);
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

// Boot the compiled NestJS server.
require(path.join(ROOT, 'dist', 'src', 'main.js'));
