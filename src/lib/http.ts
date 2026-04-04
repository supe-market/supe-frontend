import axios from 'axios';
import { env } from './env';

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
