import fs from 'fs';
import path from 'path';

function ensureTrailingSep(p: string): string {
  const resolved = path.resolve(p);
  return resolved.endsWith(path.sep) ? resolved : resolved + path.sep;
}

function isPathWithinRoot(candidatePath: string, rootPath: string): boolean {
  const root = ensureTrailingSep(rootPath);
  const resolved = path.resolve(candidatePath);
  return resolved === path.resolve(rootPath) || resolved.startsWith(root);
}

export function decodeVodUrlToFilePath(rawUrl: string): string | null {
  const url = String(rawUrl || '');
  if (!url.startsWith('vod://')) return null;
  let rest = url.slice('vod://'.length);
  // Support vod:///absolute/path and the historical format vod://<encodedAbsolutePath>
  if (rest.startsWith('/')) rest = rest.slice(1);
  try {
    return decodeURIComponent(rest);
  } catch {
    return null;
  }
}

export function resolveVodRequestToFilePath(params: {
  requestUrl: string;
  allowedRoots: string[];
  allowedExtensions?: string[];
}): { ok: true; filePath: string } | { ok: false; reason: string } {
  const decoded = decodeVodUrlToFilePath(params.requestUrl);
  if (!decoded) return { ok: false, reason: 'invalid_url' };

  const filePath = decoded;
  const allowedRoots = (params.allowedRoots || []).filter(Boolean);
  if (!allowedRoots.length) return { ok: false, reason: 'no_allowed_roots' };

  if (!allowedRoots.some((r) => isPathWithinRoot(filePath, r))) {
    return { ok: false, reason: 'out_of_root' };
  }

  const allowedExtensions = params.allowedExtensions?.length ? params.allowedExtensions : ['.mp4'];
  const ext = path.extname(filePath).toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    return { ok: false, reason: 'unsupported_extension' };
  }

  try {
    const st = fs.statSync(filePath);
    if (!st.isFile()) return { ok: false, reason: 'not_a_file' };
  } catch {
    return { ok: false, reason: 'missing' };
  }

  return { ok: true, filePath };
}

