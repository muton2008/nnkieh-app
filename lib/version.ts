import packageJson from '../package.json';

export const APP_VERSION = packageJson.version;

export const getAppVersionDisplay = () => {
  return `v${APP_VERSION}`;
};