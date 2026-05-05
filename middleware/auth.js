import jwt from 'jsonwebtoken';

// Read the secret once. Fail loudly if missing — refusing to start is safer
// than running with a default secret.
const JWT_SECRET = process.env.JWT_SECRET;
const PLACEHOLDER = 'replace_me_with_a_long_random_string_at_least_32_chars';

if (!JWT_SECRET) {
  console.error('✗ JWT_SECRET is not set. Server will refuse to issue or verify tokens.');
  console.error('  → Set JWT_SECRET in your .env file. Generate one with:');
  console.error('    node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
} else if (JWT_SECRET === PLACEHOLDER) {
  console.error('✗ JWT_SECRET is still set to the placeholder value from .env.example.');
  console.error('  → Replace it with a real secret in your .env file.');
} else if (JWT_SECRET.length < 32) {
  console.warn(`⚠ JWT_SECRET is only ${JWT_SECRET.length} characters. 32+ recommended for security.`);
} else {
  // Healthy secret. Print a confirmation so operators can see at boot time
  // that the secret was loaded correctly. Never print the secret itself.
  console.log(`✓ JWT_SECRET loaded (${JWT_SECRET.length} chars).`);
}

// Verify the Authorization: Bearer <token> header, attach req.user, or 401.
export function authenticate(req, res, next) {
  const auth = req.headers.authorization || '';
  const [scheme, token] = auth.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET || 'dev-only-do-not-use');
    req.user = payload;
    next();
  } catch (err) {
    // Either expired or tampered — both should give a 401 so the client can re-login.
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Optional admin-only middleware for routes that should be admin-restricted.
// Use after authenticate(): app.delete('/users/:id', authenticate, requireAdmin, ...)
export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  next();
}

// Helper to issue a token from a user document.
// We strip the passcode hash from the payload — only id/login/role/etc. go in.
export function issueToken(user) {
  const payload = {
    sub: user.id,
    login: user.login,
    name: user.name,
    role: user.role,
    departmentId: user.departmentId || null,
    stationId: user.stationId || null,
    allowedPages: user.allowedPages || [],
  };
  return jwt.sign(payload, JWT_SECRET || 'dev-only-do-not-use', {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}
