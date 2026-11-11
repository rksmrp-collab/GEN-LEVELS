import { optionTriggerLevels, nextOptionLevelBelow, touchesOptionLevel as touched, tradingDayCandles } from '@/app/lib/option-levels';
import { dhan } from '@/app/lib/dhan-api';
import { dhanHeaders } from '@/app/lib/dhan-auth';
import { NextRequest, NextResponse } from 'next/server';
import { ensurePaperDb } from '@/app/lib/paper-db';

const DHAN_API = 'https://api.dhan.co/v2';
const DHAN_MASTER = 'https://images.dhan.co/api-data/api-scrip-master.csv';
const STARTING_CAPITAL = 100000;
const ASSETS = {
  NIFTY: { securityId: 13, segment: 'IDX_I', step: 50, fno: 'NSE_FNO' },
  BANKNIFTY: { securityId: 25, segment: 'IDX_I', step: 100, fno: 'NSE_FNO' },
  SENSEX: { securityId: 51, segment: 'IDX_I', step: 100, fno: 'BSE_FNO' },
} as const;
type Asset = keyof typeof ASSETS;
type Side = 'CE' | 'PE';
type Candle = { timestamp: number; open: number; high: number; low: number; close: number };
type Contract = { securityId: number; strike: number; side: Side; ltp: number };
type OpenRow = {
  id: string;
  asset: Asset;
  security_id: number;
  entry_price: number;
  stop_price: number;
  target_price: number;
  quantity: number;
  open_time: string;
};

let masterCache: { expires: number; lots: Map<number, number> } | null = null;



function parseCsvLine(line: string) {
  const fields: string[] = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) { fields.push(value); value = ''; }
    else value += char;
  }
  fields.push(value);
  return fields;
}

async function lotSize(securityId: number) {
  if (!masterCache || masterCache.expires < Date.now()) {
    const response = await fetch(DHAN_MASTER, { cf: { cacheTtl: 21600 } } as RequestInit);
    if (!response.ok) throw new Error('Dhan instrument master unavailable');
    const lines = (await response.text()).split(/\r?\n/);
    const headers = parseCsvLine(lines[0]);
    const idIndex = headers.indexOf('SEM_SMST_SECURITY_ID');
    const lotIndex = headers.indexOf('SEM_LOT_UNITS');
    const lots = new Map<number, number>();
    for (const line of lines.slice(1)) {
      const row = parseCsvLine(line);
      const id = Number(row[idIndex]);
      const lot = Number(row[lotIndex]);
      if (id && lot) lots.set(id, lot);
    }
    masterCache = { expires: Date.now() + 21600000, lots };
  }
  return masterCache.lots.get(securityId) || 1;
}

function istParts(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function candleDate(timestamp: number) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(timestamp * 1000));
}

function candleMinutes(timestamp: number) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(timestamp * 1000));
  const map = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return Number(map.hour) * 60 + Number(map.minute);
}

async function optionHistory(securityId: number, segment: string): Promise<Candle[]> {
  const now = new Date();
  const from = new Date(now.getTime() - 12 * 86400000);
  const date = (value: Date) => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(value);
  const raw = await dhan('/charts/intraday', {
    securityId: String(securityId), exchangeSegment: segment, instrument: 'OPTIDX',
    interval: '1', oi: true, fromDate: `${date(from)} 09:00:00`, toDate: `${date(now)} 23:59:59`,
  });
  return (raw.timestamp || []).map((timestamp: number, i: number) => ({
    timestamp,
    open: Number(raw.open?.[i] || 0), high: Number(raw.high?.[i] || 0),
    low: Number(raw.low?.[i] || 0), close: Number(raw.close?.[i] || 0),
  }));
}

