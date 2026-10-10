import { NextRequest, NextResponse } from 'next/server';

// IP ranges and hostnames forbidden for SSRF prevention
const BLOCKED_HOSTS = ['localhost', '127.0.0.1', '::1', '169.254.169.254'];

function isPrivateIp(hostname: string): boolean {
  if (BLOCKED_HOSTS.includes(hostname.toLowerCase())) return true;
  // Match private IPv4 ranges: 10.x.x.x, 172.16-31.x.x, 192.168.x.x
  if (/^10\./.test(hostname)) return true;
  if (/^192\.168\./.test(hostname)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)) return true;
  return false;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const imageUrl = searchParams.get('url');

    if (!imageUrl) {
      return NextResponse.json({ error: 'URL query parameter is required' }, { status: 400 });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(imageUrl);
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    // Only allow HTTP/HTTPS
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return NextResponse.json({ error: 'Only HTTP/HTTPS protocols are allowed' }, { status: 400 });
    }

    // SSRF Check
    if (isPrivateIp(parsedUrl.hostname)) {
      return NextResponse.json({ error: 'Access to internal network is denied' }, { status: 403 });
    }

    // Fetch the image with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const upstreamResponse = await fetch(imageUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) DandiyaUtsav/1.0',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
    });

    clearTimeout(timeoutId);

    if (!upstreamResponse.ok) {
      return NextResponse.json(
        { error: `Upstream image host returned HTTP ${upstreamResponse.status}` },
        { status: upstreamResponse.status }
      );
    }

    const contentType = upstreamResponse.headers.get('content-type') || 'image/jpeg';
    const imageBuffer = await upstreamResponse.arrayBuffer();

    return new Response(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Image proxy request failed' },
      { status: 502 }
    );
  }
}
