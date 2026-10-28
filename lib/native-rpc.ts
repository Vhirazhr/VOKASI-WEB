export type NativeRpcError = { message: string; code?: string };
export type NativeRpcResponse<T> = { data: T | null; error: NativeRpcError | null };

/**
 * Client-side bridge for the explicit server allowlist at /api/rpc.
 * It intentionally does not expose arbitrary table names or SQL to the browser.
 */
export async function nativeRpc<T = unknown>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<NativeRpcResponse<T>> {
  try {
    const response = await fetch('/api/rpc', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, args }),
    });
    const payload = await response.json() as {
      data?: T | null;
      error?: NativeRpcError | null;
    };
    if (!response.ok && !payload.error) {
      return { data: null, error: { message: 'Permintaan tidak dapat diproses.' } };
    }
    return { data: payload.data ?? null, error: payload.error ?? null };
  } catch {
    return { data: null, error: { message: 'Tidak dapat terhubung ke server VOKASI.' } };
  }
}
