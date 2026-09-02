const db = require('./db');
const { createUser, findUserByEmail } = require('./auth');

function bootstrap() {
  const existing = db.prepare("SELECT COUNT(*) as n FROM users WHERE role = 'platform_admin'").get();
  if (existing.n > 0) return;

  const email = process.env.PLATFORM_ADMIN_EMAIL || 'admin@verity.local';
  const password = process.env.PLATFORM_ADMIN_PASSWORD || 'changeme123';
  if (findUserByEmail(email)) return;

  createUser({ email, password, name: 'Platform Admin', role: 'platform_admin', credits_balance: 0 });
  console.log('----------------------------------------------------------------');
  console.log(' First run: platform admin account created');
  console.log(`   email:    ${email}`);
  console.log(`   password: ${password}`);
  if (!process.env.PLATFORM_ADMIN_PASSWORD) {
    console.log('   (default password — set PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD env vars before deploying for real, and change this on first login)');
  }
  console.log('----------------------------------------------------------------');
}

module.exports = { bootstrap };