async function insertPosition(args: {
  asset: Asset; sourceSide: Side; contract: Contract; expiry: string; signalType: string;
  signalLevel: number; signalKey: string; entry: number; stop: number; target: number; timestamp: number;
}) {
  const db = await ensurePaperDb();
  const lot = await lotSize(args.contract.securityId);
  // Claim the signal and fund its position together, with no asynchronous gap.
  return db.raw.transaction(() => {
    const capital = db.raw.prepare(`SELECT
      COALESCE(SUM(CASE WHEN status = 'CLOSED' THEN pnl ELSE 0 END), 0) AS realized,
      COALESCE(SUM(CASE WHEN status = 'OPEN' THEN entry_price * quantity ELSE 0 END), 0) AS deployed
      FROM paper_positions`).get() as { realized: number; deployed: number };
    const available = STARTING_CAPITAL + capital.realized - capital.deployed;
    if (args.entry * lot > available) return false;
    const claimed = db.raw.prepare('INSERT OR IGNORE INTO paper_signals (signal_key, created_at) VALUES (?, ?)')
      .run(args.signalKey, new Date().toISOString());
    if (!claimed.changes) return false;
    const id = crypto.randomUUID();
    const openTime = new Date(args.timestamp * 1000).toISOString();
    const contractName = `${args.asset} ${args.expiry} ${args.contract.strike.toLocaleString('en-IN')} ${args.contract.side}`;
    db.raw.prepare(`INSERT INTO paper_positions (
        id, mode, asset, source_side, side, strike, contract, expiry, security_id, status,
        signal_type, signal_level, open_time, quantity, lot_size, entry_price, stop_price,
        target_price, pnl, created_at
      ) VALUES (?, 'FORWARD', ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`)
      .run(id, args.asset, args.sourceSide, args.contract.side, args.contract.strike, contractName,
        args.expiry, args.contract.securityId, args.signalType, args.signalLevel, openTime,
        lot, lot, args.entry, args.stop, args.target, new Date().toISOString());
    return true;
  })();
}

async function closePosition(position: OpenRow, candle: Candle, reason: 'STOP' | 'TARGET' | 'EOD', exit: number) {
  const db = await ensurePaperDb();
  const pnl = (exit - position.entry_price) * position.quantity;
  await db.prepare(`UPDATE paper_positions SET status = 'CLOSED', close_time = ?, exit_price = ?, pnl = ?, close_reason = ? WHERE id = ? AND status = 'OPEN'`)
    .bind(new Date(candle.timestamp * 1000).toISOString(), exit, pnl, reason, position.id).run();
}

