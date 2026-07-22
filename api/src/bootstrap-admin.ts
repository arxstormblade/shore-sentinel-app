import bcrypt from 'bcryptjs';
import pg from 'pg';

export async function bootstrapAdmin(pool: Pick<pg.Pool, 'query'>, environment: NodeJS.ProcessEnv = process.env) {
  const password = environment.SEED_ADMIN_PASSWORD?.trim();
  if (!password || password.length < 16) throw new Error('SEED_ADMIN_PASSWORD is required for explicit bootstrap');
  const email = (environment.SEED_ADMIN_EMAIL ?? 'admin@shore360.local').trim().toLowerCase();
  const displayName = (environment.SEED_ADMIN_NAME ?? 'Initial Administrator').trim();
  const tenant = await pool.query<{ id: string }>('SELECT id FROM tenants WHERE slug=$1', ['shore360']);
  if (!tenant.rows[0]) throw new Error('bootstrap tenant is unavailable');
  const hash = await bcrypt.hash(password, 12);
  const created = await pool.query<{ id: string }>(
    `INSERT INTO users (tenant_id,email,display_name,password_hash)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (email) DO NOTHING
     RETURNING id`, [tenant.rows[0].id, email, displayName, hash]);
  const user = created.rows[0] ?? (await pool.query<{ id: string }>('SELECT id FROM users WHERE email=$1 AND tenant_id=$2', [email, tenant.rows[0].id])).rows[0];
  if (!user) throw new Error('bootstrap administrator unavailable');
  await pool.query("INSERT INTO user_roles (user_id,role_id) SELECT $1,id FROM roles WHERE name='admin' ON CONFLICT DO NOTHING", [user.id]);
  return { created: Boolean(created.rows[0]), userId: user.id };
}

if (process.argv[2] === 'bootstrap-admin') {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  bootstrapAdmin(pool).then((result) => process.stdout.write(`${JSON.stringify({ component: 'bootstrap-admin', status: 'complete', ...result })}\n`)).catch((error: unknown) => {
    process.stderr.write(`${JSON.stringify({ component: 'bootstrap-admin', status: 'failed', error: error instanceof Error ? error.message : 'bootstrap failed' })}\n`);
    process.exitCode = 1;
  }).finally(() => pool.end());
}
