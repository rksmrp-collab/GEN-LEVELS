import { readFileSync, writeFileSync, renameSync, mkdirSync, unlinkSync } from 'node:fs';
import { TOTP, Secret } from 'otpauth';
type TokenState = { token: string; expires: number; generatedAt: number };
let pending: Promise<TokenState> | null = null;
let retryAfter = 0;
const statePath = () => `${process.env.MANJU_STATE_DIR || './data'}/token.json`;
const configuredValue = (value: string | undefined) => {
  const trimmed = value?.trim();
  return trimmed && trimmed !== 'CHANGE_ME' ? trimmed : null;
};
const manualToken = () => configuredValue(process.env.DHAN_ACCESS_TOKEN);
function tokenExpiry(token: string): number | null {
  try {
    const expires = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).exp * 1000;
    return Number.isFinite(expires) ? expires : null;
  } catch { return null; }
}
function readState(): TokenState | null {
  try { return JSON.parse(readFileSync(statePath(), 'utf8')); } catch { return null; }
}
export function tokenStatus() {
  const token = manualToken();
  const clientConfigured = !!configuredValue(process.env.DHAN_CLIENT_ID);
  if (token) {
    const expires = tokenExpiry(token);
    const ready = clientConfigured && (!expires || expires > Date.now());
    return {
      configured: clientConfigured,
      ready,
      canGenerate: false,
      expiresAt: expires ? new Date(expires).toISOString() : null,
      automatic: false,
      mode: 'manual',
    };
  }
  const state = readState();
  const ready = !!state && state.expires > Date.now() + 3600000;
  const configured = !!(clientConfigured && configuredValue(process.env.DHAN_PIN) && configuredValue(process.env.DHAN_TOTP_SECRET));
  return { configured, ready, canGenerate: configured && !ready && !pending && Date.now() >= retryAfter, expiresAt: state ? new Date(state.expires).toISOString() : null, automatic: true, mode: 'automatic' };
}
async function generate(): Promise<TokenState> {
  const clientId = configuredValue(process.env.DHAN_CLIENT_ID);
  const pin = configuredValue(process.env.DHAN_PIN);
  const secret = configuredValue(process.env.DHAN_TOTP_SECRET);
  if (!clientId || !pin || !secret) throw new Error('Dhan automatic authentication is not configured');
  const totp = new TOTP({ secret: Secret.fromBase32(secret.replace(/\s/g, '')), digits: 6, period: 30, algorithm: 'SHA1' }).generate();
  const url = new URL('https://auth.dhan.co/app/generateAccessToken');
  url.search = new URLSearchParams({ dhanClientId: clientId, pin, totp }).toString();
  try {
    const response = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(25000), cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || !data.accessToken) throw new Error('Dhan token generation failed; check account authentication');
    let expires: number;
    try { expires = JSON.parse(Buffer.from(data.accessToken.split('.')[1], 'base64url').toString()).exp * 1000; } catch { expires = Date.now() + 23 * 3600000; }
    if (!Number.isFinite(expires)) expires = Date.now() + 23 * 3600000;
    const state = { token: data.accessToken, expires, generatedAt: Date.now() };
    mkdirSync(process.env.MANJU_STATE_DIR || './data', { recursive: true });
    writeFileSync(`${statePath()}.tmp`, JSON.stringify(state), { mode: 0o600 });
    renameSync(`${statePath()}.tmp`, statePath());
    return state;
  } catch { retryAfter = Date.now() + 60000; throw new Error('Dhan token generation failed. Retry after one minute.'); }
}
export async function ensureToken() {
  const token = manualToken();
  if (token) {
    const expires = tokenExpiry(token);
    if (expires && expires <= Date.now()) throw new Error('Dhan access token has expired. Update DHAN_ACCESS_TOKEN in .env.local and restart the app.');
    return token;
  }
  const state = readState();
  if (state && state.expires > Date.now() + 3600000) return state.token;
  if (!pending) {
    if (Date.now() < retryAfter) throw new Error('Dhan authentication is cooling down; retry shortly');
    pending = generate().finally(() => { pending = null; });
  }
  return (await pending).token;
}
export async function dhanHeaders() {
  const clientId = configuredValue(process.env.DHAN_CLIENT_ID);
  if (!clientId) throw new Error('DHAN_NOT_CONFIGURED');
  return { 'Content-Type': 'application/json', Accept: 'application/json', 'client-id': clientId, 'access-token': await ensureToken() };
}
export function invalidateToken(rejectedToken: string) {
  if (manualToken() === rejectedToken) return;
  // A delayed failure must not remove a token already refreshed by another request.
  if (readState()?.token === rejectedToken) {
    try { unlinkSync(statePath()); } catch {}
  }
}
