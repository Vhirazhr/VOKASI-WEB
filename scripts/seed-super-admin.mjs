import postgres from 'postgres';
import bcrypt from 'bcryptjs';

const databaseUrl = process.env.DATABASE_URL?.trim();
const username = process.env.INITIAL_SUPER_ADMIN_USERNAME?.trim();
const password = process.env.INITIAL_SUPER_ADMIN_PASSWORD ?? '';
const displayName = (process.env.INITIAL_SUPER_ADMIN_DISPLAY_NAME ?? 'Super Admin').trim().slice(0, 120);

if (!databaseUrl) throw new Error('Set DATABASE_URL before running this one-time bootstrap.');
if (!username || username.length < 2 || username.length > 254) throw new Error('INITIAL_SUPER_ADMIN_USERNAME must contain 2-254 characters.');
if (password.length < 14 || Buffer.byteLength(password, 'utf8') > 72) {
  throw new Error('INITIAL_SUPER_ADMIN_PASSWORD must be at least 14 characters and no more than 72 UTF-8 bytes.');
}
if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SUPER_ADMIN_BOOTSTRAP !== 'yes') {
  throw new Error('For a production bootstrap, explicitly set ALLOW_SUPER_ADMIN_BOOTSTRAP=yes for this one-time command.');
}

const sslMode = (process.env.DATABASE_SSL ?? 'disable').trim().toLowerCase();
if (sslMode !== 'disable' && sslMode !== 'require') throw new Error('DATABASE_SSL must be disable or require.');

const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 10,
  prepare: false,
  ssl: sslMode === 'require' ? 'require' : false,
});

try {
  const passwordHash = await bcrypt.hash(password, 12);
  await sql.begin(async tx => {
    const [existing] = await tx`
      SELECT id FROM public.app_users
      WHERE lower(btrim(username)) = ${username.toLowerCase()}
         OR lower(btrim(COALESCE(email, ''))) = ${username.toLowerCase()}
      LIMIT 1
      FOR UPDATE
    `;
    if (existing) throw new Error('That login identifier already exists; refusing to overwrite it.');

    const [superAdmin] = await tx`SELECT user_id FROM public.school_admins WHERE access_role = 'super_admin' LIMIT 1`;
    if (superAdmin) throw new Error('A Super Admin already exists; refusing to create another.');

    const email = username.includes('@') ? username.toLowerCase() : null;
    const [user] = await tx`
      INSERT INTO public.app_users (username, email, display_name, password_hash, is_active)
      VALUES (${username}, ${email}, ${displayName}, ${passwordHash}, true)
      RETURNING id
    `;
    await tx`
      INSERT INTO public.school_admins (user_id, display_name, is_active, access_role)
      VALUES (${user.id}, ${displayName || 'Super Admin'}, true, 'super_admin')
    `;
  });
  process.stdout.write('Super Admin bootstrap completed. No password was printed.\n');
} finally {
  await sql.end({ timeout: 5 });
}
