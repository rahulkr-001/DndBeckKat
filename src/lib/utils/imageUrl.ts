/**
 * Image URL utility — routes external URLs through the server-side image proxy.
 *
 * Why: External image hosts frequently:
 *  - Reject crossOrigin="anonymous" requests (CORS block)
 *  - Check referrer headers and block no-referrer requests
 *  - Hotlink-protect against direct browser requests
 *  - Require specific User-Agent strings
 *
 * The proxy handles all of this server-side and returns a clean image response
 * with CORS headers, bypassing browser-side restrictions.
 */

/**
 * Returns a safe image src:
 * - Local paths (/...) → returned as-is
 * - Data URIs (data:...) → returned as-is
 * - External HTTP/HTTPS URLs → routed through /api/image-proxy
 * - Empty/null/undefined → returns the provided fallback
 */
export function proxyImageUrl(
  url: string | null | undefined,
  fallback = '/logo.svg'
): string {
  if (!url || typeof url !== 'string') return fallback;

  const trimmed = url.trim();
  if (!trimmed) return fallback;

  // Local asset — serve directly
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;

  // Data URI — serve directly
  if (trimmed.startsWith('data:')) return trimmed;

  // Block dangerous protocols
  if (
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('vbscript:') ||
    trimmed.startsWith('blob:')
  ) {
    return fallback;
  }

  // External HTTP/HTTPS — route through proxy
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('//')) {
    return `/api/image-proxy?url=${encodeURIComponent(trimmed)}`;
  }

  // Unknown format — fallback
  return fallback;
}
