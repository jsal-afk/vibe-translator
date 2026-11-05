const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const packager = require('@electron/packager');
const packageJson = require('../package.json');

const root = path.resolve(__dirname, '..');
const buildDir = path.join(root, 'build');
const appName = packageJson.productName;
const appVersion = packageJson.version;
const commonIgnore = [
  /^\/build(?:\/|$)/,
  /^\/\.git(?:\/|$)/,
  /^\/docs(?:\/|$)/,
  /^\/README\.md$/,
  /^\/tests(?:\/|$)/,
  /^\/scripts(?:\/|$)/,
  /^\/node_modules(?:\/|$)/,
  /^\/package-lock\.json$/,
  /^\/assets\/icon\.ico$/,
  /^\/\.gitignore$/,
  /^\/\.github(?:\/|$)/,
  /^\/\.vscode(?:\/|$)/,
  /^\/\.idea(?:\/|$)/,
  /^\/\.env(?:$|\.)/,
  /^\/\.npmrc$/,
  /^\/\.netrc$/,
  /^\/\.pypirc$/,
  /^\/\.ssh(?:\/|$)/,
  /^\/\.aws(?:\/|$)/,
  /^\/profiles(?:\/|$)/,
  /^\/userData(?:\/|$)/,
  /^\/sessionData(?:\/|$)/,
  /^\/coverage(?:\/|$)/,
  /^\/\.cache(?:\/|$)/,
  /^\/.*\.log$/i,
  /^\/.*\.(?:sqlite(?:-[^/]*)?|db(?:-[^/]*)?)$/i,
  /^\/\.DS_Store$/,
];

function parseTarget(args) {
  const usage = 'Usage: npm run package | npm run package:win [-- x64|arm64]';
  if (args.length === 0) return { platform: 'darwin', arch: 'arm64' };
  if (args.length > 2) throw new Error(usage);

  const [platform, requestedArch] = args;
  if (platform === 'darwin' && args.length === 1) {
    return { platform, arch: 'arm64' };
  }
  if (platform !== 'win32') throw new Error(usage);
  const arch = requestedArch || 'x64';
  if (requestedArch && !['x64', 'arm64'].includes(requestedArch)) throw new Error(usage);
  return { platform, arch };
}

function packageOptions({ platform, arch }) {
  const windows = platform === 'win32';
  const ignore = windows
    ? commonIgnore.concat([
      /^\/assets\/icon\.icns$/,
      /^\/assets\/trayTemplate(?:@2x)?\.png$/,
      /^\/assets\/icon\.iconset\/(?!(?:icon_32x32|icon_256x256)\.png$).+/,
    ])
    : commonIgnore;

  const options = {
    dir: root,
    name: windows ? appName : 'vibe-translator',
    executableName: windows ? appName : 'vibe-translator',
    appBundleId: 'local.baro.translate',
    appVersion,
    platform,
    arch,
    icon: path.join(root, windows ? 'assets/icon.ico' : 'assets/icon'),
    out: buildDir,
    overwrite: true,
    asar: true,
    prune: true,
    ignore,
  };

  if (!windows) {
    options.appCategoryType = 'public.app-category.productivity';
    options.extendInfo = {
      NSHighResolutionCapable: true,
      LSMinimumSystemVersion: '13.0',
      NSHumanReadableCopyright: 'ChatGPT web components: codex-chatgpt-web contributors (MIT).',
    };
  }
  return options;
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `${command} exited with ${result.status}`).trim());
  }
}

function nestedCodeBundles(directory, bundles = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.name.endsWith('.app') || entry.name.endsWith('.framework')) {
      nestedCodeBundles(entryPath, bundles);
      bundles.push(entryPath);
    } else if (entry.name === 'Frameworks') {
      nestedCodeBundles(entryPath, bundles);
    }
  }
  return bundles;
}

function signMacApp(appPath) {
  if (process.platform !== 'darwin') {
    throw new Error(`macOS app signing requires macOS, not ${process.platform}.`);
  }
  const frameworksPath = path.join(appPath, 'Contents', 'Frameworks');
  for (const bundle of nestedCodeBundles(frameworksPath)) {
    run('codesign', ['--force', '--sign', '-', bundle]);
  }
  run('codesign', ['--force', '--sign', '-', appPath]);
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath]);
}

