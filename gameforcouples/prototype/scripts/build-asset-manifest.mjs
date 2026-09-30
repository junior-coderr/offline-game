import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const folder = fileURLToPath(new URL('../assets/furniture/', import.meta.url));
const manifestPath = fileURLToPath(new URL('../assets/asset-manifest.json', import.meta.url));
const supported = /\.(png|webp|jpe?g|bmp|tiff?)$/i;
const slug = (value) => value.toLowerCase().replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

let manifest = { version: 1, assets: [] };
try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')); } catch {}
const current = new Map((manifest.assets || []).map((asset) => [asset.id, asset]));
let files = [];
try { files = (await readdir(folder, { withFileTypes: true })).filter((entry) => entry.isFile() && supported.test(entry.name)); }
catch { console.error('Create prototype/assets/furniture and add image files there first.'); process.exit(1); }

for (const file of files) {
  const id = slug(file.name);
  if (!id) continue;
  let outputName = file.name;
  if (!/\.webp$/i.test(file.name)) {
    outputName = `${basename(file.name, extname(file.name))}.webp`;
    const result = spawnSync('cwebp', ['-quiet', '-q', '88', '-m', '6', join(folder, file.name), '-o', join(folder, outputName)], { encoding: 'utf8' });
    if (result.error || result.status !== 0) {
      console.error(`Could not convert ${file.name} to WebP. Install cwebp and try again.`);
      process.exit(1);
    }
  }
  const src = `assets/furniture/${outputName}`;
  const existing = current.get(id);
  current.set(id, {
    ...(existing || {}),
    id,
    name: existing?.name || basename(file.name).replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '),
    src,
    depthAnchor: existing?.depthAnchor ?? 0.9,
    collider: existing?.collider || { type: 'polygon', points: [[0.18,0],[0.82,0],[1,0.18],[1,0.82],[0.82,1],[0.18,1],[0,0.82],[0,0.18]] }
  });
}

manifest.version = 1;
manifest.assets = [...current.values()];
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Asset catalog updated: ${manifest.assets.length} assets total, ${files.length} image files found in assets/furniture.`);
