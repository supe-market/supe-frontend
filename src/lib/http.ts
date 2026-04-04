import axios from 'axios';
import { env } from './env';
import { emitSessionExpired } from '../features/auth/session-events';

function withAppTypeHeader(request: any) {
  if (env.appType) {
    request.headers = request.headers ?? {};
    request.headers.appType = env.appType;
  }
  return request;
}

export const umsApi = axios.create({
  baseURL: env.umsApiUrl,
  withCredentials: true
});

export const analyticsApi = axios.create({
  baseURL: env.analyticsApiUrl,
  withCredentials: true
});

export const askApi = axios.create({
  baseURL: env.askApiUrl,
  withCredentials: true
});

umsApi.interceptors.request.use(withAppTypeHeader);
analyticsApi.interceptors.request.use(withAppTypeHeader);
askApi.interceptors.request.use(withAppTypeHeader);

function handleAuthFailure(error: any) {
  const status = Number(error?.response?.status || 0);
  if (status === 401 || status === 403) {
    emitSessionExpired();
  }
  return Promise.reject(error);
}

umsApi.interceptors.response.use((response) => response, handleAuthFailure);
analyticsApi.interceptors.response.use((response) => response, handleAuthFailure);
askApi.interceptors.response.use((response) => response, handleAuthFailure);
