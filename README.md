# supe-frontend

React frontend for Supe Market.

## Responsibilities

- render the Supe Market UI
- authenticate through `auth-service`
- talk to `supe-analytics`
- talk to `supe-ask` through the analytics-hosted `/ask-api` path or an explicit Ask base URL

## Local Development

Install dependencies and start Vite:

```bash
npm install
npm run dev
```

The checked-in local `.env` uses Vite proxy paths:

- `/auth` -> `https://auth.localhost`
- `/analytics` -> `https://analytics.localhost`

That proxy behavior is defined in `vite.config.ts`.

## Build

```bash
npm run build
```

## Staging Hosting

This frontend is deployed to Firebase Hosting.

Typical deploy flow:

```bash
npm run build
npx firebase-tools deploy --only hosting
```

Firebase project selection is configured in `.firebaserc`, and hosting rewrites are configured in `firebase.json`.

## Environment

- local defaults live in `.env`
- example values live in `.env.example`
- staging build values must be injected from the deploy shell or CI as `VITE_*` environment variables

`VITE_ASK_API_URL` is optional. If omitted, the app derives Ask from `VITE_ANALYTICS_API_URL`.
