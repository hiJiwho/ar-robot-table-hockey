import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const electronDistDir = path.join(rootDir, 'node_modules', 'electron', 'dist');
const releaseDir = path.join(rootDir, 'release', 'AR-Robot-Table-Hockey-win32-x64');
const resourcesAppDir = path.join(releaseDir, 'resources', 'app');
const targetExe = path.join(releaseDir, 'AR-Robot-Table-Hockey.exe');

if (!fs.existsSync(targetExe)) {
  console.log('1. Copying Electron Windows runtime binaries...');
  fs.mkdirSync(releaseDir, { recursive: true });
  fs.cpSync(electronDistDir, releaseDir, { recursive: true });

  const defaultAsar = path.join(releaseDir, 'resources', 'default_app.asar');
  if (fs.existsSync(defaultAsar)) {
    fs.rmSync(defaultAsar, { force: true });
  }

  const srcExe = path.join(releaseDir, 'electron.exe');
  if (fs.existsSync(srcExe)) {
    fs.copyFileSync(srcExe, targetExe);
  }
} else {
  console.log('1. Electron Windows runtime already present, updating app bundle...');
}

console.log('2. Updating application bundle (dist + electron main/preload)...');
if (fs.existsSync(resourcesAppDir)) {
  fs.rmSync(resourcesAppDir, { recursive: true, force: true });
}
fs.mkdirSync(resourcesAppDir, { recursive: true });
fs.cpSync(path.join(rootDir, 'dist'), path.join(resourcesAppDir, 'dist'), { recursive: true });
fs.cpSync(path.join(rootDir, 'electron'), path.join(resourcesAppDir, 'electron'), { recursive: true });

const appPackageJson = {
  name: 'ar-robot-table-hockey',
  productName: 'AR Robot Table Hockey',
  version: '1.0.0',
  main: 'electron/main.cjs',
};
fs.writeFileSync(
  path.join(resourcesAppDir, 'package.json'),
  JSON.stringify(appPackageJson, null, 2),
  'utf-8'
);

// Create a convenient 1-click launcher .bat in the project root
const batContent = `@echo off\r\nstart "" "%~dp0release\\AR-Robot-Table-Hockey-win32-x64\\AR-Robot-Table-Hockey.exe"\r\n`;
fs.writeFileSync(path.join(rootDir, 'AR-Robot-Table-Hockey-실행.bat'), batContent, 'utf-8');

console.log('✅ Windows App successfully built at:');
console.log('   ' + targetExe);
