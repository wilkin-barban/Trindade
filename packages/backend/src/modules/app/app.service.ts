import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LatestReleaseResponse } from './app.schema.js';

export const TRINDADE_APK_DOWNLOAD_URL =
  'https://trindademasas.duckdns.org/api/app/download-apk';

export const FALLBACK_UPSTREAM_APK_URL =
  'https://github.com/wilkin-barban/Trindade/releases/download/v0.7.5/trindade-0.7.5.apk';

/**
 * The signed APK this project ships.
 *
 * Releases are not published to GitHub while the plant is still testing them, so the file lives next to the
 * backend and is served from disk. Resolving it from this module and not from `process.cwd()` keeps the same
 * path in `tsx` (src/modules/app) and in the image (dist/modules/app), three levels below `packages/backend`.
 */
export const LOCAL_APK_FILENAME = 'trindade-0.7.5.apk';

/**
 * The internal build the file on disk carries.
 *
 * `versionName` alone cannot distinguish two rebuilds of the same public version, and APK size is a
 * weak accident of compression. The app compares this number when the public version is unchanged;
 * `versionCode` stays out of the public release notes, but the update endpoint has to expose the
 * identity the installed client needs to make the decision.
 *
 * 7016 replaced 7015 while `versionName` stayed 0.7.4: the 0.7.4 binary Relatório shipped in did not redraw the
 * operators that arrive through the ERP mirror, and the public version could not move for a fix. An installed
 * 7015 compares this number, sees it went up and updates itself; anything lower would leave it silently stale.
 *
 * 7017 replaced 7016 the same day for the other half of that fix: the detail refreshed its day on resume and
 * wrote a failed read over it, so the screen could turn into "nothing was launched today" because the network
 * blinked. A build number is never reused -- 7016 is already installed somewhere -- so this correction gets its
 * own, and an installed 7016 updates exactly as 7015 did.
 *
 * 7018 replaced 7017 for the Massas screen: coming back to it refreshed the day and not the plant's mirror, so a
 * launch whose seat was already in the ERP kept offering Editar until the app was restarted. Same rule, third
 * time: the number goes up, the assets of `v0.7.4` are replaced, and a phone running 7017 sees the update.
 *
 * 0.7.5 is the first public version raised since 0.7.3, and it is raised for one reason: `RELEASES_URL` is
 * compiled into the APK, so the Perfil screen of every installed 7018 still opens the repository the project
 * left, which no longer resolves. No server-side change can reach a string that lives inside a signed binary;
 * only a new binary can. The build number keeps its own monotonically rising series (7019), so a phone running
 * 7018 compares it, sees it went up and updates, while the public version is what tells everyone else that this
 * is a release of its own rather than another replacement of 0.7.4.
 */
export const LOCAL_APK_BUILD_NUMBER = 7019;

const LOCAL_APK_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'apk',
  LOCAL_APK_FILENAME,
);

let localApkPath: string | null = LOCAL_APK_PATH;

/** A test decides whether a local APK is in play; the default is the file the project ships. */
export function setLocalApkPathForTest(next: string | null): void {
  localApkPath = next;
}

/** The APK on disk, with the size the page reports, or nothing when it is not there yet. */
function localApk(): { path: string; size: number; modifiedAt: string } | null {
  if (!localApkPath) return null;
  try {
    const stat = statSync(localApkPath);
    if (!stat.isFile() || stat.size === 0) return null;
    return { path: localApkPath, size: stat.size, modifiedAt: stat.mtime.toISOString() };
  } catch {
    return null;
  }
}

export const FALLBACK_RELEASE: LatestReleaseResponse = {
  version: 'v0.7.5',
  apkUrl: TRINDADE_APK_DOWNLOAD_URL,
  apkName: 'trindade.apk',
  apkSize: null,
  buildNumber: LOCAL_APK_BUILD_NUMBER,
  publishedAt: null,
  webUrl: 'https://trindademasas.duckdns.org',
};

