const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ICON_VARIANTS = ['A', 'B', 'C'];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function patchIosCapacitorConfig() {
  const filePath = path.join(ROOT, 'ios', 'App', 'App', 'capacitor.config.json');
  if (!fs.existsSync(filePath)) return;

  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const list = Array.isArray(data.packageClassList) ? data.packageClassList : [];
  if (!list.includes('AppIconPlugin')) {
    list.push('AppIconPlugin');
  }
  data.packageClassList = list;
  fs.writeFileSync(filePath, JSON.stringify(data, null, '\t') + '\n');
}

function syncAndroidIcons() {
  const drawableDir = path.join(ROOT, 'android', 'app', 'src', 'main', 'res', 'drawable-nodpi');
  ensureDir(drawableDir);

  for (const variant of ICON_VARIANTS) {
    const src = path.join(ROOT, 'public', `NK-app-${variant}`, 'favicon-192x192.png');
    const dest = path.join(drawableDir, `app_icon_${variant.toLowerCase()}_foreground.png`);
    copyFile(src, dest);
  }
}

function syncIosIcons() {
  const iosPublicDir = path.join(ROOT, 'ios', 'App', 'App', 'public');
  ensureDir(iosPublicDir);

  for (const variant of ICON_VARIANTS) {
    const src = path.join(ROOT, 'public', `NK-app-${variant}`, 'favicon-512x512.png');
    const dest = path.join(iosPublicDir, `AppIcon-${variant}.png`);
    copyFile(src, dest);
  }

  const primaryAppIcon = path.join(ROOT, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset', 'AppIcon-512@2x.png');
  const primarySource = path.join(ROOT, 'public', 'NK-app-C', 'favicon-512x512.png');
  copyFile(primarySource, primaryAppIcon);
}

syncAndroidIcons();
syncIosIcons();
patchIosCapacitorConfig();

console.log('Native icon assets synced.');