# Gen Levels

Gen Levels is a Next.js market-charting and paper-trading application powered by Dhan market data. It includes underlying and option charts, option chains, calculated intraday/weekly levels, drawing tools, synchronized crosshairs, and a local paper-position ledger.

## Client handoff

Give this complete folder to the client. Ask their coding agent to read and follow `SETUP_AGENT.md`.

The client must provide their own Dhan Client ID and daily access token. These values belong only in `.env.local`. Never send the folder after filling it with somebody else's credentials.

## Manual quick start

Requirements: Node.js 22.13 or newer and npm.

1. Set `DHAN_CLIENT_ID` and `DHAN_ACCESS_TOKEN` in `.env.local`.
2. Run `npm ci`.
3. Run `npm run build`.
4. Run `npm start`.
5. Open `http://127.0.0.1:8790/manju`.

For active development, use `npm run dev` instead of the build/start commands.

## Security

- `.env.local`, generated Dhan tokens, and the local SQLite database are ignored by Git.
- Generate an access token in Dhan, paste it into `DHAN_ACCESS_TOKEN` in `.env.local`, and restart the app. Repeat this when Dhan issues a new token.
- Automatic generation remains available as an optional fallback when `DHAN_ACCESS_TOKEN` is blank and `DHAN_PIN` plus `DHAN_TOTP_SECRET` are configured.
- Generated state is stored under `MANJU_STATE_DIR` (`./data` by default).
- This application contains no live broker order-submission route. Its ledger is paper trading only.

## Optional maintenance helper

`maintenance.py` can keep authentication ready and run the paper monitor while the web server is active. It uses only Python's standard library; no Python packages are required. The web application itself does not require Python.
