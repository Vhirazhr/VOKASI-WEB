import type { StudentProfile, UserRole } from './types';

export type NativeAuthUser = {
  id: string;
  username: string;
  email: string | null;
  displayName: string;
  role: 'student' | 'admin' | 'super_admin';
  profile: StudentProfile | null;
};

function notifyAuthChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('vokasi:auth-changed'));
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === 'object' ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export async function signIn(identity: string, password: string, role: UserRole): Promise<StudentProfile | null> {
  if (!password) throw new Error('Password wajib diisi.');
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: identity.trim(), password, role }),
  });
  const payload = await readJson(response);
  if (!response.ok) {
    const message = typeof payload.error === 'string' ? payload.error : 'Username/email atau password tidak cocok.';
    throw new Error(message);
  }

  const user = payload.user as NativeAuthUser | undefined;
  if (!user || (role === 'admin' && user.role !== 'admin' && user.role !== 'super_admin')
    || (role === 'student' && user.role !== 'student')) {
    throw new Error('Akun ini tidak memiliki izin untuk masuk ke panel tersebut.');
  }
  notifyAuthChanged();
  return role === 'student' ? user.profile : null;
}

export async function currentUser(): Promise<NativeAuthUser | null> {
  const response = await fetch('/api/auth/me', {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (response.status === 401) return null;
  const payload = await readJson(response);
  if (!response.ok) {
    const message = typeof payload.error === 'string' ? payload.error : 'Sesi tidak dapat diverifikasi.';
    throw new Error(message);
  }
  const user = payload.user as NativeAuthUser | undefined;
  if (!user || !['student', 'admin', 'super_admin'].includes(user.role)) return null;
  return user;
}

export async function currentRole(): Promise<{ role: UserRole; profile: StudentProfile | null } | null> {
  const user = await currentUser();
  if (!user) return null;
  const role: UserRole = user.role === 'student' ? 'student' : 'admin';
  return { role, profile: role === 'student' ? user.profile : null };
}

export async function signOut(): Promise<void> {
  try {
    const response = await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!response.ok) throw new Error('Sesi lokal tidak dapat diverifikasi saat keluar.');
  } finally {
    notifyAuthChanged();
  }
}
