import { promises as dns } from 'node:dns';
import { BlockList, isIP } from 'node:net';

const maxRedirects = 3;
const defaultMaxAudioResponseBytes = 32 * 1024 * 1024;

const blockedAddresses = new BlockList();
blockedAddresses.addSubnet('0.0.0.0', 8, 'ipv4');
blockedAddresses.addSubnet('10.0.0.0', 8, 'ipv4');
blockedAddresses.addSubnet('100.64.0.0', 10, 'ipv4');
blockedAddresses.addSubnet('127.0.0.0', 8, 'ipv4');
blockedAddresses.addSubnet('169.254.0.0', 16, 'ipv4');
blockedAddresses.addSubnet('172.16.0.0', 12, 'ipv4');
blockedAddresses.addSubnet('192.0.0.0', 24, 'ipv4');
blockedAddresses.addSubnet('192.0.2.0', 24, 'ipv4');
blockedAddresses.addSubnet('192.168.0.0', 16, 'ipv4');
blockedAddresses.addSubnet('198.18.0.0', 15, 'ipv4');
blockedAddresses.addSubnet('198.51.100.0', 24, 'ipv4');
blockedAddresses.addSubnet('203.0.113.0', 24, 'ipv4');
blockedAddresses.addSubnet('224.0.0.0', 4, 'ipv4');
blockedAddresses.addSubnet('240.0.0.0', 4, 'ipv4');
blockedAddresses.addAddress('::', 'ipv6');
blockedAddresses.addAddress('::1', 'ipv6');
blockedAddresses.addSubnet('fc00::', 7, 'ipv6');
blockedAddresses.addSubnet('fe80::', 10, 'ipv6');
blockedAddresses.addSubnet('ff00::', 8, 'ipv6');
blockedAddresses.addSubnet('2001:db8::', 32, 'ipv6');

function withStatus(message: string, statusCode: number) {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  return error;
}

function isBlockedAddress(address: string) {
  const mappedIpv4 = address.toLowerCase().startsWith('::ffff:')
    ? address.slice('::ffff:'.length)
    : null;

  if (mappedIpv4 && isIP(mappedIpv4) === 4) {
    return blockedAddresses.check(mappedIpv4, 'ipv4');
  }

  const family = isIP(address);
  if (family === 4) {
    return blockedAddresses.check(address, 'ipv4');
  }
  if (family === 6) {
    return blockedAddresses.check(address, 'ipv6');
  }

  return true;
}

function parseAllowedHosts(providerHostname: string) {
  const configuredHosts = (process.env.KEYPILLAR_TTS_AUDIO_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase().replace(/\.$/, ''))
    .filter(Boolean);

  return new Set([providerHostname.toLowerCase().replace(/\.$/, ''), ...configuredHosts]);
}

function hostMatchesAllowedEntry(hostname: string, allowedEntry: string) {
  if (allowedEntry.startsWith('*.')) {
    const suffix = allowedEntry.slice(1);
    return hostname.endsWith(suffix) && hostname.length > suffix.length;
  }

  return hostname === allowedEntry;
}

async function assertSafeAudioUrl(url: URL, providerUrl: URL) {
  if (url.username || url.password) {
    throw withStatus('Provider audio URL must not include credentials.', 502);
  }

  const sameOrigin = url.origin === providerUrl.origin;
  const localDevelopmentProvider = process.env.NODE_ENV !== 'production' && sameOrigin;

  if (!sameOrigin && url.protocol !== 'https:') {
    throw withStatus('Provider audio URL must use HTTPS.', 502);
  }

  if (url.protocol !== 'https:' && !(localDevelopmentProvider && url.protocol === 'http:')) {
    throw withStatus('Provider audio URL uses an unsupported protocol.', 502);
  }

  if ((url.protocol === 'https:' && url.port && url.port !== '443')
    || (url.protocol === 'http:' && url.port && url.port !== '80' && !localDevelopmentProvider)) {
    throw withStatus('Provider audio URL uses an unsupported port.', 502);
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  const allowedHosts = parseAllowedHosts(providerUrl.hostname);

  if (![...allowedHosts].some((entry) => hostMatchesAllowedEntry(hostname, entry))) {
    throw withStatus('Provider audio URL host is not allowed.', 502);
  }

  if (localDevelopmentProvider) {
    return;
  }

  const resolvedAddresses = await dns.lookup(hostname, {
    all: true,
    verbatim: true,
  }).catch(() => []);

  if (resolvedAddresses.length === 0) {
    throw withStatus('Provider audio URL host could not be resolved.', 502);
  }

  if (resolvedAddresses.some(({ address }) => isBlockedAddress(address))) {
    throw withStatus('Provider audio URL resolved to a private or reserved address.', 502);
  }
}

function isRedirectResponse(response: Response) {
  return response.status === 301
    || response.status === 302
    || response.status === 303
    || response.status === 307
    || response.status === 308;
}

export async function fetchSafeProviderAudio(input: {
  apiKey: string | null;
  audioUrl: string;
  baseHeaders?: Record<string, string>;
  providerApiUrl: string;
  timeoutMs: number;
}) {
  let providerUrl: URL;
  let currentUrl: URL;

  try {
    providerUrl = new URL(input.providerApiUrl);
    currentUrl = new URL(input.audioUrl, providerUrl);
  } catch {
    throw withStatus('Provider returned an invalid audio URL.', 502);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
      await assertSafeAudioUrl(currentUrl, providerUrl);

      const headers: Record<string, string> = {
        ...input.baseHeaders,
      };

      if (currentUrl.origin === providerUrl.origin && input.apiKey) {
        headers.Authorization = `Bearer ${input.apiKey}`;
      } else {
        delete headers.Authorization;
      }

      const response = await fetch(currentUrl, {
        headers,
        redirect: 'manual',
        signal: controller.signal,
      });

      if (!isRedirectResponse(response)) {
        return response;
      }

      const location = response.headers.get('location');
      await response.body?.cancel().catch(() => undefined);

      if (!location) {
        throw withStatus('Provider audio redirect did not include a destination.', 502);
      }
      if (redirectCount === maxRedirects) {
        throw withStatus('Provider audio URL redirected too many times.', 502);
      }

      currentUrl = new URL(location, currentUrl);
    }

    throw withStatus('Provider audio URL redirected too many times.', 502);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw withStatus(`Provider audio fetch timed out after ${Math.round(input.timeoutMs / 1_000)} seconds.`, 504);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function readResponseBufferWithLimit(
  response: Response,
  maxBytes = defaultMaxAudioResponseBytes,
) {
  const contentLength = Number(response.headers.get('content-length') ?? 0);

  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw withStatus('Provider audio response is too large.', 502);
  }

  if (!response.body) {
    return Buffer.alloc(0);
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of response.body) {
    const buffer = Buffer.from(chunk);
    totalBytes += buffer.byteLength;

    if (totalBytes > maxBytes) {
      await response.body.cancel().catch(() => undefined);
      throw withStatus('Provider audio response is too large.', 502);
    }

    chunks.push(buffer);
  }

  return Buffer.concat(chunks, totalBytes);
}
