import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const electronDistDir = path.join(rootDir, 'node_modules', 'electron', 'dist');
const releaseDir = path.join(rootDir, 'release', 'AR-Robot-air-hotkey-win32-x64');
const resourcesAppDir = path.join(releaseDir, 'resources', 'app');
const targetExe = path.join(releaseDir, 'AR-Robot-air-hotkey.exe');

// Also keep backward compatible folder/exe if needed
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
  name: 'ar-robot-air-hotkey',
  productName: 'AR Robot air hotkey',
  version: '1.6.1',
  main: 'electron/main.cjs',
};
fs.writeFileSync(
  path.join(resourcesAppDir, 'package.json'),
  JSON.stringify(appPackageJson, null, 2),
  'utf-8'
);

// Create ./ar-data folder right next to the portable executable
const portableArDataDir = path.join(releaseDir, 'ar-data');
fs.mkdirSync(portableArDataDir, { recursive: true });
const rootReleaseArDataDir = path.join(rootDir, 'release', 'ar-data');
fs.mkdirSync(rootReleaseArDataDir, { recursive: true });

// Create convenient 1-click launcher .bat in the project root
const batContent = `@echo off\r\nstart "" "%~dp0release\\AR-Robot-air-hotkey-win32-x64\\AR-Robot-air-hotkey.exe"\r\n`;
fs.writeFileSync(path.join(rootDir, 'AR-Robot-air-hotkey-실행.bat'), batContent, 'utf-8');
fs.writeFileSync(path.join(rootDir, 'AR-Robot-Table-Hockey-실행.bat'), batContent, 'utf-8');

console.log('✅ Windows Portable App & ./ar-data folder ready at:');
console.log('   Exe:     ' + targetExe);
console.log('   ar-data: ' + portableArDataDir);
