// После vite build убеждается что dist/tg/telegram-web-app.js есть.
const { existsSync, mkdirSync, copyFileSync } = require('fs');

const src  = 'public/tg/telegram-web-app.js';
const dest = 'dist/tg/telegram-web-app.js';

mkdirSync('dist/tg', { recursive: true });

if (existsSync(dest)) {
  console.log('✓ dist/tg/telegram-web-app.js OK');
} else if (existsSync(src)) {
  copyFileSync(src, dest);
  console.log('✓ tg sdk скопирован из public/tg/');
} else {
  console.error('✗ НЕТ файла public/tg/telegram-web-app.js — скопируй его туда вручную');
  process.exit(1);
}
