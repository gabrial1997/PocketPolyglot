// Renders the committed PNG app assets from their SVG sources. Re-run after editing the SVGs:
//   npm run assets
import sharp from 'sharp';

await sharp('assets/icon.svg', { density: 300 }).resize(1024, 1024).png().toFile('assets/icon.png');
await sharp('assets/splash.svg', { density: 300 }).resize(1200, 1200).png().toFile('assets/splash.png');
console.log('rendered assets/icon.png (1024×1024) + assets/splash.png (1200×1200)');