export async function POST(request: NextRequest) {
  try {
    await dhanHeaders();
    const requested = (request.nextUrl.searchParams.get('asset') || 'NIFTY') as Asset;
    if (!ASSETS[requested]) return NextResponse.json({ error: 'Unsupported asset' }, { status: 400 });
    const asset = requested;
    const spec = ASSETS[asset];
    const clock = istParts();
    const db = await ensurePaperDb();
    const expiryData = await dhan('/optionchain/expirylist', { UnderlyingScrip: spec.securityId, UnderlyingSeg: spec.segment });
    const expiry = String(expiryData.data?.[0] || '');
    if (!expiry) throw new Error('No active option expiry');
    const chainData = await dhan('/optionchain', { UnderlyingScrip: spec.securityId, UnderlyingSeg: spec.segment, Expiry: expiry });
    const spot = Number(chainData.data?.last_price || 0);
    const rows = Object.entries(chainData.data?.oc || {}).map(([strikeText, legs]: [string, any]) => ({ strike: Number(strikeText), legs }));
    const atm = Math.round(spot / spec.step) * spec.step;
    const pick = (strike: number, side: Side): Contract => {
      const row = rows.find((item) => item.strike === strike);
      const leg = side === 'CE' ? row?.legs?.ce : row?.legs?.pe;
      if (!row || !leg || !Number(leg.security_id)) throw new Error(`Missing ${strike} ${side} contract`);
      return { securityId: Number(leg.security_id), strike: row.strike, side, ltp: Number(leg.last_price || 0) };
    };
    const ce = pick(atm - 2 * spec.step, 'CE');
    const pe = pick(atm + 2 * spec.step, 'PE');
    const [ceHistory, peHistory] = await Promise.all([
      optionHistory(ce.securityId, spec.fno), optionHistory(pe.securityId, spec.fno),
    ]);
    const today = clock.date;
    const todayCe = tradingDayCandles(ceHistory, today);
    const todayPe = tradingDayCandles(peHistory, today);
    const current = { CE: todayCe.at(-1), PE: todayPe.at(-1) } as const;
    const opens = { CE: todayCe[0]?.open, PE: todayPe[0]?.open } as const;
    const histories = new Map<number, Candle[]>([[ce.securityId, ceHistory], [pe.securityId, peHistory]]);

    const openRows = await db.prepare("SELECT id, asset, security_id, entry_price, stop_price, target_price, quantity, open_time FROM paper_positions WHERE status = 'OPEN' AND asset = ?")
      .bind(asset).all<OpenRow>();
    for (const position of openRows.results || []) {
      let history = histories.get(position.security_id);
      if (!history) {
        history = await optionHistory(position.security_id, spec.fno);
        histories.set(position.security_id, history);
      }
      const openDate = candleDate(new Date(position.open_time).getTime() / 1000);
      const todayCandle = history.filter((candle) => candleDate(candle.timestamp) === today).at(-1);
      const eodCandle = history.filter((candle) => candleDate(candle.timestamp) === openDate && candleMinutes(candle.timestamp) <= 15 * 60 + 15).at(-1);
      const candle = openDate < today ? eodCandle : todayCandle;
      if (!candle) continue;
      if (openDate < today || clock.minutes >= 15 * 60 + 15) await closePosition(position, candle, 'EOD', candle.close);
      else if (candle.low <= position.stop_price) await closePosition(position, candle, 'STOP', position.stop_price);
      else if (candle.high >= position.target_price) await closePosition(position, candle, 'TARGET', position.target_price);
    }

    let opened = 0;
    if (clock.minutes >= 9 * 60 + 15 && clock.minutes < 15 * 60 + 15 && current.CE && current.PE && opens.CE && opens.PE) {
      const contracts = { CE: ce, PE: pe };
      const candles = { CE: current.CE, PE: current.PE };
      for (const side of ['CE', 'PE'] as const) {
        const contract = contracts[side];
        const candle = candles[side];
        const open = opens[side];
        const formula = optionTriggerLevels(open);
        if (formula.lowerT3 !== undefined && formula.nextLower !== undefined && formula.nextLower > 0 && touched(candle, formula.lowerT3)) {
          opened += Number(await insertPosition({ asset, sourceSide: side, contract, expiry,
            signalType: 'LOWER_T3', signalLevel: formula.lowerT3,
            signalKey: `${today}:${asset}:LOWER_T3:${side}:${contract.securityId}:${candle.timestamp}`,
            entry: formula.lowerT3, stop: formula.nextLower, target: open, timestamp: candle.timestamp }));
        }
        if (formula.upperT3 !== undefined && touched(candle, formula.upperT3)) {
          const oppositeSide: Side = side === 'CE' ? 'PE' : 'CE';
          const opposite = contracts[oppositeSide];
          const oppositeCandle = candles[oppositeSide];
          const oppositeOpen = opens[oppositeSide];
          const entry = oppositeCandle.close || opposite.ltp;
          const stop = nextOptionLevelBelow(oppositeOpen, entry);
          if (stop === undefined || !Number.isFinite(entry) || entry <= stop) continue;
          const target = entry + 2 * (entry - stop);
          opened += Number(await insertPosition({ asset, sourceSide: side, contract: opposite, expiry,
            signalType: 'OPPOSITE_UPPER_T3', signalLevel: formula.upperT3,
            signalKey: `${today}:${asset}:UPPER_T3:${side}:${contract.securityId}:${candle.timestamp}`,
            entry, stop, target, timestamp: candle.timestamp }));
        }
      }
    }
    return NextResponse.json({ ok: true, asset, spot, monitored: [ce, pe], opened, updatedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Paper engine failed';
    return NextResponse.json({ ok: false, error: message === 'DHAN_NOT_CONFIGURED' ? 'Dhan credentials are not configured' : message }, { status: message === 'DHAN_NOT_CONFIGURED' ? 503 : 502 });
  }
}
