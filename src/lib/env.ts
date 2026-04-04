function readEnv(name: string, fallback = ''): string {
  const value = import.meta.env[name];
  return typeof value === 'string' ? value : fallback;
}

function deriveAskApiUrl() {
  const explicit = readEnv('VITE_ASK_API_URL');
  if (explicit) {
    return explicit;
  }
  const analyticsApiUrl = readEnv('VITE_ANALYTICS_API_URL');
  if (!analyticsApiUrl) {
    return '';
  }
  if (/\/api\/v1\/?$/.test(analyticsApiUrl)) {
    return analyticsApiUrl.replace(/\/api\/v1\/?$/, '/ask-api/api/v1');
  }
  return `${analyticsApiUrl.replace(/\/$/, '')}/ask-api/api/v1`;
}

export const env = {
  appType: readEnv('VITE_APP_TYPE', 'AppSupe'),
  umsApiUrl: readEnv('VITE_UMS_API_URL'),
  analyticsApiUrl: readEnv('VITE_ANALYTICS_API_URL'),
  askApiUrl: deriveAskApiUrl(),
  clientId: readEnv('VITE_API_CLIENTID', 'supe'),
  redirectUrl: readEnv('VITE_API_REDIRECT_URL'),
  sentryDsn: readEnv('VITE_SENTRY_DSN')
};
