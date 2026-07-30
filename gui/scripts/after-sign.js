const { execSync } = require('child_process');
const path = require('path');

exports.default = async function afterSign(context) {
  const appPath = context.appOutDir;
  const appName = context.packager.appInfo.productFilename;
  const appBundle = path.join(appPath, `${appName}.app`);

  // Ad-hoc deep sign so Gatekeeper can evaluate the binary.
  // Fully unsigned apps are hard-blocked on Sequoia even after "Open Anyway".
  // Ad-hoc signed apps show the standard "downloaded from internet" prompt.
  console.log(`[after-sign] Ad-hoc signing ${appBundle}`);
  try {
    execSync(`codesign --force --deep --sign - "${appBundle}"`, { stdio: 'inherit' });
    console.log(`[after-sign] Ad-hoc signing completed`);
  } catch (e) {
    console.warn(`[after-sign] Warning: ad-hoc signing failed: ${e.message}`);
  }
};
