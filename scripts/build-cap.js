/**
 * Capacitor 靜態匯出建置腳本
 *
 * 做三件事：
 * 1. 暫時移走 app/api（server-only routes）與 app/manifest.ts
 * 2. 用 output:'export' 執行 next build → 產出 out/
 * 3. 還原被移走的檔案
 *
 * 用法：node scripts/build-cap.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const API_DIR = path.join(ROOT, 'app', 'api');
const API_BACKUP = path.join(ROOT, 'app', '_api_backup');
const MANIFEST_FILE = path.join(ROOT, 'app', 'manifest.ts');
const MANIFEST_BACKUP = path.join(ROOT, 'app', '_manifest_backup.ts');
const LIB_FIREBASE_ADMIN = path.join(ROOT, 'lib', 'firebase-admin.ts');
const LIB_FIREBASE_ADMIN_BACKUP = path.join(ROOT, 'lib', '_firebase-admin_backup.ts');

function moveIfExists(src, dest) {
  if (fs.existsSync(src)) {
    fs.renameSync(src, dest);
    console.log(`  ✓ 移動 ${path.relative(ROOT, src)} → ${path.relative(ROOT, dest)}`);
    return true;
  }
  return false;
}

function restore(backup, original) {
  if (fs.existsSync(backup)) {
    fs.renameSync(backup, original);
    console.log(`  ✓ 還原 ${path.relative(ROOT, original)}`);
  }
}

// ── Main ──
let success = false;

try {
  console.log('\n🔧 Capacitor 建置：準備靜態匯出...\n');

  // Step 1: 移走 server-only 檔案
  console.log('📦 Step 1: 暫時移除 server-only 檔案');
  moveIfExists(API_DIR, API_BACKUP);
  moveIfExists(MANIFEST_FILE, MANIFEST_BACKUP);
  moveIfExists(LIB_FIREBASE_ADMIN, LIB_FIREBASE_ADMIN_BACKUP);

  // Step 2: 建置靜態匯出
  console.log('\n🏗️  Step 2: 執行 next build (output: export)\n');
  execSync('npx cross-env BUILD_TARGET=capacitor next build', {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, BUILD_TARGET: 'capacitor' },
  });

  success = true;
  console.log('\n✅ 靜態匯出完成！檔案在 out/ 資料夾\n');

} catch (err) {
  console.error('\n❌ 建置失敗:', err.message);
  process.exitCode = 1;

} finally {
  // Step 3: 還原檔案（無論成功或失敗都要還原）
  console.log('🔄 Step 3: 還原 server-only 檔案');
  restore(API_BACKUP, API_DIR);
  restore(MANIFEST_BACKUP, MANIFEST_FILE);
  restore(LIB_FIREBASE_ADMIN_BACKUP, LIB_FIREBASE_ADMIN);

  if (success) {
    console.log('\n🎉 全部完成！接下來可以執行：');
    console.log('   npx cap sync');
    console.log('   npx cap open android  (或 ios)\n');
  }
}
