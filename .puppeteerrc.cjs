/** @type {import('puppeteer').Configuration} */
module.exports = {
  // We run the full Chrome headless (fast.com requires it for accurate
  // measurements). Skip the headless-shell download to save ~150 MB.
  skipChromeHeadlessShellDownload: true,
};
