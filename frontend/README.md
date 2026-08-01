# frontend

This template should help get you started developing with Vue 3 in Vite.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
npm ci
```

Gunakan versi Node.js pada `.nvmrc` di root repository. Realtime ticket memakai
authenticated fetch stream; bearer token tidak dikirim melalui query string.

Salin `.env.example` menjadi `.env` bila API tidak berada pada origin yang sama:

```sh
VITE_API_BASE_URL=https://api.example.com
```

Saat development tanpa `VITE_API_BASE_URL`, Vite meneruskan request `/api` ke
`http://localhost:3000`.

Karena aplikasi memakai history mode, server production harus mengarahkan route
SPA seperti `/assets` dan `/users` kembali ke `index.html` (history fallback).

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Compile and Minify for Production

```sh
npm run build
```

### Lint with [ESLint](https://eslint.org/)

```sh
npm run lint
```
