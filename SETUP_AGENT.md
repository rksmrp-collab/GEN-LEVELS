# Coding-agent setup instructions

You are setting up the Gen Levels chart application for its owner. Work only inside this folder. Do not upload, print, commit, or expose credentials.

## Desired result

Install the required runtime and dependencies, validate the environment, build the application, and start it locally at `http://127.0.0.1:8790/manju`.

## Rules

1. Detect the operating system before installing anything.
2. Node.js 22.13 or newer is required. Prefer the current Node.js 22 LTS release.
3. Python is not required for the web application. Python 3 is only needed if the owner wants to run `maintenance.py` as a scheduler helper.
4. Use `npm ci`; do not change dependency versions or regenerate lockfiles unless installation is demonstrably impossible.
5. Never put real credentials in source files, chat messages, logs, screenshots, commits, or shell history.
6. Never commit `.env.local`, `data/`, `node_modules/`, build output, generated tokens, or SQLite files.
7. This is a paper-trading/chart application. Do not add or enable live broker order submission.

## Setup procedure

1. Confirm this folder contains `package.json`, `package-lock.json`, `app/`, and `.env.example`.
2. Check `node --version`. If Node.js is missing or older than 22.13, ask permission and install Node.js 22 LTS using the safest standard method for the detected OS.
3. Check `npm --version`.
4. If `.env.local` does not exist, copy `.env.example` to `.env.local`.
5. Inspect `.env.local`. If a required value is blank or contains `CHANGE_ME`, ask the owner privately for the Dhan Client ID and current Dhan access token.
6. Save those values only in `.env.local`. Keep `MANJU_STATE_DIR=./data` for a normal local setup.
7. Run `npm ci`.
8. Run `npm run build` and resolve setup or dependency errors without changing application behavior.
9. Run `node tests/option-strategy.cjs`, `node tests/option-loading.cjs`, and `node tests/token-recovery.cjs`.
10. Start development mode with `npm run dev`, or production mode with `npm start` after a successful build.
11. Open `http://127.0.0.1:8790/manju` and verify the page, Dhan connection, NIFTY chart, option chain, timeframe switching, and strike switching.
12. Verify that no credential appears in browser output or logs.

## Environment variables

- `DHAN_CLIENT_ID`: Dhan numeric client ID. Required.
- `DHAN_ACCESS_TOKEN`: Current Dhan access token. Required for the recommended manual setup; update it and restart the app whenever Dhan issues a new token.
- `DHAN_PIN`: Optional account/app PIN used only for automatic token generation when `DHAN_ACCESS_TOKEN` is blank.
- `DHAN_TOTP_SECRET`: Optional Base32 TOTP secret used only with the automatic fallback.
- `MANJU_STATE_DIR`: Directory for `token.json` and `paper.sqlite3`. Defaults to `./data`.
- `SHOW_POSITIONS`: Set to `true` for a trusted local installation; set to `false` for chart-only access.
- `POSITIONS_USERNAME`: Optional username supplied by a trusted reverse proxy through `X-Authenticated-User`.

## Optional unattended monitoring

`maintenance.py` uses only the Python standard library. If unattended token refresh and paper monitoring are required, use the operating system scheduler to run it while the web application is running. Do not install Python packages for this file.

When setup is complete, report the local URL, validation results, and any remaining manual action. Do not repeat or reveal credentials.
