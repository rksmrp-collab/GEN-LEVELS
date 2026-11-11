import { NextResponse } from 'next/server';
import { ensurePaperDb } from '@/app/lib/paper-db';

type PositionRow = {
  id: string;
  mode: string;
  asset: string;
  source_side: string;
  side: string;
  strike: number;
  contract: string;
  expiry: string;
  status: string;
  signal_type: string;
  open_time: string;
  close_time: string | null;
  quantity: number;
  lot_size: number;
  entry_price: number;
  exit_price: number | null;
  stop_price: number;
  target_price: number;
  pnl: number;
  close_reason: string | null;
};

export async function GET() {
  try {
    const db = await ensurePaperDb();
    const result = await db
      .prepare('SELECT * FROM paper_positions ORDER BY open_time DESC LIMIT 500')
      .all<PositionRow>();
    const positions = (result.results || []).map((row) => ({
      id: row.id,
      mode: row.mode,
      asset: row.asset,
      sourceSide: row.source_side,
      side: row.side,
      strike: row.strike,
      contract: row.contract,
      expiry: row.expiry,
      status: row.status,
      signalType: row.signal_type,
      openTime: row.open_time,
      closeTime: row.close_time,
      quantity: row.quantity,
      lotSize: row.lot_size,
      entryPrice: row.entry_price,
      exitPrice: row.exit_price,
      stopPrice: row.stop_price,
      targetPrice: row.target_price,
      pnl: row.pnl,
      closeReason: row.close_reason,
    }));
    return NextResponse.json({ positions }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Paper ledger unavailable' },
      { status: 500 },
    );
  }
}
