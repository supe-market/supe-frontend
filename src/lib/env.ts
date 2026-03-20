function readEnv(name: string, fallback = ''): string {
  const value = import.meta.env[name];
  return typeof value === 'string' ? value : fallback;
}

export const env = {
  appType: readEnv('VITE_APP_TYPE', 'AppSupe'),
  umsApiUrl: readEnv('VITE_UMS_API_URL'),
  analyticsApiUrl: readEnv('VITE_ANALYTICS_API_URL'),
  clientId: readEnv('VITE_API_CLIENTID', 'supe'),
  redirectUrl: readEnv('VITE_API_REDIRECT_URL'),
  sentryDsn: readEnv('VITE_SENTRY_DSN')
};
