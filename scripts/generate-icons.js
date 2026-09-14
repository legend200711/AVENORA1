/**
 * Generate simple SVG-based PWA icons programmatically
 * Run: node generate-icons.js
 * Requires 'canvas' npm package for PNG generation.
 * Alternative: use any image editor to create the icons.
 */

/**
 * AVENORA Icon Design:
 * - Dark background (#050508)
 * - "LU" or "L" monogram with neon blue/green gradient
 * - Circular border with neon blue glow
 */

const ICON_SVG = (size) => {
  const half = size / 2;
  const arcY = size * 0.64;
  const sunR = size / 14;
  const sunY = size * 0.56;
  const rx = size * 0.19;
  const arcX1 = half - size * 0.2;
  const arcX2 = half + size * 0.2;
  const arcRadius = size * 0.2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#07071a"/>
      <stop offset="100%" stop-color="#0a0a18"/>
    </linearGradient>
    <linearGradient id="h" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#3b5bf5"/>
      <stop offset="50%" stop-color="#7c4df7"/>
      <stop offset="100%" stop-color="#00c9a7"/>
    </linearGradient>
    <linearGradient id="gl" x1="50%" y1="0%" x2="50%" y2="100%">
      <stop offset="0%" stop-color="#a78bfa" stop-opacity="0.7"/>
      <stop offset="100%" stop-color="#3b82f6" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${rx}" fill="url(#bg)"/>
  <rect width="${size}" height="${size}" rx="${rx}" fill="none" stroke="url(#h)" stroke-width="2" stroke-opacity="0.5"/>
  <line x1="${size * 0.14}" y1="${arcY}" x2="${size * 0.86}" y2="${arcY}" stroke="url(#h)" stroke-width="1.5" stroke-opacity="0.6"/>
  <path d="M ${arcX1} ${arcY} A ${arcRadius} ${arcRadius} 0 0 1 ${arcX2} ${arcY}" fill="none" stroke="url(#h)" stroke-width="2" stroke-linecap="round"/>
  <circle cx="${half}" cy="${sunY}" r="${sunR}" fill="url(#h)" fill-opacity="0.9"/>
  <ellipse cx="${half}" cy="${arcY}" rx="${size * 0.23}" ry="${size * 0.07}" fill="url(#gl)"/>
  <line x1="${half}" y1="${sunY - sunR - size * 0.03}" x2="${half}" y2="${sunY - sunR - size * 0.1}" stroke="#a78bfa" stroke-width="1.5" stroke-linecap="round" stroke-opacity="0.6"/>
  <text x="${half}" y="${size * 0.83}" font-family="Arial Black,sans-serif" font-size="${size * 0.09}" font-weight="900" text-anchor="middle" fill="url(#h)" letter-spacing="2">AVENORA</text>
</svg>`;
};

// Export SVG for manual conversion to PNG
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const fs = require('fs');
const path = require('path');

sizes.forEach(size => {
  const svgContent = ICON_SVG(size);
  const outputPath = path.join(__dirname, `../../../frontend/icons/icon-${size}.svg`);
  fs.writeFileSync(outputPath, svgContent);
  console.log(`Generated: icon-${size}.svg`);
});

console.log('\nConvert SVG to PNG using:');
console.log('  inkscape icon-192.svg -o icon-192.png');
console.log('  or use any image editor / online converter');
console.log('\nOr use the SVG files directly where PNG is not required.');
