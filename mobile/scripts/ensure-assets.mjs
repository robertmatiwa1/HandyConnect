import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.resolve(__dirname, '../assets');

const base64Assets = {
  'icon.png': 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9FEqtwAAAABJRU5ErkJggg==',
  'splash.png': 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9FEqtwAAAABJRU5ErkJggg==',
  'adaptive-icon.png': 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9FEqtwAAAABJRU5ErkJggg=='
};

const ensureAssets = async () => {
  await mkdir(assetsDir, { recursive: true });

  let updated = 0;
  for (const [fileName, base64] of Object.entries(base64Assets)) {
    const targetPath = path.join(assetsDir, fileName);
    const expected = Buffer.from(base64, 'base64');

    let current;
    try {
      current = await readFile(targetPath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    if (!current || !current.equals(expected)) {
      await writeFile(targetPath, expected);
      updated += 1;
    }
  }

  const message = updated === 0
    ? 'Expo assets are already up to date.'
    : `Generated ${updated} Expo asset${updated === 1 ? '' : 's'}.`;

  console.log(message);
};

ensureAssets().catch((error) => {
  console.error('Failed to ensure Expo assets:', error);
  process.exitCode = 1;
});
