import { NextResponse } from 'next/server';

const MASTER_URL = 'https://images.dhan.co/api-data/api-scrip-master.csv';
let cache: { expires: number; instruments: object[]; indices: object[] } | null = null;

function parseCsvLine(line: string) {
  const fields: string[] = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      fields.push(value);
      value = '';
    } else value += char;
  }
  fields.push(value);
  return fields;
}

export async function GET() {
  try {
    if (cache && cache.expires > Date.now())
      return NextResponse.json({ instruments: cache.instruments, indices: cache.indices });
    const response = await fetch(MASTER_URL, {
      cf: { cacheTtl: 21600 },
    } as RequestInit);
    if (!response.ok)
      throw new Error(`Instrument list HTTP ${response.status}`);
    const lines = (await response.text()).split(/\r?\n/);
    const headers = parseCsvLine(lines[0]);
    const index = Object.fromEntries(headers.map((name, i) => [name, i]));
    const instruments = lines
      .slice(1)
      .map(parseCsvLine)
      .filter(
        (row) =>
          row[index.SEM_EXM_EXCH_ID] === 'NSE' &&
          row[index.SEM_SEGMENT] === 'E' &&
          row[index.SEM_INSTRUMENT_NAME] === 'EQUITY' &&
          row[index.SEM_SERIES] === 'EQ' &&
          !row[index.SEM_TRADING_SYMBOL].includes('NSETEST'),
      )
      .map((row) => ({
        securityId: Number(row[index.SEM_SMST_SECURITY_ID]),
        symbol: row[index.SEM_TRADING_SYMBOL],
        name:
          row[index.SEM_CUSTOM_SYMBOL] ||
          row[index.SM_SYMBOL_NAME] ||
          row[index.SEM_TRADING_SYMBOL],
        segment: 'NSE_EQ',
        instrument: 'EQUITY',
        exchange: 'NSE',
        kind: 'STOCK',
      }))
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
    const indices = lines
      .slice(1)
      .map(parseCsvLine)
      .filter((row) =>
        ['NSE', 'BSE'].includes(row[index.SEM_EXM_EXCH_ID]) &&
        row[index.SEM_SEGMENT] === 'I' &&
        row[index.SEM_INSTRUMENT_NAME] === 'INDEX' &&
        Number(row[index.SEM_SMST_SECURITY_ID]) > 0,
      )
      .map((row) => ({
        securityId: Number(row[index.SEM_SMST_SECURITY_ID]),
        symbol: row[index.SEM_TRADING_SYMBOL],
        name:
          row[index.SEM_CUSTOM_SYMBOL] ||
          row[index.SM_SYMBOL_NAME] ||
          row[index.SEM_TRADING_SYMBOL],
        segment: 'IDX_I',
        instrument: 'INDEX',
        exchange: row[index.SEM_EXM_EXCH_ID],
        kind: 'INDEX',
      }))
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
    cache = { expires: Date.now() + 21600000, instruments, indices };
    return NextResponse.json(
      { instruments, indices },
      { headers: { 'Cache-Control': 'public, max-age=3600' } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Instrument list unavailable',
      },
      { status: 502 },
    );
  }
}
