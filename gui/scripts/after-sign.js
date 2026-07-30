const { execSync } = require('child_process');
const path = require('path');

exports.default = async function afterSign(context) {
  const appPath = context.appOutDir;
  const appName = context.packager.appInfo.productFilename;
  const appBundle = path.join(appPath, `${appName}.app`);

  console.log(`[after-sign] Stripping code signature from ${appBundle}`);
  try {
    execSync(`codesign --remove-signature "${appBundle}"`, { stdio: 'inherit' });
    console.log(`[after-sign] Code signature removed successfully`);
  } catch (e) {
    console.warn(`[after-sign] Warning: codesign removal failed: ${e.message}`);
  }
};
