// Standalone env loader. Imported FIRST by server.js so that dotenv.config()
// runs before any other module's top-level code reads process.env.
//
// Why this file exists:
//   ES module imports are hoisted and evaluated DEPTH-FIRST. If `server.js`
//   does `import dotenv from 'dotenv'; dotenv.config();` at the top, that's
//   STILL too late: by the time the `dotenv.config()` *statement* runs,
//   every other `import` in server.js has already been fully resolved —
//   including all routes and middleware, whose top-level constants like
//   `const JWT_SECRET = process.env.JWT_SECRET;` have already been evaluated
//   against an empty process.env.
//
//   The only reliable fix is to put the dotenv.config() call into a module
//   whose entire body finishes BEFORE the next import resolves. Node
//   guarantees that imported modules are fully evaluated top-to-bottom
//   before control returns to the importing file. So if server.js does:
//
//       import './load-env.js';   // <-- finishes synchronously, populates env
//       import authRoutes from './routes/auth.js';  // <-- now sees populated env
//
//   then by the time auth.js's top-level code runs, process.env.JWT_SECRET
//   is set correctly.

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = join(__dirname, '.env');

if (fs.existsSync(ENV_PATH)) {
  const result = dotenv.config({ path: ENV_PATH });
  if (result.error) {
    console.error(`✗ Failed to parse ${ENV_PATH}:`, result.error.message);
  } else {
    console.log(`✓ Loaded .env from ${ENV_PATH} (${Object.keys(result.parsed || {}).length} vars)`);
  }
} else {
  console.error(`✗ No .env file found at ${ENV_PATH}`);
  console.error('  Create one — see .env.example in the same folder for the template.');
  // Last-ditch fallback: try the default behaviour (CWD-based) just in case.
  dotenv.config();
}
