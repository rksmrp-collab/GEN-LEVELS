# Chart performance diagnostics

Chart loads now use a short trace ID so the browser and server logs can be matched.
No access token, PIN, TOTP secret, candle payload, or account data is logged.

## Browser console

Filter the browser console for `ManjuPerf`. A load emits:

- `load.start`: instrument, strike, side, and requested timeframes.
- `response.headers`: total fetch time plus the server's own processing time.
- `response.parsed`: JSON parsing time and returned candle counts.
- `render.ready`: end-to-end time after React has painted twice.
- `load.aborted`: an older request was correctly cancelled by a newer click.
- `load.error`: a real failed request.

## Server console

Filter the application/server logs for `ManjuPerf`:

- `snapshot.start` / `snapshot.*.done`: total API route work.
- `dhan.cache.hit`: the result was served from the warm in-process cache.
- `dhan.cache.stale`: a cached result was returned immediately and refreshed in the background.
- `dhan.network.start`: includes time spent waiting behind Dhan's documented rate limits.
- `dhan.network.done`: separates queue, network, and total milliseconds.
- `dhan.network.error` / `snapshot.error`: failed upstream or route work.

The same trace ID appears in the URL, `X-Manju-Trace` response header, browser logs,
and snapshot server logs. When reporting a slow load, copy every `ManjuPerf` line for
that trace ID from the browser and the server.

## Fast paths

- A strike change requests only the selected option's candles.
- A timeframe change requests only chart candles; it does not reload expiry lists,
  the full option chain, futures, or quote metadata.
- Dhan's native 5, 15, and 60 minute history intervals are used when possible.
  The 30-minute chart is built from 15-minute data and the 4-hour chart from hourly data.
- Historical responses use request coalescing and stale-while-revalidate caching.
- Background full-asset prefetches were removed because they could block a visible user request.
- Strike changes derive the immutable session open from the returned candle history,
  avoiding a second rate-limited market-quote call.
- Full asset switches overlap underlying history, daily history, OHLC and futures
  work with expiry/option-chain loading instead of running those stages serially.
- Neighbor-contract warming is limited to the two adjacent strikes so speculative
  requests cannot saturate Dhan ahead of an actual user click.
