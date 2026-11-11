import { dhan } from '@/app/lib/dhan-api';
import { NextRequest, NextResponse } from 'next/server';

const ASSETS = {
  NIFTY: { securityId: 13, segment: 'IDX_I' },
  BANKNIFTY: { securityId: 25, segment: 'IDX_I' },
  SENSEX: { securityId: 51, segment: 'IDX_I' },
} as const;

type Asset = keyof typeof ASSETS;

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const asset = (params.get('asset') || 'NIFTY') as Asset;
    const optionSecurityId = Number(params.get('optionSecurityId') || 0);
    const optionSecurityIds = (params.get('optionSecurityIds') || '')
      .split(',')
      .map(Number)
      .filter((value) => Number.isSafeInteger(value) && value > 0)
      .slice(0, 200);
    const stockSecurityId = Number(params.get('stockSecurityId') || 0);
    const stockSegment = params.get('stockSegment') || 'NSE_EQ';
    const index = ASSETS[asset];
    if (!index && stockSecurityId <= 0)
      return NextResponse.json({ error: 'Unsupported underlying' }, { status: 400 });

    const underlyingSegment = stockSecurityId > 0 ? stockSegment : index.segment;
    const underlyingSecurityId = stockSecurityId > 0 ? stockSecurityId : index.securityId;
    const optionSegment = stockSecurityId > 0
      ? params.get('optionSegment') || 'NSE_FNO'
      : asset === 'SENSEX' ? 'BSE_FNO' : 'NSE_FNO';
    const instruments: Record<string, number[]> = {
      [underlyingSegment]: [underlyingSecurityId],
    };
    const requestedOptionIds = [...new Set([
      ...optionSecurityIds,
      ...(optionSecurityId > 0 ? [optionSecurityId] : []),
    ])];
    if (requestedOptionIds.length) instruments[optionSegment] = requestedOptionIds;

    // No response cache: this endpoint drives the currently-forming candle.
    const response = await dhan('/marketfeed/quote', instruments, 0);
    const underlying = response.data?.[underlyingSegment]?.[String(underlyingSecurityId)] || {};
    const option = optionSecurityId > 0
      ? response.data?.[optionSegment]?.[String(optionSecurityId)] || {}
      : {};
    const optionPrices = Object.fromEntries(
      requestedOptionIds.map((securityId) => [
        securityId,
        Number(response.data?.[optionSegment]?.[String(securityId)]?.last_price || 0),
      ]),
    );
    return NextResponse.json({
      underlyingPrice: Number(underlying.last_price || 0),
      underlyingOhlc: {
        open: Number(underlying.ohlc?.open || 0),
        high: Number(underlying.ohlc?.high || 0),
        low: Number(underlying.ohlc?.low || 0),
      },
      optionPrice: Number(option.last_price || 0),
      optionPrices,
      optionOhlc: {
        open: Number(option.ohlc?.open || 0),
        high: Number(option.ohlc?.high || 0),
        low: Number(option.ohlc?.low || 0),
      },
      optionSecurityId,
      updatedAt: new Date().toISOString(),
    }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Live quote unavailable',
    }, { status: 502 });
  }
}
