import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { resolveVodRequestToFilePath } from './vod-protocol.js';

function mkTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tftvod-'));
}

describe('resolveVodRequestToFilePath', () => {
  it('allows an mp4 file within an allowed root', () => {
    const root = mkTmpDir();
    const filePath = path.join(root, 'a.mp4');
    fs.writeFileSync(filePath, 'x');

    const requestUrl = `vod://${encodeURIComponent(filePath)}`;
    const res = resolveVodRequestToFilePath({ requestUrl, allowedRoots: [root] });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.filePath).toBe(filePath);
  });

  it('rejects files outside allowed roots', () => {
    const root = mkTmpDir();
    const outsideDir = mkTmpDir();
    const outsideFile = path.join(outsideDir, 'b.mp4');
    fs.writeFileSync(outsideFile, 'x');

    const requestUrl = `vod://${encodeURIComponent(outsideFile)}`;
    const res = resolveVodRequestToFilePath({ requestUrl, allowedRoots: [root] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('out_of_root');
  });

  it('rejects traversal that resolves outside the root', () => {
    const root = mkTmpDir();
    const outsideDir = mkTmpDir();
    const outsideFile = path.join(outsideDir, 'c.mp4');
    fs.writeFileSync(outsideFile, 'x');

    const traversal = path.join(root, '..', path.basename(outsideDir), 'c.mp4');
    const requestUrl = `vod://${encodeURIComponent(traversal)}`;
    const res = resolveVodRequestToFilePath({ requestUrl, allowedRoots: [root] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('out_of_root');
  });
});