function removeExistingFile(filePath) {
  try {
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile()) throw new Error(`Refusing to replace non-file artifact path: ${filePath}`);
    fs.unlinkSync(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function createWindowsSetup(appPath, setupPath, arch) {
  if (!['darwin', 'win32'].includes(process.platform)) {
    throw new Error(`Windows Setup EXE packaging requires macOS or Windows, not ${process.platform}.`);
  }
  removeExistingFile(setupPath);
  const stagingDirectory = path.join(buildDir, 'windows-installer');
  fs.rmSync(stagingDirectory, { recursive: true, force: true });
  const builderCli = path.join(root, 'node_modules', 'electron-builder', 'cli.js');
  run(process.execPath, [builderCli, '--win', 'nsis', `--${arch}`, '--prepackaged', appPath, '--projectDir', root, '--config.directories.output=build/windows-installer']);
  const stagedSetup = path.join(stagingDirectory, path.basename(setupPath));
  if (!fs.statSync(stagedSetup).isFile()) throw new Error(`Windows installer was not created: ${stagedSetup}`);
  fs.renameSync(stagedSetup, setupPath);
  fs.rmSync(stagingDirectory, { recursive: true, force: true });
}

function createMacDmg(appPath, dmgPath) {
  if (process.platform !== 'darwin') {
    throw new Error(`macOS DMG packaging requires macOS, not ${process.platform}.`);
  }
  removeExistingFile(dmgPath);
  const stagingDirectory = fs.mkdtempSync(path.join(buildDir, 'dmg-stage-'));
  try {
    run('ditto', [appPath, path.join(stagingDirectory, path.basename(appPath))]);
    fs.symlinkSync('/Applications', path.join(stagingDirectory, 'Applications'));
    run('hdiutil', ['create', '-volname', appName, '-srcfolder', stagingDirectory, '-ov', '-format', 'UDZO', '-imagekey', 'zlib-level=9', dmgPath]);
  } finally {
    fs.rmSync(stagingDirectory, { recursive: true, force: true });
  }
}

function artifactDirectory() {
  const directory = path.join(buildDir, 'installers');
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}


async function main() {
  const target = parseTarget(process.argv.slice(2));
  const paths = await packager(packageOptions(target));
  const packagedDirectory = paths[0];
  const packagedAppName = target.platform === 'win32' ? appName : 'vibe-translator';
  const packagedAppPath = target.platform === 'win32' ? packagedDirectory : path.join(packagedDirectory, `${packagedAppName}.app`);
  const appPath = target.platform === 'win32' ? packagedDirectory : path.join(packagedDirectory, `${appName}.app`);
  if (target.platform === 'darwin') {
    if (!fs.statSync(packagedAppPath).isDirectory()) {
      throw new Error(`Packaged macOS app bundle was not found: ${packagedAppPath}`);
    }
    fs.renameSync(packagedAppPath, appPath);
    const infoPlistPath = path.join(appPath, 'Contents', 'Info.plist');
    run('plutil', ['-replace', 'CFBundleName', '-string', 'vibe-translator', infoPlistPath]);
    run('plutil', ['-replace', 'CFBundleDisplayName', '-string', appName, infoPlistPath]);
  }
  const directory = artifactDirectory();
  const filename = target.platform === 'win32'
    ? `vibe-translator-${appVersion}-windows-${target.arch}-setup.exe`
    : `vibe-translator-${appVersion}-macos-${target.arch}.dmg`;
  const artifactPath = path.join(directory, filename);

  if (target.platform === 'win32') {
    createWindowsSetup(appPath, artifactPath, target.arch);
  } else {
    signMacApp(appPath);
    createMacDmg(appPath, artifactPath);
  }
  process.stdout.write(`${appPath}\n${artifactPath}\n`);
}

main().catch(error => {
  process.stderr.write(error.message + '\n');
  process.exitCode = 1;
});
