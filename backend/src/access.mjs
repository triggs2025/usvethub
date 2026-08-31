/**
 * Identity, borrowed entirely from Cloudflare Access.
 *
 * This Worker has no login page, no password, no session cookie, and no user
 * table. Cloudflare Access authenticates the person before the request ever
 * arrives and signs an assertion saying who they are. There is nothing here to
 * brute force and nothing here to steal, which is the only auth design worth
 * having on a system that will hold advertiser contact details.
 *
 * The assertion MUST be verified, not merely read. A Workers URL is reachable
 * from the open internet, so anyone who finds it could send whatever headers
 * they like. Trusting `Cf-Access-Jwt-Assertion` without checking its signature
 * would mean the header itself is the password, and it would be a password
 * printed in every request log. So: fetch the team's public keys, verify RS256,
 * check the audience, check expiry.
 *
 * If verification cannot be performed for any reason, the request is refused.
 * Failing closed is the point: an admin system that keeps working when its
 * identity provider is unreachable is an admin system with no identity provider.
 */

/** Public keys are stable for hours; refetching per request would be silly. */
const JWKS_TTL_MS = 60 * 60 * 1000;
let jwksCache = { keys: null, fetchedAt: 0, teamDomain: null };

const b64urlToBytes = (input) => {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
};

const b64urlToString = (input) => new TextDecoder().decode(b64urlToBytes(input));

async function getKeys(teamDomain) {
  const fresh = jwksCache.keys
    && jwksCache.teamDomain === teamDomain
    && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS;
  if (fresh) return jwksCache.keys;

  const response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!response.ok) throw new Error(`JWKS fetch failed: ${response.status}`);
  const body = await response.json();
  if (!Array.isArray(body.keys) || body.keys.length === 0) throw new Error('JWKS empty');

  jwksCache = { keys: body.keys, fetchedAt: Date.now(), teamDomain };
  return body.keys;
}

/**
 * Verify the Access assertion and return the identity it carries.
 *
 * Returns `{ ok: true, email }` or `{ ok: false, reason }`. The caller must
 * treat anything other than ok:true as a refusal. There is no partial success.
 */
export async function verifyAccess(request, env) {
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) {
    return { ok: false, reason: 'no Access assertion, so this request did not come through Access' };
  }
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    return { ok: false, reason: 'ACCESS_TEAM_DOMAIN or ACCESS_AUD is not configured' };
  }

  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed assertion' };

  let header;
  let claims;
  try {
    header = JSON.parse(b64urlToString(parts[0]));
    claims = JSON.parse(b64urlToString(parts[1]));
  } catch {
    return { ok: false, reason: 'unreadable assertion' };
  }

  if (header.alg !== 'RS256') return { ok: false, reason: `unexpected algorithm ${header.alg}` };

  let keys;
  try {
    keys = await getKeys(env.ACCESS_TEAM_DOMAIN);
  } catch (error) {
    return { ok: false, reason: `could not reach Access to verify: ${error.message}` };
  }

  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return { ok: false, reason: 'assertion signed by an unknown key' };

  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]), signed,
  );
  if (!valid) return { ok: false, reason: 'signature does not verify' };

  // An assertion minted for a different application is not an assertion for
  // this one. Without this check, access to any Access-protected app on the
  // account would be access to this one.
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audience.includes(env.ACCESS_AUD)) {
    return { ok: false, reason: 'assertion was issued for a different application' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== 'number' || claims.exp < now) {
    return { ok: false, reason: 'assertion has expired' };
  }
  if (typeof claims.nbf === 'number' && claims.nbf > now + 60) {
    return { ok: false, reason: 'assertion is not valid yet' };
  }
  if (claims.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) {
    return { ok: false, reason: 'assertion came from a different team' };
  }

  const email = claims.email || claims.common_name;
  if (!email) return { ok: false, reason: 'assertion carries no identity' };

  return { ok: true, email };
}
