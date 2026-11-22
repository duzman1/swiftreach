// URL + SSRF defence for user-supplied webhook endpoints.
//
// The outbound dispatcher POSTs from Vercel's egress to whatever URL
// a user registers. Without this check a malicious user could register
// `http://169.254.169.254/latest/meta-data/` (AWS instance metadata)
// or `http://10.0.0.1/admin` (Vercel's internal network, hypothetically)
// and use our dispatcher as an SSRF proxy. We refuse:
//   - Non-HTTPS schemes (no http://, ws://, file://, data:, etc.)
//   - Hosts that resolve to private / loopback / link-local ranges
//   - Localhost + .local hostnames
//
// We do NOT resolve DNS at validate-time (that would need to be
// re-checked at dispatch time anyway — DNS can change). The hostname-
// based check catches the common cases. Dispatcher-side belt: Step 4
// will refuse to connect to private IPs if DNS resolves to one at
// request time.

const PRIVATE_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "broadcasthost",
]);

// IPv4 CIDRs for RFC1918 + loopback + link-local + CGNAT + metadata.
// Expressed as /oct1/oct2 prefix checks so we don't need a CIDR lib.
function isPrivateIPv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10) return true;                          // 10.0.0.0/8
  if (a === 127) return true;                         // loopback 127.0.0.0/8
  if (a === 169 && b === 254) return true;            // link-local + AWS metadata 169.254.0.0/16
  if (a === 172 && b >= 16 && b <= 31) return true;   // 172.16.0.0/12
  if (a === 192 && b === 168) return true;            // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true;  // CGNAT 100.64.0.0/10
  if (a === 0) return true;                           // 0.0.0.0/8
  if (a >= 224) return true;                          // multicast + reserved
  return false;
}

// Rough IPv6 private-range check. Covers loopback (::1), unique-local
// (fc00::/7), link-local (fe80::/10), and IPv4-mapped loopback.
function isPrivateIPv6(host: string): boolean {
  // Strip brackets if host arrived like [::1]
  const h = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  if (!h.includes(":")) return false;
  const low = h.toLowerCase();
  if (low === "::1" || low === "::") return true;
  if (low.startsWith("fe80:")) return true;
  if (low.startsWith("fc") || low.startsWith("fd")) return true;
  if (low.startsWith("::ffff:127.")) return true;
  return false;
}

export interface UrlCheckResult {
  ok: boolean;
  error?: string;
  // The parsed URL on success — callers can use it for storage so the
  // stored form is canonicalised (lowercase host, normalised path).
  normalised?: string;
}

const MAX_URL_LEN = 2048;

export function validateWebhookUrl(raw: unknown): UrlCheckResult {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, error: "url is required" };
  }
  const s = raw.trim();
  if (s.length > MAX_URL_LEN) {
    return { ok: false, error: `url must be ${MAX_URL_LEN} characters or fewer` };
  }

  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return { ok: false, error: "url is not a valid URL" };
  }

  if (u.protocol !== "https:") {
    return { ok: false, error: "url must use https://" };
  }

  // Host-based SSRF check. userinfo (user:pass@host) is also rejected
  // to avoid credential-smuggling via the URL.
  if (u.username || u.password) {
    return { ok: false, error: "url must not contain user:password@" };
  }
  const host = u.hostname.toLowerCase();
  if (PRIVATE_HOSTNAMES.has(host)) {
    return { ok: false, error: "url points to a loopback host" };
  }
  if (host.endsWith(".local") || host.endsWith(".internal")) {
    return { ok: false, error: "url points to a non-public hostname" };
  }
  if (isPrivateIPv4(host) || isPrivateIPv6(host)) {
    return { ok: false, error: "url points to a private IP range" };
  }

  // Reject ports outside the usual public range. Nothing legitimately
  // listens on <= 1024 except the standard web/service ports, and
  // picking an odd low port on a public host is a telltale sign of
  // trying to hit an unintended service.
  if (u.port) {
    const p = Number(u.port);
    if (!Number.isFinite(p) || p < 1 || p > 65535) {
      return { ok: false, error: "url port is out of range" };
    }
    // Allow only 443 or ports >= 1024 (plus the common alt https 8443).
    if (p !== 443 && p !== 8443 && p < 1024) {
      return { ok: false, error: "url port is not allowed" };
    }
  }

  return { ok: true, normalised: u.toString() };
}
