/**
 * Generate all favicon/icon variants from emblem.png (dancer mark)
 *
 * Outputs:
 *   src/app/favicon.ico   — 48x48 (ICO with 16/32/48 embedded)
 *   src/app/icon.png      — 32x32  (modern browsers)
 *   src/app/apple-icon.png — 180x180 (iOS home screen)
 *   src/app/opengraph-image.png — 1200x630 (social sharing)
 *   public/icon-192.png   — 192x192 (PWA manifest)
 *   public/icon-512.png   — 512x512 (PWA manifest)
 */

import sharp from 'sharp';
import { writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC_APP = join(ROOT, 'src', 'app');
const PUBLIC = join(ROOT, 'public');
const LOGO = join(PUBLIC, 'emblem.png');

// Theme color from the app
const BG_COLOR = '#1B1F3B';

async function generatePng(outputPath, size) {
  await sharp(LOGO)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(outputPath);
  console.log(`  ✓ ${outputPath} (${size}x${size})`);
}

async function generateOgImage(outputPath) {
  // 1200x630 with the logo centered on light background for contrast
  const logoSize = 500;
  const logo = await sharp(LOGO)
    .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: 1200,
      height: 630,
      channels: 4,
      background: '#F2F2F2',  // matches manifest background_color
    },
  })
    .composite([
      {
        input: logo,
        left: Math.round((1200 - logoSize) / 2),
        top: Math.round((630 - logoSize) / 2),
      },
    ])
    .png()
    .toFile(outputPath);
  console.log(`  ✓ ${outputPath} (1200x630)`);
}

/**
 * Build a minimal ICO file containing 16x16, 32x32, and 48x48 PNG frames.
 * ICO format: https://en.wikipedia.org/wiki/ICO_(file_format)
 */
async function generateIco(outputPath) {
  const sizes = [16, 32, 48];
  const pngBuffers = await Promise.all(
    sizes.map((s) =>
      sharp(LOGO)
        .resize(s, s, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer()
    )
  );

  // ICO header: 6 bytes
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);              // reserved
  header.writeUInt16LE(1, 2);              // type: 1 = ICO
  header.writeUInt16LE(sizes.length, 4);   // number of images

  // Directory entries: 16 bytes each
  const dirEntries = [];
  let dataOffset = 6 + sizes.length * 16;

  for (let i = 0; i < sizes.length; i++) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(sizes[i] < 256 ? sizes[i] : 0, 0);   // width
    entry.writeUInt8(sizes[i] < 256 ? sizes[i] : 0, 1);   // height
    entry.writeUInt8(0, 2);                                  // color palette
    entry.writeUInt8(0, 3);                                  // reserved
    entry.writeUInt16LE(1, 4);                               // color planes
    entry.writeUInt16LE(32, 6);                              // bits per pixel
    entry.writeUInt32LE(pngBuffers[i].length, 8);            // image data size
    entry.writeUInt32LE(dataOffset, 12);                     // offset to image data
    dirEntries.push(entry);
    dataOffset += pngBuffers[i].length;
  }

  const ico = Buffer.concat([header, ...dirEntries, ...pngBuffers]);
  await writeFile(outputPath, ico);
  console.log(`  ✓ ${outputPath} (ICO: ${sizes.join('+')})`);
}

async function main() {
  console.log('Generating favicons from emblem.png...\n');

  await Promise.all([
    // App Router file-based metadata (src/app/)
    generateIco(join(SRC_APP, 'favicon.ico')),
    generatePng(join(SRC_APP, 'icon.png'), 32),
    generatePng(join(SRC_APP, 'apple-icon.png'), 180),
    generateOgImage(join(SRC_APP, 'opengraph-image.png')),

    // PWA manifest icons (public/)
    generatePng(join(PUBLIC, 'icon-192.png'), 192),
    generatePng(join(PUBLIC, 'icon-512.png'), 512),
  ]);

  console.log('\nDone. All icons generated.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