export const GITHUB_LATEST_RELEASE_URL =
  'https://api.github.com/repos/wilkin-barban/Trindade/releases/latest';

export const RELEASE_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutos en memoria

interface CachedRelease {
  data: LatestReleaseResponse;
  upstreamApkUrl: string;
  expiresAt: number;
}

let cachedRelease: CachedRelease | null = null;
let testFetcher: typeof fetch | null = null;

export function setReleaseFetcherForTest(fetcher: typeof fetch | null): void {
  testFetcher = fetcher;
}

export function resetReleaseCache(): void {
  cachedRelease = null;
}

interface RawGitHubAsset {
  name?: string;
  browser_download_url?: string;
  size?: number;
}

interface RawGitHubRelease {
  tag_name?: string;
  name?: string;
  published_at?: string;
  assets?: RawGitHubAsset[];
}

export async function getLatestRelease(options: { forceRefresh?: boolean } = {}): Promise<LatestReleaseResponse> {
  const now = Date.now();
  if (cachedRelease && !options.forceRefresh && now < cachedRelease.expiresAt) {
    return cachedRelease.data;
  }

  // The file the project ships wins over the release feed: there is no published release to ask about, and a
  // phone that downloads an older binary because GitHub still answers v0.5.1 is the failure this avoids.
  const local = localApk();
  if (local) {
    return {
      ...FALLBACK_RELEASE,
      apkSize: local.size,
      publishedAt: local.modifiedAt,
    };
  }

  const fetcher = testFetcher ?? fetch;

  try {
    const res = await fetcher(GITHUB_LATEST_RELEASE_URL, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Trindade-Backend',
      },
    });

    if (!res.ok) {
      if (cachedRelease) return cachedRelease.data;
      return FALLBACK_RELEASE;
    }

    const payload = (await res.json()) as RawGitHubRelease;
    const tagName = payload.tag_name?.trim() || FALLBACK_RELEASE.version;
    const cleanTag = tagName.replace(/^v/, '');

    const apkAsset = payload.assets?.find(
      (a) => typeof a.name === 'string' && a.name.toLowerCase().endsWith('.apk'),
    );

    const upstreamApkUrl =
      apkAsset?.browser_download_url ||
      `https://github.com/wilkin-barban/Trindade/releases/download/${tagName}/trindade-${cleanTag}.apk`;

    const apkSize = typeof apkAsset?.size === 'number' ? apkAsset.size : null;
    const publishedAt = payload.published_at || null;

    const releaseData: LatestReleaseResponse = {
      version: tagName,
      apkUrl: TRINDADE_APK_DOWNLOAD_URL,
      apkName: 'trindade.apk',
      apkSize,
      buildNumber: null,
      publishedAt,
      webUrl: 'https://trindademasas.duckdns.org',
    };

    cachedRelease = {
      data: releaseData,
      upstreamApkUrl,
      expiresAt: now + RELEASE_CACHE_TTL_MS,
    };

    return releaseData;
  } catch {
    if (cachedRelease) return cachedRelease.data;
    return FALLBACK_RELEASE;
  }
}

export async function downloadApkBinary(): Promise<{ buffer: Buffer; filename: string } | null> {
  const local = localApk();
  if (local) {
    try {
      return { buffer: readFileSync(local.path), filename: LOCAL_APK_FILENAME };
    } catch {
      // The file was there a moment ago: fall through to the release feed instead of failing the download.
    }
  }

  const release = await getLatestRelease();
  const upstreamUrl = cachedRelease?.upstreamApkUrl || FALLBACK_UPSTREAM_APK_URL;
  const fetcher = testFetcher ?? fetch;

  try {
    const res = await fetcher(upstreamUrl, {
      headers: {
        'User-Agent': 'Trindade-Backend',
      },
    });

    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      filename: release.apkName || 'trindade.apk',
    };
  } catch {
    return null;
  }
}
