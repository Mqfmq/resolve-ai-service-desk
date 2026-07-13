const encoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string) {
  return new Uint8Array(hex.match(/.{1,2}/g)?.map(byte => Number.parseInt(byte, 16)) || []);
}

export function randomHex(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export async function passwordHash(password: string, saltHex: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: hexToBytes(saltHex), iterations: 150_000, hash: "SHA-256" }, key, 256);
  return bytesToHex(new Uint8Array(bits));
}

export async function verifyPassword(password: string, salt: string, expected: string) {
  const actual = await passwordHash(password, salt);
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index++) difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  return difference === 0;
}

export async function tokenHash(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return bytesToHex(new Uint8Array(digest));
}

export function authCookie(token: string, secure: boolean) {
  return `resolve_auth=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${secure ? "; Secure" : ""}`;
}

export function clearAuthCookie(secure: boolean) {
  return `resolve_auth=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`;
}

function cookieValue(request: Request, name: string) {
  const pair = request.headers.get("cookie")?.split(";").map(item => item.trim()).find(item => item.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : null;
}

export type AuthViewer = { id: string; displayName: string; mode: "employee" | "guest"; accountId: string | null; role: "admin" | "employee" | "guest" };

export async function resolveViewer(request: Request, d1: D1Database) {
  const token = cookieValue(request, "resolve_auth");
  if (!token) return null;
  const hash = await tokenHash(token);
  return d1.prepare(`SELECT s.id, s.display_name AS displayName, s.mode, s.account_id AS accountId, COALESCE(a.role, 'guest') AS role
    FROM agent_sessions s LEFT JOIN employee_accounts a ON a.id = s.account_id
    WHERE s.auth_token_hash = ?`).bind(hash).first<AuthViewer>();
}
