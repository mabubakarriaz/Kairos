/**
 * Session cookie signing — HMAC-SHA256 via Web Crypto so this module is safe to
 * import from both the Edge proxy and Node-runtime Server Actions / RSC.
 *
 * The cookie value is `<expiresAtMs>.<sigHex>`. The signature covers the
 * expiresAtMs string. `crypto.subtle.verify` does the constant-time compare,
 * and the expiry is checked numerically on every request.
 *
 * AUTH_SECRET must be set in the runtime env to a long random string. Without
 * it, every verification fails closed (no cookie ever validates).
 */

export const AUTH_COOKIE = "kairos_auth";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const MIN_SECRET_LEN = 16;

function getSecret(): string | null {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < MIN_SECRET_LEN) return null;
  return s;
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function toHex(buf: ArrayBuffer): string {
  const arr = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < arr.length; i++) {
    out += arr[i].toString(16).padStart(2, "0");
  }
  return out;
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) return null;
  const buf = new ArrayBuffer(hex.length / 2);
  const view = new Uint8Array(buf);
  for (let i = 0; i < view.length; i++) {
    view[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return view;
}

export async function signSession(expiresAtMs: number): Promise<string | null> {
  const secret = getSecret();
  if (!secret) return null;
  const key = await importKey(secret);
  const data = new TextEncoder().encode(String(expiresAtMs));
  const sig = await crypto.subtle.sign("HMAC", key, data);
  return `${expiresAtMs}.${toHex(sig)}`;
}

export async function verifySession(value: string | undefined | null): Promise<boolean> {
  if (!value) return false;
  const secret = getSecret();
  if (!secret) return false;

  const dot = value.indexOf(".");
  if (dot < 0) return false;
  const expStr = value.slice(0, dot);
  const sigHex = value.slice(dot + 1);

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp <= Date.now()) return false;

  const sig = fromHex(sigHex);
  if (!sig) return false;

  let key: CryptoKey;
  try {
    key = await importKey(secret);
  } catch {
    return false;
  }
  const data = new TextEncoder().encode(expStr);
  try {
    return await crypto.subtle.verify("HMAC", key, sig, data);
  } catch {
    return false;
  }
}
