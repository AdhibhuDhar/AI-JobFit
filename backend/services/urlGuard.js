// SSRF guard for the "add job from URL" endpoint.
//
// The backend itself listens on loopback, so without this an attacker-supplied
// URL could reach it (or the cloud metadata service) through the server.
//
// The check runs on EVERY redirect hop. A one-shot check is the classic bypass:
// a public URL that 302s to http://127.0.0.1:5000 walks straight past a guard
// that only ran on the original request.
//
// Known residual risk (documented, not solved): DNS rebinding. We resolve the
// hostname here, then fetch resolves it again; a hostile DNS server could return
// a public IP on the first lookup and a private one on the second. Closing that
// fully needs a custom lookup on an undici Agent pinned to the vetted IP —
// disproportionate for a local dev app, so it is recorded here rather than
// papered over.

const dns = require('node:dns').promises;
const net = require('node:net');

class UrlBlockedError extends Error {
  constructor(message, code = 'BLOCKED_URL') {
    super(message);
    this.name = 'UrlBlockedError';
    this.status = 400;
    this.code = code;
  }
}

function ipToLong(ip) {
  return ip.split('.').reduce((acc, oct) => acc * 256 + Number(oct), 0);
}

// Blocked IPv4 ranges, as [network, prefixLength] pairs.
const BLOCKED_V4 = [
  ['0.0.0.0', 8],        // "this network"
  ['10.0.0.0', 8],       // private
  ['100.64.0.0', 10],    // CGNAT
  ['127.0.0.0', 8],      // loopback
  ['169.254.0.0', 16],   // link-local, incl. 169.254.169.254 cloud metadata
  ['172.16.0.0', 12],    // private
  ['192.0.0.0', 24],     // IETF protocol assignments
  ['192.0.2.0', 24],     // TEST-NET-1
  ['192.168.0.0', 16],   // private
  ['198.18.0.0', 15],    // benchmarking
  ['198.51.100.0', 24],  // TEST-NET-2
  ['203.0.113.0', 24],   // TEST-NET-3
  ['224.0.0.0', 4],      // multicast
].map(([net, bits]) => [ipToLong(net), bits]);

function isPrivateV4(ip) {
  const addr = ipToLong(ip);
  return BLOCKED_V4.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (addr & mask) >>> 0 === (base & mask) >>> 0;
  });
}

/**
 * Expand any IPv6 form to its 8 numeric 16-bit groups.
 *
 * This exists because the WHATWG URL parser normalizes `::ffff:127.0.0.1` to
 * the hex form `::ffff:7f00:1`, so a dotted-quad regex can never match it —
 * which is exactly how an IPv4-mapped loopback slipped through the guard.
 * Returns null on anything unparseable so callers can fail closed.
 */
function v6ToGroups(ip) {
  let addr = ip.toLowerCase().split('%')[0];

  const dotted = addr.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) {
    const octets = dotted[1].split('.').map(Number);
    if (octets.some((n) => n > 255)) return null;
    const hi = ((octets[0] << 8) | octets[1]).toString(16);
    const lo = ((octets[2] << 8) | octets[3]).toString(16);
    addr = `${addr.slice(0, dotted.index)}${hi}:${lo}`;
  }

  const halves = addr.split('::');
  if (halves.length > 2) return null;

  const hexGroup = (g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : null);
  const head = (halves[0] ? halves[0].split(':') : []).filter(Boolean).map(hexGroup);
  const tail =
    halves.length === 2 && halves[1] ? halves[1].split(':').filter(Boolean).map(hexGroup) : [];
  if (head.includes(null) || tail.includes(null)) return null;

  if (halves.length === 1) return head.length === 8 ? head : null;
  const fill = 8 - head.length - tail.length;
  if (fill < 0) return null;
  return [...head, ...new Array(fill).fill(0), ...tail];
}

