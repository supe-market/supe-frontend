import { analyticsApi, umsApi } from '../../lib/http';

export const AUTH_SUCCESS_CODES = new Set(['000012', '000006']);

type LoginIdentifier = {
  email?: string;
  phone?: string;
  userLoginType: 'supe';
};

export function authenticateUser(state: string, clientId: string, redirectUrl: string) {
  return umsApi.get('/oauth2/authenticate', {
    params: {
      response_type: 'code',
      state,
      client_id: clientId,
      redirect_url: redirectUrl
    }
  });
}

export function loginUser(identifier: LoginIdentifier, password: string, xsrfToken: string) {
  return umsApi.post('/oauth2/authenticate', {
    email: identifier.email,
    phone: identifier.phone,
    password,
    xsrfToken,
    userLoginType: identifier.userLoginType
  });
}

export function createAnalyticsCookie(oauthCode: string) {
  return analyticsApi.get('/cookie', {
    params: { oauthCode }
  });
}

export function validateAnalyticsCookie() {
  return analyticsApi.get('/cookie');
}

export function logoutAuthService() {
  return umsApi.delete('/oauth2/logout');
}

export function clearAnalyticsCookie() {
  return analyticsApi.delete('/cookie');
}
