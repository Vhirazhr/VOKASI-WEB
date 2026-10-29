import 'server-only';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { getDatabase } from '@/lib/server/db';
import type { StudentProfile } from '@/lib/types';

export const SESSION_COOKIE_NAME = 'vokasi_session';
export const SESSION_TTL_SECONDS = 8 * 60 * 60;
const BCRYPT_COST = 12;

export type NativeRole = 'student' | 'admin' | 'super_admin';

export type NativeSessionUser = {
  id: string;
  username: string;
  email: string | null;
  displayName: string;
  role: NativeRole;
  profile: StudentProfile | null;
};

let dummyPasswordHash: Promise<string> | undefined;

function getDummyPasswordHash(): Promise<string> {
  dummyPasswordHash ??= bcrypt.hash(randomBytes(32).toString('hex'), BCRYPT_COST);
  return dummyPasswordHash;
}

export function requireSessionSecret(): string {
  const secret = process.env.SESSION_SECRET ?? '';
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 bytes.');
  }
  return secret;
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function hashRateLimitKey(value: string): string {
  return createHmac('sha256', requireSessionSecret()).update(value, 'utf8').digest('hex');
}

function isBcryptHash(value: string | null | undefined): value is string {
  return Boolean(value && /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(value));
}

export async function verifyPassword(password: string, storedHash: string | null | undefined): Promise<boolean> {
  const knownHash = isBcryptHash(storedHash);
  const candidate = knownHash ? storedHash : await getDummyPasswordHash();
  let matches = false;
  try {
    matches = await bcrypt.compare(password, candidate);
  } catch {
    matches = false;
  }
  return knownHash && matches && !bcrypt.truncates(password);
}

export async function hashPassword(password: string): Promise<string> {
  if (bcrypt.truncates(password)) {
    throw new Error('Password exceeds bcrypt’s 72-byte limit.');
  }
  return bcrypt.hash(password, BCRYPT_COST);
}

export function passwordHashNeedsUpgrade(hash: string): boolean {
  return isBcryptHash(hash) && bcrypt.getRounds(hash) < BCRYPT_COST;
}

export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;

  try {
    const parsedOrigin = new URL(origin);
    const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
    const requestHost = forwardedHost || request.headers.get('host');
    if (!requestHost || parsedOrigin.host.toLowerCase() !== requestHost.toLowerCase()) return false;
    if (process.env.NODE_ENV === 'production' && parsedOrigin.protocol !== 'https:') return false;
    return parsedOrigin.protocol === 'https:' || parsedOrigin.protocol === 'http:';
  } catch {
    return false;
  }
}

function clientIp(request: Request): string | null {
  const direct = request.headers.get('x-real-ip')?.trim();
  if (direct) return direct.slice(0, 100);
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded ? forwarded.slice(0, 100) : null;
}

export async function createNativeSession(userId: string, request: Request): Promise<void> {
  const db = getDatabase();
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashSessionToken(token);
  const ip = clientIp(request);
  const ipHash = ip ? hashRateLimitKey(`ip:${ip}`) : null;
  const userAgent = (request.headers.get('user-agent') ?? '').slice(0, 500) || null;

  await db`
    INSERT INTO public.app_sessions (user_id, token_hash, expires_at, ip_hash, user_agent)
    VALUES (
      ${userId}::uuid,
      ${tokenHash},
      now() + ${SESSION_TTL_SECONDS} * interval '1 second',
      ${ipHash},
      ${userAgent}
    )
  `;

  const jar = await cookies();
  jar.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function getCurrentNativeUser(): Promise<NativeSessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value;
  if (!token || token.length > 100) return null;

  const db = getDatabase();
  const tokenHash = hashSessionToken(token);
  const rows = await db`
    SELECT
      u.id::text AS id,
      u.username,
      u.email,
      COALESCE(NULLIF(u.display_name, ''), r.full_name, sa.display_name, u.username) AS display_name,
      CASE
        WHEN sa.access_role = 'super_admin' THEN 'super_admin'
        WHEN sa.user_id IS NOT NULL THEN 'admin'
        WHEN r.auth_user_id IS NOT NULL THEN 'student'
        ELSE NULL
      END AS role,
      s.id::text AS session_id,
      r.username AS roster_username,
      r.full_name,
      r.class_id::text AS class_id,
      c.class_name,
      COALESCE(r.major_id, c.major_id)::text AS major_id,
      m.name AS major_name
    FROM public.app_sessions AS s
    JOIN public.app_users AS u ON u.id = s.user_id
    LEFT JOIN public.school_admins AS sa ON sa.user_id = u.id AND sa.is_active = true
    LEFT JOIN public.student_roster AS r
      ON r.auth_user_id = u.id AND r.registration_status = 'registered'
    LEFT JOIN public.classes AS c ON c.id = r.class_id
    LEFT JOIN public.majors AS m ON m.id = COALESCE(r.major_id, c.major_id)
    WHERE s.token_hash = ${tokenHash}
      AND s.revoked_at IS NULL
      AND s.expires_at > now()
      AND u.is_active = true
    LIMIT 1
  `;

  const row = rows[0] as {
    id: string;
    username: string;
    email: string | null;
    display_name: string;
    role: NativeRole | null;
    session_id: string;
    roster_username: string | null;
    full_name: string | null;
    class_id: string | null;
    class_name: string | null;
    major_id: string | null;
    major_name: string | null;
  } | undefined;

  if (!row?.role) return null;

  await db`
    UPDATE public.app_sessions
    SET last_seen_at = now()
    WHERE id = ${row.session_id}::uuid
      AND last_seen_at < now() - interval '5 minutes'
  `;

  const profile = row.role === 'student' && row.class_id && row.class_name && row.major_id && row.major_name
    ? {
        authId: row.id,
        username: row.roster_username || row.username,
        fullName: row.full_name || row.display_name,
        classId: row.class_id,
        className: row.class_name,
        majorId: row.major_id,
        majorName: row.major_name,
      } satisfies StudentProfile
    : null;

  return {
    id: row.id,
    username: row.username,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    profile,
  };
}

export async function revokeCurrentNativeSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value;
  try {
    if (token && token.length <= 100) {
      await getDatabase()`
        UPDATE public.app_sessions
        SET revoked_at = COALESCE(revoked_at, now())
        WHERE token_hash = ${hashSessionToken(token)}
      `;
    }
  } finally {
    jar.set(SESSION_COOKIE_NAME, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
  }
}
