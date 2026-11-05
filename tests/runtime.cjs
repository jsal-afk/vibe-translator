const path = require('node:path');

function executablePathOverride(...variables) {
  const value = variables.map(name => process.env[name]).find(Boolean);
  return value ? { executablePath: path.resolve(value) } : {};
}

function electronLaunchOptions() {
  // Playwright otherwise discovers the Electron executable installed by npm.
  return executablePathOverride('BARO_ELECTRON_PATH', 'ELECTRON_PATH');
}

module.exports = { electronLaunchOptions };
