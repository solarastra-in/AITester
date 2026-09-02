const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me-in-production';
const TOKEN_TTL = '7d';

function hashPassword(pw) {
  return bcrypt.hashSync(pw, 10);
}

function checkPassword(pw, hash) {
  return bcrypt.compareSync(pw, hash);
}

function issueToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, org_id: user.org_id }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function createUser({ email, password, name, role, org_id = null, credits_balance = 0, must_reset_password = 0 }) {
  const id = uuid();
  db.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id, credits_balance, must_reset_password, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, email.toLowerCase().trim(), hashPassword(password), name || email.split('@')[0], role, org_id, credits_balance, must_reset_password, new Date().toISOString());
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function findUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
}

function findUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

// Express middleware: requires a valid bearer token, attaches req.user
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing bearer token' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = findUserById(payload.sub);
    if (!user) return res.status(401).json({ error: 'User no longer exists' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Requires role: ${roles.join(' or ')}` });
    }
    next();
  };
}

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id, email: u.email, name: u.name, role: u.role, org_id: u.org_id,
    credits_balance: u.credits_balance, must_reset_password: !!u.must_reset_password,
  };
}

module.exports = {
  hashPassword, checkPassword, issueToken, createUser, findUserByEmail, findUserById,
  requireAuth, requireRole, publicUser, JWT_SECRET,
};