function isPrivateV6(ip) {
  const addr = ip.toLowerCase().split('%')[0];
  if (addr === '::' || addr === '::1') return true;
  if (addr.startsWith('fe80')) return true;               // link-local
  if (/^f[cd]/.test(addr)) return true;                    // unique local fc00::/7

  const g = v6ToGroups(addr);
  if (!g) return true;                                     // fail closed

  // ::ffff:0:0/96 (IPv4-mapped) and ::/96 (IPv4-compatible) both wrap a real
  // IPv4 address in the last 32 bits, so they must be unwrapped and checked as
  // IPv4 — otherwise ::ffff:127.0.0.1 and ::127.0.0.1 read as "public".
  const isMapped = g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff;
  const isCompat = g.slice(0, 6).every((x) => x === 0);
  if (isMapped || isCompat) {
    return isPrivateV4(`${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`);
  }
  return false;
}

function isPrivateAddress(ip) {
  if (!ip) return true; // fail closed
  const family = net.isIP(ip);
  if (family === 4) return isPrivateV4(ip);
  if (family === 6) return isPrivateV6(ip);
  return true;
}

/**
 * Validate a user-supplied URL. Throws UrlBlockedError if it must not be fetched.
 * @returns {Promise<URL>}
 */
async function assertSafeUrl(raw) {
  let url;
  try {
    url = new URL(String(raw).trim());
  } catch {
    throw new UrlBlockedError('That does not look like a valid URL.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UrlBlockedError(`Unsupported protocol "${url.protocol}". Use an http or https link.`);
  }
  if (url.username || url.password) {
    throw new UrlBlockedError('URLs with embedded credentials are not allowed.');
  }

  const host = url.hostname.replace(/^\[|\]$/g, '');

  if (net.isIP(host)) {
    if (isPrivateAddress(host)) {
      throw new UrlBlockedError('That address is on a private or local network and cannot be fetched.');
    }
    return url;
  }

  let addresses;
  try {
    addresses = await dns.lookup(host, { all: true });
  } catch {
    throw new UrlBlockedError(`Could not resolve "${host}".`);
  }
  if (!addresses.length) {
    throw new UrlBlockedError(`Could not resolve "${host}".`);
  }
  // ANY resolved address being private is disqualifying.
  const bad = addresses.find((a) => isPrivateAddress(a.address));
  if (bad) {
    throw new UrlBlockedError('That hostname resolves to a private or local network and cannot be fetched.');
  }

  return url;
}

/**
 * Fetch HTML with the SSRF guard applied to every hop.
 * Redirects are followed manually (maxRedirects) so each target is re-validated.
 */
async function fetchHtml(rawUrl, { maxBytes = 2_000_000, maxRedirects = 3, timeoutMs = 15000 } = {}) {
  let current = await assertSafeUrl(rawUrl);

  for (let hop = 0; hop <= maxRedirects; hop++) {
    let res;
    try {
      res = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AIJobFit/1.0)', Accept: 'text/html,application/xhtml+xml,text/plain' },
      });
    } catch (err) {
      const e = new Error(`Could not fetch that page: ${err.message}`);
      e.status = 502;
      e.code = 'FETCH_FAILED';
      throw e;
    }

    if ([301, 302, 303, 307, 308].includes(res.status) && res.headers.get('location')) {
      const next = new URL(res.headers.get('location'), current).toString();
      current = await assertSafeUrl(next); // re-validate every hop
      continue;
    }

    if (!res.ok) {
      const e = new Error(`That page returned HTTP ${res.status}.`);
      e.status = 502;
      e.code = 'FETCH_FAILED';
      throw e;
    }

    const type = (res.headers.get('content-type') || '').toLowerCase();
    const okType = /text\/html|application\/xhtml|text\/plain/.test(type);
    if (!okType) {
      const e = new Error(`That link is not a web page (content-type: ${type || 'unknown'}). Paste the description instead.`);
      e.status = 415;
      e.code = 'BAD_CONTENT_TYPE';
      throw e;
    }

    // Cap the body so a huge page can't exhaust memory.
    const text = await res.text();
    if (text.length > maxBytes) return text.slice(0, maxBytes);
    return text;
  }

  const e = new Error('That link redirected too many times.');
  e.status = 502;
  e.code = 'TOO_MANY_REDIRECTS';
  throw e;
}

module.exports = { assertSafeUrl, fetchHtml, isPrivateAddress, UrlBlockedError };
