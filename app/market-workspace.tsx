'use client';

import { calculateOptionLevels } from '@/app/lib/option-levels';
import { type Dispatch, type SetStateAction, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BarChart3,
  BriefcaseBusiness,
  ChevronDown,
  Crosshair,
  Columns2,
  Layers3,
  Maximize2,
  Minimize2,
  Minus,
  Moon,
  MousePointer2,
  RefreshCw,
  Ruler,
  Search,
  Sun,
  Type,
  TrendingUp,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

function chartPerf(traceId: string, event: string, details: Record<string, unknown> = {}) {
  console.info(`[ManjuPerf][${traceId}] ${event}`, details);
}

function newChartTrace(kind: string) {
  return `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

type AssetKey = 'NIFTY' | 'BANKNIFTY' | 'SENSEX';
type Side = 'CE' | 'PE';
type ChartFocusMode = 'NONE' | 'UNDERLYING' | 'OPTION' | 'OPPOSITE' | 'DUO';
type IndexWorkspaceView =
  | 'ALL'
  | 'UNDERLYING'
  | 'OPTION'
  | 'CHAIN'
  | 'OPTION_CHAIN'
  | 'UNDERLYING_OPTION'
  | 'UNDERLYING_CHAIN';
type Timeframe = '1m' | '3m' | '5m' | '15m' | '30m' | '1H' | '4H' | 'D' | 'M';
type Candle = {
  timestamp?: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: string;
};
function calculateTradingIndicators(bars: Candle[]) {
  const closes = bars.map((bar) => bar.close);
  const sma21 = closes.length >= 21
    ? closes.slice(-21).reduce((sum, close) => sum + close, 0) / 21
    : null;
  const bandCloses = closes.slice(-20);
  const middle = bandCloses.length === 20
    ? bandCloses.reduce((sum, close) => sum + close, 0) / 20
    : null;
  const deviation = middle === null
    ? null
    : Math.sqrt(bandCloses.reduce((sum, close) => sum + (close - middle) ** 2, 0) / 20);
  const bollinger = middle !== null && deviation !== null
    ? { lower: middle - 2 * deviation, middle, upper: middle + 2 * deviation }
    : null;
  const lastTimestamp = bars.at(-1)?.timestamp;
  const sessionKey = lastTimestamp
    ? new Date(lastTimestamp * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    : '';
  const sessionBars = sessionKey
    ? bars.filter((bar) => bar.timestamp && new Date(bar.timestamp * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) === sessionKey)
    : bars;
  const volume = sessionBars.reduce((sum, bar) => sum + Math.max(0, bar.volume), 0);
  const vwap = volume > 0
    ? sessionBars.reduce((sum, bar) => sum + ((bar.high + bar.low + bar.close) / 3) * Math.max(0, bar.volume), 0) / volume
    : null;
  return { sma21, bollinger, vwap };
}
type ChartLevel = { value: number; label: string; color: string };
type ChartOiLevel = { strike: number; callOi: number; putOi: number };
type DrawingTool = 'CURSOR' | 'HORIZONTAL' | 'TEXT' | 'SCALE' | 'TREND';
type DrawingPoint = { timestamp: number; price: number };
type ChartDrawing =
  | { id: number; type: 'HORIZONTAL'; price: number }
  | { id: number; type: 'TEXT'; point: DrawingPoint; text: string }
  | { id: number; type: 'SCALE' | 'TREND'; start: DrawingPoint; end: DrawingPoint };
type ChainLeg = {
  ltp: number;
  oi: number;
  volume: number;
  previousOi: number;
  previousClose: number;
  securityId: number;
} | null;
type OptionQuote = {
  open: number;
  high: number;
  low: number;
  close: number;
  previousClose: number;
  updatedAt: string;
};
type LiveSnapshot = {
  connected: boolean;
  asset?: string;
  symbol?: string;
  side?: Side;
  spot: number;
  expiry: string;
  expiries: string[];
  weeklyOpen: number;
  dayOpen?: number;
  underlyingPreviousClose?: number;
  optionDayOpen?: number;
  optionWeeklyOpen?: number;
  optionSecurityId?: number;
  futurePrice?: number;
  futureSymbol?: string;
  futureExpiry?: string;
  selectedStrike: number;
  underlyingCandles: Candle[];
  optionCandles: Candle[];
  chain: { strike: number; ce: ChainLeg; pe: ChainLeg }[];
  updatedAt: string;
  underlyingTimeframe?: Timeframe;
  optionTimeframe?: Timeframe;
};
type NseInstrument = {
  securityId: number;
  symbol: string;
  name: string;
  exchange: 'NSE' | 'BSE';
  segment: 'NSE_EQ' | 'IDX_I';
  instrument: 'EQUITY' | 'INDEX';
  kind: 'STOCK' | 'INDEX';
};
type PaperMode = 'FORWARD' | 'BACKTEST';
type PaperPosition = {
  id: string;
  mode: PaperMode;
  status: 'OPEN' | 'CLOSED';
  openTime: string;
  closeTime: string | null;
  contract: string;
  side: Side;
  quantity: number;
  lotSize: number;
  entryPrice: number;
  exitPrice: number | null;
  pnl: number;
  stopPrice: number;
  targetPrice: number;
  closeReason: string | null;
  signalType: string;
  asset: AssetKey;
};
type PaperSignal = {
  side: Side;
  contract: { strike: number; ltp: number };
  dayOpen: number;
  entryLevel: number;
  bandHigh: number;
  stop: number;
  target: number;
  inBand: boolean;
  oiMatched: boolean;
};
type PaperEngineSnapshot = {
  ok: boolean;
  asset: AssetKey;
  spot: number;
  openingAtm: number;
  expiry: string;
  strikeCount: number;
  callOi: number;
  putOi: number;
  marketOpen: boolean;
  signals: PaperSignal[];
  updatedAt: string;
  error?: string;
};
const TIMEFRAMES: Timeframe[] = [
  '1m',
  '3m',
  '5m',
  '15m',
  '30m',
  '1H',
  '4H',
  'D',
  'M',
];
const INTERVAL_MINUTES: Record<Timeframe, number> = {
  '1m': 1,
  '3m': 3,
  '5m': 5,
  '15m': 15,
  '30m': 30,
  '1H': 60,
  '4H': 240,
  D: 1440,
  M: 43200,
};

const ASSETS: Record<
  AssetKey,
  {
    name: string;
    short: string;
    spot: number;
    weeklyOpen: number;
    step: number;
    change: number;
    intradayStep: number;
  }
> = {
  NIFTY: {
    name: 'NIFTY 50',
    short: 'NIFTY',
    spot: 25114.0,
    weeklyOpen: 25114.0,
    step: 50,
    change: 0.42,
    intradayStep: 59.65,
  },
  BANKNIFTY: {
    name: 'NIFTY BANK',
    short: 'BANK NIFTY',
    spot: 54886.35,
    weeklyOpen: 57343.3,
    step: 100,
    change: -0.18,
    intradayStep: 118,
  },
  SENSEX: {
    name: 'BSE SENSEX',
    short: 'SENSEX',
    spot: 81721.08,
    weeklyOpen: 81721.08,
    step: 100,
    change: 0.31,
    intradayStep: 236,
  },
};

function seeded(seed: number) {
  let s = seed;
  return () => ((s = Math.imul(1664525, s) + 1013904223) >>> 0) / 4294967296;
}
function makeCandles(
  base: number,
  seed: number,
  option = false,
  timeframe: Timeframe = '5m',
): Candle[] {
  const interval = INTERVAL_MINUTES[timeframe];
  const tfSeed = TIMEFRAMES.indexOf(timeframe) * 7919;
  const rnd = seeded(seed + tfSeed);
  let last = base * (0.992 + rnd() * 0.012);
  const scale = Math.sqrt(Math.max(interval / 5, 0.2));
  const volatility =
    (option ? Math.max(base * 0.055, 1.8) : base * 0.00055) * scale;
  return Array.from({ length: 180 }, (_, i) => {
    const drift =
      Math.sin(i / 8) * volatility * 0.18 + (i > 58 ? volatility * 0.08 : 0);
    const open = last;
    const close = Math.max(
      option ? 2 : 1,
      open + (rnd() - 0.47) * volatility + drift,
    );
    const high = Math.max(open, close) + rnd() * volatility * 0.65;
    const low = Math.max(
      0.1,
      Math.min(open, close) - rnd() * volatility * 0.65,
    );
    last = close;
    const totalMinutes = 9 * 60 + 15 + i * interval;
    const time =
      timeframe === 'M'
        ? new Date(2026, i % 12, 1).toLocaleDateString('en-IN', {
            month: 'short',
            year: '2-digit',
          })
        : timeframe === 'D'
          ? `${String((i % 28) + 1).padStart(2, '0')} Sep`
          : `${String(Math.floor((totalMinutes / 60) % 24)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
    return { open, high, low, close, volume: 24 + rnd() * 76, time };
  });
}
function formatPrice(n: number) {
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function formatOi(n: number) {
  if (Math.abs(n) >= 1000000) return `${(n / 1000000).toFixed(2)} M`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(2)} K`;
  return Math.round(n).toLocaleString('en-IN');
}
function formatCurrency(n: number) {
  return n.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function formatExpiry(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || 'Loading';
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}

type LiveOhlc = { open?: number; high?: number; low?: number };

function currentDayLabel() {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
  }).format(new Date());
}

function currentSessionBucket(timeframe: Timeframe) {
  if (timeframe === 'D' || timeframe === 'M') return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date()).map((part) => [part.type, part.value]),
  );
  const elapsedMinutes =
    Number(parts.hour) * 60 + Number(parts.minute) - (9 * 60 + 15);
  if (elapsedMinutes < 0 || elapsedMinutes >= 375) return null;
  const interval = INTERVAL_MINUTES[timeframe];
  const sessionStart = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    3,
    45,
  ) / 1000;
  return sessionStart + Math.floor(elapsedMinutes / interval) * interval * 60;
}

function intradayTimeLabel(timestamp: number) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(timestamp * 1000));
}

function fullCandleTimeLabel(candle: Candle) {
  if (!candle.timestamp) return candle.time;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(candle.timestamp * 1000)).map((part) => [part.type, part.value]),
  );
  return `${parts.weekday} ${parts.day} ${parts.month} '${parts.year} ${parts.hour}:${parts.minute}`;
}

function applyLivePrice(
  candles: Candle[],
  price: number,
  timeframe: Timeframe,
  ohlc?: LiveOhlc,
) {
  if (!(price > 0) || !candles.length) return candles;
  const next = candles.slice();
  if (timeframe === 'D') {
    const today = currentDayLabel();
    if (next[next.length - 1].time !== today) {
      const open = Number(ohlc?.open) > 0 ? Number(ohlc?.open) : price;
      next.push({
        timestamp: Date.now() / 1000,
        open,
        high: Number(ohlc?.high) > 0 ? Number(ohlc?.high) : Math.max(open, price),
        low: Number(ohlc?.low) > 0 ? Number(ohlc?.low) : Math.min(open, price),
        close: price,
        volume: 0,
        time: today,
      });
      return next;
    }
  }
  const bucket = currentSessionBucket(timeframe);
  const lastBeforeUpdate = next[next.length - 1];
  if (bucket && lastBeforeUpdate.timestamp && lastBeforeUpdate.timestamp < bucket) {
    next.push({
      timestamp: bucket,
      open: price,
      high: price,
      low: price,
      close: price,
      volume: 0,
      time: intradayTimeLabel(bucket),
    });
    return next;
  }
  if (timeframe !== 'D' && timeframe !== 'M' && !bucket) return candles;
  const last = next[next.length - 1];
  const dayHigh = timeframe === 'D' ? Number(ohlc?.high) || 0 : 0;
  const dayLow = timeframe === 'D' && Number(ohlc?.low) > 0 ? Number(ohlc?.low) : price;
  next[next.length - 1] = {
    ...last,
    high: Math.max(last.high, price, dayHigh),
    low: Math.min(last.low, price, dayLow),
    close: price,
  };
  return sanitizeLatestCandle(next, price);
}

function sanitizeLatestCandle(candles: Candle[], expectedPrice = 0) {
  if (candles.length < 3) return candles;
  const next = candles.slice();
  const last = { ...next[next.length - 1] };
  const previous = next[next.length - 2];
  const recentRanges = next
    .slice(Math.max(0, next.length - 21), -1)
    .map((candle) => Math.max(0, candle.high - candle.low))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  const medianRange = recentRanges.length
    ? recentRanges[Math.floor(recentRanges.length / 2)]
    : 0;
  const reference = Math.max(previous.close, expectedPrice, 1);
  // Dhan occasionally reports the contract's day high/low as the unfinished
  // minute candle's wick. Reject only an isolated extreme that is far beyond
  // both recent volatility and a generous percentage move from its body.
  const maximumWick = Math.max(medianRange * 8, reference * 0.12, 1);
  const malformed = [last.open, last.high, last.low, last.close].some(
    (value) => !Number.isFinite(value) || value <= 0 || Math.abs(value - previous.close) > maximumWick,
  );
  if (malformed) {
    const safeClose =
      expectedPrice > 0 && Math.abs(expectedPrice - previous.close) <= maximumWick
        ? expectedPrice
        : Math.abs(last.close - previous.close) <= maximumWick
          ? last.close
          : previous.close;
    last.open = previous.close;
    last.close = safeClose;
    last.high = Math.max(previous.close, safeClose);
    last.low = Math.min(previous.close, safeClose);
  }
  last.low = Math.min(last.low, last.open, last.close);
  last.high = Math.max(last.high, last.open, last.close);
  next[next.length - 1] = last;
  return next;
}

function mergeSnapshotCandles(
  fresh: Candle[],
  current: Candle[],
  timeframe: Timeframe,
  expectedPrice = 0,
) {
  fresh = sanitizeLatestCandle(fresh, expectedPrice);
  current = sanitizeLatestCandle(current, expectedPrice);
  const live = current.at(-1);
  if (!live) return fresh;
  const freshLast = fresh.at(-1);
  let sameCandle = false;
  if (timeframe === 'D') {
    sameCandle = Boolean(freshLast && live.time === freshLast.time);
    if (live.time === currentDayLabel() && !sameCandle) return [...fresh, live];
  } else if (live.timestamp && freshLast?.timestamp) {
    if (freshLast.timestamp < live.timestamp) return [...fresh, live];
    sameCandle = live.timestamp === freshLast.timestamp;
  } else {
    sameCandle = Boolean(freshLast && live.time === freshLast.time);
  }
  if (!freshLast || !sameCandle) return fresh;
  return sanitizeLatestCandle([
    ...fresh.slice(0, -1),
    {
      ...freshLast,
      high: Math.max(freshLast.high, live.high),
      low: Math.min(freshLast.low, live.low),
      close: live.close,
      volume: Math.max(freshLast.volume, live.volume),
    },
  ], expectedPrice);
}

function targetLabel(step: number) {
  return `T${Number.isInteger(step) ? step : step.toFixed(1)}`;
}

function makeOptionLevels(open: number): ChartLevel[] {
  return calculateOptionLevels(open).flatMap((level) => [
    { value: level.upper, label: level.label, color: '#d94b52' },
    { value: level.lower, label: level.label, color: '#2e9b67' },
  ]);
}

function makeWeeklyLevels(open: number): ChartLevel[] {
  const root = Math.sqrt(open);
  const resistancePrimary = Array.from(
    { length: 7 },
    (_, i) => (root + i + 1) ** 2,
  );
  const supportPrimary = Array.from(
    { length: 7 },
    (_, i) => (root - i - 1) ** 2,
  );
  const withMidpoints = (values: number[], color: string) =>
    values.flatMap((value, i) => [
      { value, label: targetLabel(i + 1), color },
      ...(i < values.length - 1
        ? [
            {
              value: (value + values[i + 1]) / 2,
              label: targetLabel(i + 1.5),
              color,
            },
          ]
        : []),
    ]);
  const resistance = withMidpoints(resistancePrimary, '#d94b52');
  const support = withMidpoints(supportPrimary, '#2e9b67');
  return [...resistance, ...support];
}

function makeIntradayLevels(open: number, step: number): ChartLevel[] {
  const side = (direction: 1 | -1, color: string) =>
    Array.from({ length: 17 }, (_, i) => {
      const target = 1 + i * 0.5;
      return {
        value: open + direction * target * step,
        label: targetLabel(target),
        color,
      };
    });
  return [
    ...side(1, '#d94b52'),
    ...side(-1, '#2e9b67').filter((level) => level.value > 0),
  ];
}

function makeStockIntradayLevels(open: number): ChartLevel[] {
  if (!(open > 0)) return [];
  const root = Math.sqrt(open);
  const support = (root - 1) ** 2;
  const resistance = (root + 1) ** 2;
  // Sixteen equal parts have seventeen boundary levels, including both ends.
  const step = (resistance - support) / 16;
  return Array.from({ length: 17 }, (_, index) => {
    const lowerHalf = index < 8;
    const upperHalf = index > 8;
    return {
      value: support + index * step,
      label: lowerHalf ? `S${8 - index}` : upperHalf ? `R${index - 8}` : 'MID',
      color: lowerHalf ? '#2e9b67' : upperHalf ? '#d94b52' : '#718096',
    };
  });
}

function makeStockWeeklyLevels(open: number): ChartLevel[] {
  if (!(open > 0)) return [];
  const root = Math.sqrt(open);
  return Array.from({ length: 3 }, (_, index) => {
    const step = index + 1;
    return [
      {
        value: (root + step) ** 2,
        label: `R${step}`,
        color: '#d94b52',
      },
      {
        // This is the spreadsheet formula (step - sqrt(open))².
        // Squaring makes it equivalent to (sqrt(open) - step)².
        value: (step - root) ** 2,
        label: `S${step}`,
        color: '#2e9b67',
      },
    ];
  }).flat();
}

function makeOtherIndexIntradayLevels(open: number): ChartLevel[] {
  if (!(open > 0)) return [];
  const root = Math.sqrt(open);
  const support = (root - 1) ** 2;
  const resistance = (root + 1) ** 2;
  // Eighteen equal parts have nineteen boundary levels, including both ends.
  const step = (resistance - support) / 18;
  return Array.from({ length: 19 }, (_, index) => {
    const lowerHalf = index < 9;
    const upperHalf = index > 9;
    return {
      value: support + index * step,
      label: lowerHalf ? `S${9 - index}` : upperHalf ? `R${index - 9}` : 'MID',
      color: lowerHalf ? '#2e9b67' : upperHalf ? '#d94b52' : '#718096',
    };
  });
}

function makeOtherIndexWeeklyLevels(open: number): ChartLevel[] {
  if (!(open > 0)) return [];
  const root = Math.sqrt(open);
  return Array.from({ length: 6 }, (_, index) => {
    const step = index + 1;
    return [
      {
        value: (root + step) ** 2,
        label: `R${step}`,
        color: '#d94b52',
      },
      {
        value: (step - root) ** 2,
        label: `S${step}`,
        color: '#2e9b67',
      },
    ];
  }).flat();
}

function ResizeHandle({ onDrag }: { onDrag: (deltaX: number) => void }) {
  const lastX = useRef<number | null>(null);
  return (
    <div
      className="pane-divider"
      onPointerDown={(e) => {
        lastX.current = e.clientX;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (lastX.current === null) return;
        const delta = e.clientX - lastX.current;
        lastX.current = e.clientX;
        onDrag(delta);
      }}
      onPointerUp={() => (lastX.current = null)}
      onPointerCancel={() => (lastX.current = null)}
    >
      <span />
    </div>
  );
}

type SyncedCrosshair = { timestamp: number; yRatio: number };

function Chart({
  title,
  subtitle,
  candles,
  levels,
  accent = false,
  timeframe,
  onTimeframeChange,
  levelMode,
  onLevelModeChange,
  showCandlePopover = false,
  previousClose = 0,
  onActivate,
  darkMode,
  oiProfile = [],
  linkedCrosshairTimestamp = null,
  onLinkedCrosshairChange,
  hoveredCrosshair = null,
  onCrosshairHover,
  drawings,
  onDrawingsChange,
  fullscreenActive = false,
  onFullscreenToggle,
}: {
  title: string;
  subtitle: string;
  candles: Candle[];
  levels: ChartLevel[];
  accent?: boolean;
  timeframe: Timeframe;
  onTimeframeChange: (value: Timeframe) => void;
  levelMode?: 'INTRADAY' | 'WEEKLY';
  onLevelModeChange?: (value: 'INTRADAY' | 'WEEKLY') => void;
  showCandlePopover?: boolean;
  previousClose?: number;
  onActivate: () => void;
  darkMode: boolean;
  oiProfile?: ChartOiLevel[];
  linkedCrosshairTimestamp?: number | null;
  onLinkedCrosshairChange?: (timestamp: number) => void;
  hoveredCrosshair?: SyncedCrosshair | null;
  onCrosshairHover?: (value: SyncedCrosshair | null) => void;
  drawings: ChartDrawing[];
  onDrawingsChange: Dispatch<SetStateAction<ChartDrawing[]>>;
  fullscreenActive?: boolean;
  onFullscreenToggle?: () => void;
}) {
  const priceClipId = `price-plot-${useId().replace(/:/g, '')}`;
  const [zoom, setZoom] = useState(1);
  const [yZoom, setYZoom] = useState(1);
  const [offset, setOffset] = useState(0);
  const [yOffset, setYOffset] = useState(0);
  const [cross, setCross] = useState<{ x: number; y: number } | null>(null);
  const [drawingTool, setDrawingTool] = useState<DrawingTool>('CURSOR');
  const [selectedDrawingId, setSelectedDrawingId] = useState<number | null>(null);
  const [draftDrawing, setDraftDrawing] = useState<ChartDrawing | null>(null);
  const drawingStart = useRef<DrawingPoint | null>(null);
  const drawingId = useRef(Date.now());
  const [toolboxPosition, setToolboxPosition] = useState({ x: 12, y: 48 });
  const toolboxDrag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const drag = useRef<
    | (
        | {
            mode: 'pan';
            x: number;
            y: number;
            offset: number;
            yOffset: number;
            range: number;
          }
        | { mode: 'x-scale'; x: number; offset: number; zoom: number }
        | { mode: 'y-scale'; y: number; yZoom: number }
      )
    | null
  >(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 760, height: 480 });
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const update = () =>
      setSize({
        width: Math.max(120, stage.clientWidth),
        height: Math.max(300, stage.clientHeight),
      });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [candles.length > 0]);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const containGesture = (event: Event) => event.preventDefault();
    stage.addEventListener('wheel', containGesture, { passive: false });
    stage.addEventListener('gesturestart', containGesture, { passive: false });
    stage.addEventListener('gesturechange', containGesture, { passive: false });
    stage.addEventListener('gestureend', containGesture, { passive: false });
    return () => {
      stage.removeEventListener('wheel', containGesture);
      stage.removeEventListener('gesturestart', containGesture);
      stage.removeEventListener('gesturechange', containGesture);
      stage.removeEventListener('gestureend', containGesture);
    };
  }, []);
  useEffect(() => {
    const removeSelected = (event: KeyboardEvent) => {
      if ((event.key !== 'Delete' && event.key !== 'Backspace') || selectedDrawingId === null) return;
      const target = event.target as HTMLElement;
      if (target.matches('input, textarea, [contenteditable="true"]')) return;
      event.preventDefault();
      onDrawingsChange((items) => items.filter((item) => item.id !== selectedDrawingId));
      setSelectedDrawingId(null);
      setDrawingTool('CURSOR');
    };
    window.addEventListener('keydown', removeSelected);
    return () => window.removeEventListener('keydown', removeSelected);
  }, [onDrawingsChange, selectedDrawingId]);
  if (!candles.length) return <section className={`chart-panel ${accent ? 'active-chart' : ''}`} onPointerDownCapture={onActivate}><div className="chart-head">{title}</div><div className="chart-empty">Waiting for Dhan candles</div></section>;
  const width = size.width,
    height = size.height,
    timeAxisTop = height - 42,
    plotH = timeAxisTop,
    padL = 10,
    padR = width < 430 ? 82 : 94;
  const visibleCountAt = (nextZoom: number) => Math.min(
    candles.length,
    Math.max(24, Math.floor(92 / nextZoom)),
  );
  const visibleCount = visibleCountAt(zoom);
  const minOffset = -Math.floor(visibleCount * 0.65);
  const maxOffset = Math.max(0, candles.length - visibleCount);
  const boundedOffset = Math.min(maxOffset, Math.max(minOffset, offset));
  const panCeil = Math.ceil(boundedOffset);
  const start = Math.max(0, candles.length - visibleCount - panCeil);
  const view = candles.slice(start, start + visibleCount + 1);
  // TradingView-style autoscale follows the candles that are actually visible.
  // Distant history and off-screen target lines must not push the current bars
  // outside the viewport after switching interval.
  const vals = view
    .flatMap((c) => [c.high, c.low])
    .filter(Number.isFinite);
  const dataMin = Math.min(...vals),
    dataMax = Math.max(...vals),
    dataRange = Math.max(dataMax - dataMin, 1);
  const midpoint = (dataMax + dataMin) / 2 + yOffset;
  const range = dataRange / yZoom;
  const min = midpoint - range / 2,
    max = midpoint + range / 2;
  const y = (v: number) => 18 + ((max - v) / range) * (plotH - 36);
  const plotW = width - padL - padR;
  const slot = plotW / visibleCount;
  const panShift = (boundedOffset - panCeil) * slot;
  const body = Math.max(2.5, Math.min(8, slot * 0.58));
  const latest = candles[candles.length - 1];
  const up = latest.close >= latest.open;
  const priceChange = previousClose > 0 ? latest.close - previousClose : 0;
  const priceChangePercent = previousClose > 0
    ? (priceChange / previousClose) * 100
    : 0;
  const yTickCount = Math.max(6, Math.floor(plotH / 56));
  const xTickCount = Math.max(4, Math.floor(plotW / 105));
  const maxChartOi = Math.max(1, ...oiProfile.flatMap((row) => [row.callOi, row.putOi]));
  const visibleLevelYs = levels
    .map((level) => y(level.value))
    .filter((levelY) => levelY >= 0 && levelY <= plotH);
  const crossIndex = cross
    ? Math.round((cross.x - padL - slot / 2 - panShift) / slot)
    : -1;
  const crossCandle =
    crossIndex >= 0 && crossIndex < view.length ? view[crossIndex] : null;
  const activeCrosshairTimestamp = hoveredCrosshair?.timestamp ?? linkedCrosshairTimestamp;
  const linkedCrossIndex = activeCrosshairTimestamp
    ? view.reduce((best, candle, index) => {
        if (!candle.timestamp) return best;
        if (best < 0 || !view[best]?.timestamp) return index;
        return Math.abs(candle.timestamp - activeCrosshairTimestamp) <
          Math.abs(view[best].timestamp! - activeCrosshairTimestamp)
          ? index
          : best;
      }, -1)
    : -1;
  const linkedCrossCandle = linkedCrossIndex >= 0 ? view[linkedCrossIndex] : null;
  const displayedCrossCandle = crossCandle || linkedCrossCandle;
  const headerCandle = displayedCrossCandle || latest;
  const displayedCrossIndex = crossCandle ? crossIndex : linkedCrossIndex;
  const crossX = displayedCrossCandle
    ? padL + displayedCrossIndex * slot + slot / 2 + panShift
    : (cross?.x ?? 0);
  const displayedCrossY = cross
    ? cross.y
    : hoveredCrosshair
      ? hoveredCrosshair.yRatio * plotH
    : displayedCrossCandle
      ? y(displayedCrossCandle.close)
      : 0;
  const crossTimeLabel = displayedCrossCandle
    ? fullCandleTimeLabel(displayedCrossCandle)
    : '';
  const crossTimeWidth = Math.max(64, Math.min(154, plotW - 4));
  const crossTimeLeft = Math.max(
    2,
    Math.min(plotW - crossTimeWidth - 2, crossX - crossTimeWidth / 2),
  );
  const crossPrice = cross || hoveredCrosshair
    ? max - ((displayedCrossY - 18) / Math.max(plotH - 36, 1)) * range
    : displayedCrossCandle?.close || 0;
  const pointFromPointer = (clientX: number, clientY: number, rect: DOMRect): DrawingPoint | null => {
    const px = ((clientX - rect.left) / rect.width) * width;
    const py = ((clientY - rect.top) / rect.height) * height;
    const index = Math.round((px - padL - slot / 2 - panShift) / slot);
    const candle = index >= 0 && index < view.length ? view[index] : null;
    if (!candle?.timestamp || px >= plotW || py >= plotH) return null;
    return {
      timestamp: candle.timestamp,
      price: max - ((py - 18) / Math.max(plotH - 36, 1)) * range,
    };
  };
  const drawingX = (timestamp: number) => {
    const index = view.reduce((best, candle, candleIndex) => {
      if (!candle.timestamp) return best;
      if (best < 0 || !view[best]?.timestamp) return candleIndex;
      return Math.abs(candle.timestamp - timestamp) < Math.abs(view[best].timestamp! - timestamp)
        ? candleIndex
        : best;
    }, -1);
    return index < 0 ? -100 : padL + index * slot + slot / 2 + panShift;
  };
  const applyHorizontalZoom = (nextZoom: number) => {
    const boundedZoom = Math.min(5, Math.max(0.65, nextZoom));
    const nextVisibleCount = visibleCountAt(boundedZoom);
    const nextMinOffset = -Math.floor(nextVisibleCount * 0.65);
    const nextMaxOffset = Math.max(0, candles.length - nextVisibleCount);
    setZoom(boundedZoom);
    setOffset((value) =>
      Math.min(nextMaxOffset, Math.max(nextMinOffset, value)),
    );
    // Horizontal zoom returns to price autoscale, matching TradingView's
    // predictable "bars stay visible" behaviour.
    setYZoom(1);
    setYOffset(0);
  };
  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const pointerX = ((e.clientX - rect.left) / rect.width) * width;
    if (pointerX >= plotW) {
      setYOffset((value) => value + (e.deltaY / Math.max(plotH, 1)) * range);
      return;
    }
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY))
      setOffset((v) =>
        Math.min(maxOffset, Math.max(minOffset, v + e.deltaX / 12)),
      );
    else applyHorizontalZoom(zoom * (e.deltaY > 0 ? 0.9 : 1.12));
  };
  return (
    <section className={`chart-panel ${accent ? 'active-chart' : ''}`} onPointerDownCapture={onActivate}>
      <div className="chart-head">
        <div>
          <div className="chart-title">
            <span className="symbol-mark">{title.slice(0, 1)}</span>
            {title}
          </div>
          {showCandlePopover ? (
            <div className="chart-sub option-premium-summary">
              <strong>{formatPrice(latest.close)}</strong>
              {previousClose > 0 && (
                <span className={priceChange >= 0 ? 'positive' : 'negative'}>
                  {priceChange >= 0 ? '+' : ''}{formatPrice(priceChange)} ({priceChange >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}%) {priceChange >= 0 ? '↗' : '↘'}
                </span>
              )}
              <small>{subtitle}</small>
            </div>
          ) : (
            <div className="chart-sub">
              {subtitle}{' '}
              <span className={headerCandle.close >= headerCandle.open ? 'positive' : 'negative'}>
                O {formatPrice(headerCandle.open)} H {formatPrice(headerCandle.high)} L{' '}
                {formatPrice(headerCandle.low)} C {formatPrice(headerCandle.close)}
              </span>
              {previousClose > 0 && (
                <span className={priceChange >= 0 ? 'positive' : 'negative'}>
                  {priceChange >= 0 ? '+' : ''}{formatPrice(priceChange)} ({priceChange >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}%)
                </span>
              )}
            </div>
          )}
        </div>
        <div className="chart-tools">
          <label className="chart-select">
            <span>TF</span>
            <select value={timeframe} onChange={(event) => onTimeframeChange(event.target.value as Timeframe)}>
              {TIMEFRAMES.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          {levelMode && onLevelModeChange && <div className="level-mode-tabs" role="tablist" aria-label="Level calculation period">
            {(['INTRADAY', 'WEEKLY'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={levelMode === mode}
                className={levelMode === mode ? 'active' : ''}
                onClick={() => onLevelModeChange(mode)}
              >
                {mode === 'INTRADAY' ? 'Intraday' : 'Weekly'}
              </button>
            ))}
          </div>}
          {onFullscreenToggle && <button
            type="button"
            className="chart-fullscreen-toggle"
            aria-label={fullscreenActive ? 'Exit chart fullscreen' : `Open ${title} fullscreen`}
            title={fullscreenActive ? 'Exit fullscreen' : 'Open this chart fullscreen'}
            onClick={onFullscreenToggle}
          >
            {fullscreenActive ? <Minimize2 /> : <Maximize2 />}
          </button>}
          <button
            aria-label="Zoom out"
            onClick={() => applyHorizontalZoom(zoom / 1.25)}
          >
            <ZoomOut />
          </button>
          <button
            aria-label="Zoom in"
            onClick={() => applyHorizontalZoom(zoom * 1.25)}
          >
            <ZoomIn />
          </button>
          <button
            aria-label="Reset chart"
            onClick={() => {
              setZoom(1);
              setYZoom(1);
              setOffset(0);
              setYOffset(0);
            }}
          >
            <RefreshCw />
          </button>
        </div>
      </div>
      <div
        ref={stageRef}
        className="chart-stage"
      >
        <div
          className="drawing-toolbox"
          style={{ left: toolboxPosition.x, top: toolboxPosition.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            className="drawing-toolbox-handle"
            aria-label="Move drawing tools"
            title="Drag toolbox"
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              toolboxDrag.current = {
                x: event.clientX,
                y: event.clientY,
                left: toolboxPosition.x,
                top: toolboxPosition.y,
              };
            }}
            onPointerMove={(event) => {
              if (!toolboxDrag.current || !stageRef.current) return;
              const nextX = toolboxDrag.current.left + event.clientX - toolboxDrag.current.x;
              const nextY = toolboxDrag.current.top + event.clientY - toolboxDrag.current.y;
              setToolboxPosition({
                x: Math.max(4, Math.min(stageRef.current.clientWidth - 42, nextX)),
                y: Math.max(4, Math.min(stageRef.current.clientHeight - 188, nextY)),
              });
            }}
            onPointerUp={() => (toolboxDrag.current = null)}
          >
            <span /><span /><span />
          </button>
          {([
            ['CURSOR', MousePointer2, 'Cursor / pan'],
            ['HORIZONTAL', Minus, 'Horizontal line'],
            ['TEXT', Type, 'Text'],
            ['SCALE', Ruler, 'Measure scale'],
            ['TREND', TrendingUp, 'Trendline'],
          ] as const).map(([tool, Icon, label]) => (
            <button
              key={tool}
              type="button"
              className={drawingTool === tool ? 'active' : ''}
              aria-label={label}
              title={label}
              onClick={() => setDrawingTool(tool)}
            >
              <Icon />
            </button>
          ))}
          <button
            type="button"
            aria-label={selectedDrawingId === null ? 'Clear drawings' : 'Delete selected drawing'}
            title={selectedDrawingId === null ? 'Clear drawings' : 'Delete selected drawing'}
            disabled={!drawings.length}
            onClick={() => {
              onDrawingsChange((items) =>
                selectedDrawingId === null
                  ? []
                  : items.filter((item) => item.id !== selectedDrawingId),
              );
              setSelectedDrawingId(null);
              setDrawingTool('CURSOR');
              setDraftDrawing(null);
            }}
          >
            <X />
          </button>
        </div>
        {showCandlePopover && displayedCrossCandle && (
          <div className="candle-hover-popover" role="tooltip">
            <strong>{fullCandleTimeLabel(displayedCrossCandle)}</strong>
            <span>Open <b>{formatPrice(displayedCrossCandle.open)}</b></span>
            <span>High <b className="positive">{formatPrice(displayedCrossCandle.high)}</b></span>
            <span>Low <b className="negative">{formatPrice(displayedCrossCandle.low)}</b></span>
            <span>Close <b>{formatPrice(displayedCrossCandle.close)}</b></span>
            <span>Prev close <b>{previousClose > 0 ? formatPrice(previousClose) : '—'}</b></span>
          </div>
        )}
        <svg
          style={{ backgroundColor: darkMode ? '#111722' : '#ffffff' }}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          onWheel={onWheel}
          onPointerDown={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * width,
              py = ((e.clientY - rect.top) / rect.height) * height;
            if (drawingTool !== 'CURSOR') {
              const point = pointFromPointer(e.clientX, e.clientY, rect);
              if (!point) return;
              if (drawingTool === 'HORIZONTAL') {
                onDrawingsChange((items) => [
                  ...items,
                  { id: drawingId.current++, type: 'HORIZONTAL', price: point.price },
                ]);
                setDrawingTool('CURSOR');
                return;
              }
              if (drawingTool === 'TEXT') {
                const text = window.prompt('Enter chart text');
                if (text?.trim())
                  onDrawingsChange((items) => [
                    ...items,
                    { id: drawingId.current++, type: 'TEXT', point, text: text.trim() },
                  ]);
                setDrawingTool('CURSOR');
                return;
              }
              drawingStart.current = point;
              setDraftDrawing({
                id: -1,
                type: drawingTool,
                start: point,
                end: point,
              });
              e.currentTarget.setPointerCapture(e.pointerId);
              return;
            }
            drag.current =
              x > plotW && py < timeAxisTop
                ? { mode: 'y-scale', y: e.clientY, yZoom }
                : py > timeAxisTop
                  ? { mode: 'x-scale', x: e.clientX, offset, zoom }
                  : {
                      mode: 'pan',
                      x: e.clientX,
                      y: e.clientY,
                      offset,
                      yOffset,
                      range,
                    };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * width,
              py = ((e.clientY - rect.top) / rect.height) * height;
            e.currentTarget.style.cursor =
              x > plotW && py < timeAxisTop
                ? 'ns-resize'
                : py > timeAxisTop
                  ? 'ew-resize'
                  : drag.current?.mode === 'pan'
                    ? 'grabbing'
                    : 'crosshair';
            setCross({ x, y: py });
            const hoverIndex = Math.round(
              (x - padL - slot / 2 - panShift) / slot,
            );
            const hoverCandle =
              hoverIndex >= 0 && hoverIndex < view.length
                ? view[hoverIndex]
                : null;
            if (x < plotW && py >= 0 && py < plotH && hoverCandle?.timestamp)
              onCrosshairHover?.({
                timestamp: hoverCandle.timestamp,
                yRatio: py / Math.max(plotH, 1),
              });
            else onCrosshairHover?.(null);
            if (drawingStart.current && (drawingTool === 'SCALE' || drawingTool === 'TREND')) {
              const point = pointFromPointer(e.clientX, e.clientY, rect);
              if (point)
                setDraftDrawing({
                  id: -1,
                  type: drawingTool,
                  start: drawingStart.current,
                  end: point,
                });
              return;
            }
            if (drag.current?.mode === 'pan') {
              setOffset(
                Math.min(
                  maxOffset,
                  Math.max(
                    minOffset,
                    drag.current.offset +
                      ((e.clientX - drag.current.x) * visibleCount) / plotW,
                  ),
                ),
              );
              setYOffset(
                drag.current.yOffset +
                  ((e.clientY - drag.current.y) * drag.current.range) /
                    Math.max(plotH - 36, 1),
              );
            }
            if (drag.current?.mode === 'x-scale')
              applyHorizontalZoom(
                drag.current.zoom *
                  Math.exp((drag.current.x - e.clientX) / 240),
              );
            if (drag.current?.mode === 'y-scale')
              setYZoom(
                Math.min(
                  40,
                  Math.max(
                    0.25,
                    drag.current.yZoom *
                      Math.exp((drag.current.y - e.clientY) / 180),
                  ),
                ),
              );
          }}
          onPointerUp={(e) => {
            if (drawingStart.current && (drawingTool === 'SCALE' || drawingTool === 'TREND')) {
              const rect = e.currentTarget.getBoundingClientRect();
              const end = pointFromPointer(e.clientX, e.clientY, rect);
              if (end) onDrawingsChange((items) => [
                ...items,
                {
                  id: drawingId.current++,
                  type: drawingTool,
                  start: drawingStart.current!,
                  end,
                },
              ]);
              setDraftDrawing(null);
              drawingStart.current = null;
              setDrawingTool('CURSOR');
              return;
            }
            const activeDrag = drag.current;
            if (
              activeDrag?.mode === 'pan' &&
              Math.abs(e.clientX - activeDrag.x) < 5 &&
              Math.abs(e.clientY - activeDrag.y) < 5
            ) {
              const rect = e.currentTarget.getBoundingClientRect();
              const clickX = ((e.clientX - rect.left) / rect.width) * width;
              const index = Math.round(
                (clickX - padL - slot / 2 - panShift) / slot,
              );
              const candle = index >= 0 && index < view.length ? view[index] : null;
              if (candle?.timestamp) onLinkedCrosshairChange?.(candle.timestamp);
            }
            drag.current = null;
          }}
          onPointerLeave={(e) => {
            drag.current = null;
            if (drawingStart.current) {
              drawingStart.current = null;
              setDraftDrawing(null);
            }
            setCross(null);
            onCrosshairHover?.(null);
            e.currentTarget.style.cursor = 'crosshair';
          }}
        >
          <defs>
            <clipPath id={priceClipId}>
              <rect x="0" y="0" width={plotW + padL} height={plotH} />
            </clipPath>
          </defs>
          {Array.from({ length: 10 }, (_, i) => (
            <line
              key={`v-${i}`}
              x1={padL + (i * plotW) / 9}
              x2={padL + (i * plotW) / 9}
              y1={0}
              y2={plotH}
              stroke={darkMode ? '#273142' : '#eceff1'}
              strokeWidth="1"
            />
          ))}
          {Array.from({ length: 8 }, (_, i) => (
            <line
              key={`h-${i}`}
              x1={0}
              x2={plotW + padL}
              y1={(i * plotH) / 7}
              y2={(i * plotH) / 7}
              stroke={darkMode ? '#273142' : '#eceff1'}
              strokeWidth="1"
            />
          ))}
          {oiProfile.length > 0 && (() => {
            const axisX = plotW + padL - 4;
            const maxBarWidth = Math.max(34, Math.min(170, plotW * 0.22));
            return <g className="chart-oi-profile">
              <g className="chart-oi-caption">
                <rect x="12" y="10" width="106" height="24" rx="4" />
                <text x="22" y="27">OI PROFILE · {oiProfile.length}</text>
              </g>
              {oiProfile.map((row) => {
                const rowY = y(row.strike);
                if (rowY < 10 || rowY > plotH - 10) return null;
                const callWidth = Math.max(2, (row.callOi / maxChartOi) * maxBarWidth);
                const putWidth = Math.max(2, (row.putOi / maxChartOi) * maxBarWidth);
                return <g key={`oi-${row.strike}`}>
                  <title>{`${row.strike.toLocaleString('en-IN')} · CE OI ${formatOi(row.callOi)} · PE OI ${formatOi(row.putOi)}`}</title>
                  <rect className="chart-oi-call" x={axisX - callWidth} y={rowY - 9} width={callWidth} height="8" rx="1" />
                  <rect className="chart-oi-put" x={axisX - putWidth} y={rowY + 1} width={putWidth} height="8" rx="1" />
                </g>;
              })}
            </g>;
          })()}
          {Array.from({ length: yTickCount }, (_, i) => {
            const t = i / (yTickCount - 1);
            const tickY = 22 + t * (plotH - 36);
            if (visibleLevelYs.some((levelY) => Math.abs(levelY - tickY) < 18)) return null;
            return (
              <text
                key={i}
                x={width - padR + 8}
                y={tickY}
                className="axis-label"
              >
                {formatPrice(max - t * range)}
              </text>
            );
          })}
          {levels.map((level) => {
            const levelY = y(level.value);
            const badgeY = Math.max(11, Math.min(plotH - 11, levelY));
            const isOpenLevel = level.label === 'OPEN';
            return levelY >= 0 && levelY <= plotH ? (
              <g key={`${level.color}-${level.label}-${level.value}`}>
                <line
                  x1={0}
                  y1={levelY}
                  x2={width - padR}
                  y2={levelY}
                  stroke={level.color}
                  strokeWidth={isOpenLevel ? '2' : '1.5'}
                />
                <text
                  x={plotW - 8}
                  y={Math.max(13, Math.min(plotH - 4, badgeY - 5))}
                  textAnchor="end"
                  className="target-label"
                  fill={level.color}
                >
                  {level.label}
                </text>
                <rect
                  x={width - padR - 1}
                  y={badgeY - 10}
                  width="80"
                  height="20"
                  rx="3"
                  fill={level.color}
                />
                <text
                  x={width - 20}
                  y={badgeY + 4}
                  textAnchor="end"
                  className="level-label"
                >
                  {formatPrice(level.value)}
                </text>
              </g>
            ) : null;
          })}
          {view.map((c, i) => {
            const cx = padL + i * slot + slot / 2 + panShift;
            const green = c.close >= c.open;
            const color = green ? '#089981' : '#f23645';
            return (
              <g key={start + i}>
                <g clipPath={`url(#${priceClipId})`}>
                  <line
                    x1={cx}
                    x2={cx}
                    y1={y(c.high)}
                    y2={y(c.low)}
                    stroke={color}
                    strokeWidth="1.2"
                  />
                  <rect
                    x={cx - body / 2}
                    y={Math.min(y(c.open), y(c.close))}
                    width={body}
                    height={Math.max(1.5, Math.abs(y(c.open) - y(c.close)))}
                    fill={color}
                    stroke={color}
                    strokeWidth="1.2"
                  />
                </g>
              </g>
            );
          })}
          <g className="user-drawings" clipPath={`url(#${priceClipId})`}>
            {[...drawings, ...(draftDrawing ? [draftDrawing] : [])].map((drawing) => {
              if (drawing.type === 'HORIZONTAL') {
                const lineY = y(drawing.price);
                return <g key={drawing.id} className={selectedDrawingId === drawing.id ? 'selected-drawing' : ''} onPointerDown={(event) => { event.stopPropagation(); if (drawing.id >= 0) setSelectedDrawingId(drawing.id); }}>
                  <line x1={0} x2={plotW} y1={lineY} y2={lineY} />
                  <text x={12} y={lineY - 6}>{formatPrice(drawing.price)}</text>
                </g>;
              }
              if (drawing.type === 'TEXT') {
                return <text
                  key={drawing.id}
                  className={`drawing-text ${selectedDrawingId === drawing.id ? 'selected-drawing' : ''}`}
                  onPointerDown={(event) => { event.stopPropagation(); if (drawing.id >= 0) setSelectedDrawingId(drawing.id); }}
                  x={drawingX(drawing.point.timestamp)}
                  y={y(drawing.point.price)}
                >{drawing.text}</text>;
              }
              const x1 = drawingX(drawing.start.timestamp);
              const x2 = drawingX(drawing.end.timestamp);
              const y1 = y(drawing.start.price);
              const y2 = y(drawing.end.price);
              if (drawing.type === 'TREND')
                return <line key={drawing.id} className={selectedDrawingId === drawing.id ? 'selected-drawing' : ''} onPointerDown={(event) => { event.stopPropagation(); if (drawing.id >= 0) setSelectedDrawingId(drawing.id); }} x1={x1} y1={y1} x2={x2} y2={y2} />;
              const delta = drawing.end.price - drawing.start.price;
              const percent = drawing.start.price
                ? (delta / drawing.start.price) * 100
                : 0;
              const labelX = Math.max(48, Math.min(plotW - 48, (x1 + x2) / 2));
              const labelY = Math.max(18, Math.min(plotH - 12, (y1 + y2) / 2));
              return <g key={drawing.id} className={`scale-drawing ${selectedDrawingId === drawing.id ? 'selected-drawing' : ''}`} onPointerDown={(event) => { event.stopPropagation(); if (drawing.id >= 0) setSelectedDrawingId(drawing.id); }}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} />
                <line x1={x1} y1={y1} x2={x2} y2={y1} />
                <line x1={x2} y1={y1} x2={x2} y2={y2} />
                <rect x={labelX - 43} y={labelY - 12} width="86" height="22" rx="4" />
                <text x={labelX} y={labelY + 3} textAnchor="middle">
                  {delta >= 0 ? '+' : ''}{formatPrice(delta)} · {percent.toFixed(2)}%
                </text>
              </g>;
            })}
          </g>
          {(() => {
            const priceY = Math.max(11, Math.min(plotH - 11, y(latest.close)));
            const priceColor = up ? '#089981' : '#f23645';
            return <g className="live-price-marker">
              <line
                x1={0}
                x2={plotW}
                y1={priceY}
                y2={priceY}
                stroke={priceColor}
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <rect
                x={width - padR - 1}
                y={priceY - 10}
                width="80"
                height="20"
                rx="3"
                fill={priceColor}
              />
              <text
                x={width - 20}
                y={priceY + 4}
                textAnchor="end"
                className="level-label"
              >
                {formatPrice(latest.close)}
              </text>
            </g>;
          })()}
          {displayedCrossCandle && crossX < plotW && displayedCrossY >= 0 && displayedCrossY < plotH && (
            <g className="crosshair">
              <line x1={crossX} x2={crossX} y1={0} y2={timeAxisTop} />
              <line x1={0} x2={plotW} y1={displayedCrossY} y2={displayedCrossY} />
              <rect
                className="crosshair-label-bg"
                x={width - padR - 1}
                y={Math.max(1, Math.min(plotH - 23, displayedCrossY - 11))}
                width="80"
                height="22"
                rx="3"
              />
              <text
                className="crosshair-label"
                x={width - 20}
                y={Math.max(16, Math.min(plotH - 8, displayedCrossY + 4))}
                textAnchor="end"
              >
                {formatPrice(crossPrice)}
              </text>
              {displayedCrossCandle && (
                <>
                  <rect
                    className="crosshair-label-bg"
                    x={crossTimeLeft}
                    y={timeAxisTop + 5}
                    width={crossTimeWidth}
                    height="27"
                    rx="3"
                  />
                  <text
                    className="crosshair-label"
                    x={crossTimeLeft + crossTimeWidth / 2}
                    y={timeAxisTop + 23}
                    textAnchor="middle"
                  >
                    {crossTimeLabel}
                  </text>
                </>
              )}
            </g>
          )}
          <line
            x1={0}
            x2={plotW + padL}
            y1={timeAxisTop}
            y2={timeAxisTop}
            stroke={darkMode ? '#344052' : '#e2e5e8'}
            strokeWidth="1"
          />
          {Array.from({ length: xTickCount }, (_, i) => {
            const t = i / (xTickCount - 1);
            const ix = Math.floor(t * visibleCount - panShift / slot);
            const label = ix >= 0 && ix < view.length ? view[ix].time : '';
            return (
              <text
                key={i}
                x={padL + t * plotW}
                y={height - 15}
                textAnchor={
                  i === 0 ? 'start' : i === xTickCount - 1 ? 'end' : 'middle'
                }
                className="axis-label"
              >
                {label}
              </text>
            );
          })}
        </svg>
      </div>
      <div className="chart-foot">
        <span>
          <Activity /> Levels active · Formula preview
          {oiProfile.length > 0 && <small className="chart-oi-legend"><i /> CE OI <i /> PE OI</small>}
        </span>
        <span>Scroll to zoom · Drag to pan</span>
      </div>
    </section>
  );
}

function PositionsView({
  mode,
  onModeChange,
  positions,
  engineStatus,
  snapshots,
}: {
  mode: PaperMode;
  onModeChange: (mode: PaperMode) => void;
  positions: PaperPosition[];
  engineStatus: string;
  snapshots: PaperEngineSnapshot[];
}) {
  const startingCapital = 100000;
  const visiblePositions = positions.filter((position) => position.mode === mode);
  const realizedPnl = visiblePositions
    .filter((position) => position.status === 'CLOSED')
    .reduce((total, position) => total + position.pnl, 0);
  const openPnl = visiblePositions
    .filter((position) => position.status === 'OPEN')
    .reduce((total, position) => total + position.pnl, 0);
  const usedCapital = visiblePositions
    .filter((position) => position.status === 'OPEN')
    .reduce(
      (total, position) => total + position.entryPrice * position.quantity,
      0,
    );
  const availableCapital = startingCapital + realizedPnl - usedCapital;

  return (
    <section className="positions-view">
      <div className="positions-hero">
        <div>
          <span className="eyebrow">PAPER TESTING</span>
          <h1>Positions</h1>
          <p>Review simulated option trades and capital performance.</p>
        </div>
        <div className="paper-mode" role="tablist" aria-label="Paper testing mode">
          <button
            role="tab"
            aria-selected={mode === 'FORWARD'}
            className={mode === 'FORWARD' ? 'active' : ''}
            onClick={() => onModeChange('FORWARD')}
          >
            Forward test
          </button>
          <button
            role="tab"
            aria-selected={mode === 'BACKTEST'}
            className={mode === 'BACKTEST' ? 'active' : ''}
            onClick={() => onModeChange('BACKTEST')}
          >
            Backtest
          </button>
        </div>
      </div>

      <div className="strategy-board">
        <header>
          <div><span className="eyebrow">TWO-CONDITION ENTRY</span><h2>Live trade scanner</h2><p>Maximum one trade per index per trading day.</p></div>
          <span className={`engine-state ${snapshots.length ? 'active' : ''}`}><i /> {engineStatus}</span>
        </header>
        <div className="strategy-cards">
          {(['NIFTY', 'BANKNIFTY', 'SENSEX'] as AssetKey[]).map((assetKey) => {
            const snapshot = snapshots.find((item) => item.asset === assetKey);
            const assetPositions = visiblePositions.filter((position) => position.asset === assetKey && position.status === 'OPEN');
            return <article className="strategy-card" key={assetKey}>
              <div className="strategy-title">
                <div><strong>{assetKey === 'BANKNIFTY' ? 'BANK NIFTY' : assetKey}</strong><span>Opening ATM {snapshot ? snapshot.openingAtm.toLocaleString('en-IN') : '—'}</span></div>
                <b className={assetPositions.length ? 'formed' : snapshot?.signals.some((signal) => signal.inBand || signal.oiMatched) ? 'forming' : 'waiting'}>
                  {assetPositions.length ? 'TRADE LIVE' : snapshot?.signals.some((signal) => signal.inBand || signal.oiMatched) ? 'FORMING' : 'WAITING'}
                </b>
              </div>
              <div className="oi-balance">
                <span><small>CALL OI · 11 strikes</small><strong>{snapshot ? formatOi(snapshot.callOi) : '—'}</strong></span>
                <em>{snapshot ? (snapshot.putOi > snapshot.callOi ? 'PUT SUPPORT' : snapshot.callOi > snapshot.putOi ? 'CALL RESISTANCE' : 'BALANCED') : 'LOADING'}</em>
                <span><small>PUT OI · 11 strikes</small><strong>{snapshot ? formatOi(snapshot.putOi) : '—'}</strong></span>
              </div>
              <div className="signal-table">
                {(snapshot?.signals || []).map((signal) => {
                  const position = assetPositions.find((item) => item.side === signal.side);
                  const matched = signal.inBand && signal.oiMatched;
                  return <div className={`signal-row ${position ? 'live' : matched ? 'ready' : ''}`} key={signal.side}>
                    <strong>{signal.side}</strong>
                    <span><i className={signal.inBand ? 'met' : ''}>{signal.inBand ? '✓' : '○'}</i><small>Premium in band</small><b>₹{formatPrice(signal.contract.ltp)} <em>₹{formatPrice(signal.entryLevel)}–{formatPrice(signal.bandHigh)}</em></b></span>
                    <span><i className={signal.oiMatched ? 'met' : ''}>{signal.oiMatched ? '✓' : '○'}</i><small>OI direction</small><b>{signal.side === 'CE' ? 'Put OI > Call OI' : 'Call OI > Put OI'}</b></span>
                    <span><small>Stop / Target</small><b>₹{formatPrice(signal.stop)} / ₹{formatPrice(signal.target)}</b></span>
                    <span className="signal-action">{position ? `BOUGHT · P&L ${formatCurrency(position.pnl)}` : matched ? 'ENTRY READY' : 'MONITORING'}</span>
                  </div>;
                })}
                {!snapshot && <div className="signal-loading">Connecting to live option chain…</div>}
              </div>
            </article>;
          })}
        </div>
      </div>

      <div className="capital-grid">
        <article>
          <span>Starting capital</span>
          <strong>{formatCurrency(startingCapital)}</strong>
          <small>Demo account</small>
        </article>
        <article>
          <span>Available capital</span>
          <strong>{formatCurrency(availableCapital)}</strong>
          <small>{usedCapital ? `${formatCurrency(usedCapital)} deployed` : 'No capital deployed'}</small>
        </article>
        <article>
          <span>Realized P&amp;L</span>
          <strong className={realizedPnl >= 0 ? 'positive' : 'negative'}>{formatCurrency(realizedPnl)}</strong>
          <small>{visiblePositions.filter((position) => position.status === 'CLOSED').length} closed trades</small>
        </article>
        <article>
          <span>Open P&amp;L</span>
          <strong className={openPnl >= 0 ? 'positive' : 'negative'}>{formatCurrency(openPnl)}</strong>
          <small>{visiblePositions.filter((position) => position.status === 'OPEN').length} open positions</small>
        </article>
      </div>

      <div className="positions-ledger">
        <header>
          <div>
            <h2>{mode === 'FORWARD' ? 'Forward-test positions' : 'Backtest positions'}</h2>
            <span>Strategy execution ledger</span>
          </div>
          <span className={`engine-state ${snapshots.length ? 'active' : ''}`}><i /> {engineStatus}</span>
        </header>
        <div className="position-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Open time</th>
                <th>Close time</th>
                <th>Option contract</th>
                <th>Type</th>
                <th>Quantity</th>
                <th>Lot size</th>
                <th>Entry</th>
                <th>Stop</th>
                <th>Target</th>
                <th>Exit</th>
                <th>P&amp;L</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {visiblePositions.map((position) => (
                <tr key={position.id}>
                  <td><span className={`position-status ${position.status.toLowerCase()}`}>{position.status}</span></td>
                  <td>{position.openTime}</td>
                  <td>{position.closeTime || '—'}</td>
                  <td><strong>{position.contract}</strong></td>
                  <td>{position.side}</td>
                  <td>{position.quantity.toLocaleString('en-IN')}</td>
                  <td>{position.lotSize.toLocaleString('en-IN')}</td>
                  <td>{formatPrice(position.entryPrice)}</td>
                  <td className="negative">{formatPrice(position.stopPrice)}</td>
                  <td className="positive">{formatPrice(position.targetPrice)}</td>
                  <td>{position.exitPrice === null ? '—' : formatPrice(position.exitPrice)}</td>
                  <td className={position.pnl >= 0 ? 'positive' : 'negative'}>{formatCurrency(position.pnl)}</td>
                  <td>{position.closeReason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!visiblePositions.length && (
            <div className="positions-empty">
              <span><BriefcaseBusiness /></span>
              <strong>No paper positions yet</strong>
              <p>The engine is monitoring the fixed opening-ATM CE and PE contracts. A trade appears only when its premium band and 11-strike OI direction both match.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default function Home({ canViewPositions }: { canViewPositions: boolean }) {
  const [darkMode, setDarkMode] = useState(false);
  useEffect(() => {
    const saved = window.localStorage.getItem('manju-theme');
    setDarkMode(saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches);
  }, []);
  const toggleTheme = () => setDarkMode((current) => {
    const next = !current;
    window.localStorage.setItem('manju-theme', next ? 'dark' : 'light');
    return next;
  });
  const [tokenInfo, setTokenInfo] = useState<{ready?: boolean; canGenerate?: boolean; expiresAt?: string | null; error?: string; automatic?: boolean; configured?: boolean}>({});
  const [generatingToken, setGeneratingToken] = useState(false);
  useEffect(() => {
    const load = () => fetch('/manju/api/dhan/token').then(r => r.json()).then(setTokenInfo).catch(() => {});
    load(); const timer = setInterval(load, 30000); return () => clearInterval(timer);
  }, []);
  const generateToken = async () => {
    if (generatingToken || !tokenInfo.canGenerate) return;
    setGeneratingToken(true);
    try { const r = await fetch('/manju/api/dhan/token', { method: 'POST' }); setTokenInfo(await r.json()); }
    catch { setTokenInfo({error: 'Could not reach token service'}); }
    finally { setGeneratingToken(false); }
  };
  const [appView, setAppView] = useState<'MARKET' | 'POSITIONS'>('MARKET');
  const [paperMode, setPaperMode] = useState<PaperMode>('FORWARD');
  const [paperPositions, setPaperPositions] = useState<PaperPosition[]>([]);
  const [paperSnapshots, setPaperSnapshots] = useState<PaperEngineSnapshot[]>([]);
  const [paperEngineStatus, setPaperEngineStatus] = useState('Connecting to live data');
  const [asset, setAsset] = useState<AssetKey>('NIFTY');
  const [side, setSide] = useState<Side>('CE');
  const [selectedStrike, setSelectedStrike] = useState(0);
  const [expiry, setExpiry] = useState('');
  const [chainView, setChainView] = useState<'ALL' | 'CALLS' | 'PUTS'>('ALL');
  const [showLevels, setShowLevels] = useState(true);
  const [levelMode, setLevelMode] = useState<'INTRADAY' | 'WEEKLY'>('WEEKLY');
  const [stockLevelMode, setStockLevelMode] = useState<'INTRADAY' | 'WEEKLY'>('INTRADAY');
  const [optionLevelMode, setOptionLevelMode] = useState<'INTRADAY' | 'WEEKLY'>('INTRADAY');
  const [showSpot, setShowSpot] = useState(true);
  const [showBothOptions, setShowBothOptions] = useState(false);
  const [oppositeOption, setOppositeOption] = useState<{
    side: Side;
    securityId: number;
    candles: Candle[];
    dayOpen: number;
    weeklyOpen: number;
    previousClose: number;
  } | null>(null);
  const [levelPopoverStrike, setLevelPopoverStrike] = useState<number | null>(null);
  const [hoveredOption, setHoveredOption] = useState<{ key: string; securityId: number } | null>(null);
  const [hoveredQuote, setHoveredQuote] = useState<(OptionQuote & { key: string }) | null>(null);
  const [underlyingTimeframe, setUnderlyingTimeframe] = useState<Timeframe>('5m');
  const [optionTimeframe, setOptionTimeframe] = useState<Timeframe>('5m');
  const [activeChart, setActiveChart] = useState<'UNDERLYING' | 'OPTION' | 'OPPOSITE'>('UNDERLYING');
  const [linkedCrosshairTimestamp, setLinkedCrosshairTimestamp] = useState<number | null>(null);
  const [hoveredCrosshair, setHoveredCrosshair] = useState<SyncedCrosshair | null>(null);
  const [drawingBook, setDrawingBook] = useState<Record<string, ChartDrawing[]>>(() => {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem('manju-chart-drawings') || '{}'); }
    catch { return {}; }
  });
  const [chainPercent, setChainPercent] = useState(20);
  const [chainExpanded, setChainExpanded] = useState(false);
  const chainScrollRef = useRef<HTMLDivElement | null>(null);
  const [chartSplit, setChartSplit] = useState(50);
  const [indexWorkspaceView, setIndexWorkspaceView] = useState<IndexWorkspaceView>('ALL');
  const [chartFocusMode, setChartFocusMode] = useState<ChartFocusMode>('NONE');
  const [live, setLive] = useState<LiveSnapshot | null>(null);
  const [chartsLoading, setChartsLoading] = useState(true);
  const liveRef = useRef<LiveSnapshot | null>(null);
  liveRef.current = live;
  const lastFullSnapshot = useRef(0);
  const [feedError, setFeedError] = useState('Connecting to Dhan');
  const [instruments, setInstruments] = useState<NseInstrument[]>([]);
  const [selectedStock, setSelectedStock] = useState<NseInstrument | null>(
    null,
  );
  const selectedEquity = selectedStock?.instrument === 'EQUITY';
  const selectedHasDerivatives = Boolean(
    selectedStock &&
    live?.asset === 'STOCK' &&
    live.symbol === selectedStock.symbol &&
    live.expiries?.length &&
    live.chain?.some((row) => row.ce?.securityId || row.pe?.securityId),
  );
  // Cash-only stocks keep the compact stock workspace. F&O stocks and all
  // derivative indices get the complete underlying + premium + chain UI.
  const stockOnlyView = Boolean(selectedEquity && !selectedHasDerivatives);
  const derivativesAvailable = !selectedStock || selectedHasDerivatives;
  const [symbolSearchOpen, setSymbolSearchOpen] = useState(false);
  const [symbolSearch, setSymbolSearch] = useState('');
  const [symbolFilter, setSymbolFilter] = useState<'ALL' | 'INDICES' | 'STOCKS'>('ALL');
  const meta = ASSETS[asset];
  const underlyingDrawingKey = `underlying:${selectedStock?.securityId || asset}`;
  const optionDrawingKey = `option:${selectedStock?.securityId || asset}:${expiry}:${selectedStrike}:${side}`;
  const underlyingDrawings = drawingBook[underlyingDrawingKey] || [];
  const optionDrawings = drawingBook[optionDrawingKey] || [];
  const updateDrawings = (key: string): Dispatch<SetStateAction<ChartDrawing[]>> => (update) => {
    setDrawingBook((book) => {
      const current = book[key] || [];
      const next = typeof update === 'function'
        ? (update as (items: ChartDrawing[]) => ChartDrawing[])(current)
        : update;
      const changed = { ...book, [key]: next };
      try { localStorage.setItem('manju-chart-drawings', JSON.stringify(changed)); }
      catch { /* Browser storage can be unavailable in private mode. */ }
      return changed;
    });
  };
  const displayShort = selectedStock?.symbol || meta.short;
  const currentSpot = live?.spot || (selectedStock ? 0 : meta.spot);
  const underlyingPreviousClose = live?.underlyingPreviousClose || 0;
  const underlyingChange = underlyingPreviousClose > 0
    ? currentSpot - underlyingPreviousClose
    : 0;
  const underlyingChangePercent = underlyingPreviousClose > 0
    ? (underlyingChange / underlyingPreviousClose) * 100
    : meta.change;
  const stockStrikeSteps = selectedStock && live?.chain?.length
    ? live.chain.slice(1).map((row, index) => row.strike - live.chain[index].strike).filter((step) => step > 0)
    : [];
  const strikeStep = stockStrikeSteps.length ? Math.min(...stockStrikeSteps) : meta.step;
  const atm = Math.round(currentSpot / strikeStep) * strikeStep;
  useEffect(() => {
    fetch('/manju/api/dhan/instruments')
      .then((response) => response.json())
      .then((data: any) => setInstruments([
        ...(data.indices || []),
        ...(data.instruments || []),
      ]))
      .catch(() => setInstruments([]));
  }, []);
  useEffect(() => {
    if (!canViewPositions) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const response = await fetch('/manju/api/paper/positions', { cache: 'no-store' });
        const data: any = await response.json();
        if (active && response.ok) setPaperPositions(data.positions || []);
      } finally {
        if (active) timer = setTimeout(load, 5000);
      }
    };
    load();
    return () => { active = false; clearTimeout(timer); };
  }, [canViewPositions]);
  useEffect(() => {
    if (!canViewPositions || appView !== 'POSITIONS') return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const scan = async () => {
      try {
        let connected = 0;
        const results = await Promise.allSettled((['NIFTY', 'BANKNIFTY', 'SENSEX'] as AssetKey[]).map(async (paperAsset) => {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 60000);
          try {
            const response = await fetch(`/manju/api/paper/tick?asset=${paperAsset}`, { method: 'POST', cache: 'no-store', signal: controller.signal });
            const result = await response.json() as PaperEngineSnapshot;
            if (!response.ok || !result.ok) throw new Error(result.error || `${paperAsset} scan unavailable`);
            if (active) {
              connected += 1;
              setPaperSnapshots((current) => [...current.filter((item) => item.asset !== paperAsset), result]);
              setPaperEngineStatus(connected === 3 ? 'Monitoring live data' : `${connected}/3 indices connected`);
            }
            return result;
          } finally { clearTimeout(timeout); }
        }));
        if (active) {
          const healthy = results.filter((result): result is PromiseFulfilledResult<PaperEngineSnapshot> => result.status === 'fulfilled').map((result) => result.value);
          setPaperEngineStatus(healthy.length === 3 ? 'Monitoring live data' : healthy.length ? `${healthy.length}/3 indices connected` : 'Live scan reconnecting');
          const positionsResponse = await fetch('/manju/api/paper/positions', { cache: 'no-store' });
          if (positionsResponse.ok) setPaperPositions((await positionsResponse.json()).positions || []);
        }
      } catch {
        if (active) setPaperEngineStatus('Live scan reconnecting');
      } finally {
        if (active) timer = setTimeout(scan, 5000);
      }
    };
    scan();
    return () => { active = false; clearTimeout(timer); };
  }, [canViewPositions, appView]);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const currentAtStart = liveRef.current;
    const currentUnderlyingMatches = selectedStock
      ? currentAtStart?.asset === 'STOCK' && currentAtStart.symbol === selectedStock.symbol
      : currentAtStart?.asset === asset;
    const currentChartsReady = Boolean(
      currentUnderlyingMatches &&
      currentAtStart?.underlyingTimeframe === underlyingTimeframe &&
      currentAtStart?.underlyingCandles?.length &&
      (selectedEquity || (
        currentAtStart?.selectedStrike === selectedStrike &&
        currentAtStart?.side === side &&
        currentAtStart?.expiry === expiry &&
        currentAtStart?.optionTimeframe === optionTimeframe &&
        currentAtStart?.optionCandles?.length
      )),
    );
    setChartsLoading(!currentChartsReady);
    const load = async () => {
      const traceId = newChartTrace('chart');
      const loadStarted = performance.now();
      try {
        const query = new URLSearchParams({
          asset,
          underlyingTimeframe,
          optionTimeframe,
          side,
          strike: String(selectedStrike),
        });
        if (selectedStock) {
          query.set('securityId', String(selectedStock.securityId));
          query.set('symbol', selectedStock.symbol);
          query.set('segment', selectedStock.segment);
          query.set('instrument', selectedStock.instrument);
          query.set('exchange', selectedStock.exchange);
        }
        if (expiry) query.set('expiry', expiry);
        query.set('trace', traceId);
        const existing = liveRef.current;
        const contract = existing?.chain.find((row) => row.strike === selectedStrike)?.[side === 'CE' ? 'ce' : 'pe'];
        const matchingFeed = selectedStock
          ? existing?.asset === 'STOCK' && existing.symbol === selectedStock.symbol && existing.expiry === expiry
          : existing?.asset === asset && existing.expiry === expiry;
        const changedContract = existing?.selectedStrike !== selectedStrike || existing?.side !== side;
        const underlyingAlreadyCurrent = existing?.underlyingTimeframe === underlyingTimeframe;
        if (matchingFeed && underlyingAlreadyCurrent && contract && (changedContract || Date.now() - lastFullSnapshot.current < 20000)) {
          query.set('optionsOnly', '1');
          query.set('optionSecurityId', String(contract.securityId));
        } else if (matchingFeed && existing && (selectedEquity || contract) && (
          existing.underlyingTimeframe !== underlyingTimeframe ||
          existing.optionTimeframe !== optionTimeframe
        )) {
          // Timeframe changes need candles only. Re-fetching expiries, option
          // chain, futures and quote metadata made a simple interval switch as
          // expensive as changing the entire instrument.
          query.set('chartsOnly', '1');
          if (contract) query.set('optionSecurityId', String(contract.securityId));
        }
        chartPerf(traceId, 'load.start', { asset, symbol: selectedStock?.symbol, underlyingTimeframe, optionTimeframe, side, strike: selectedStrike, expiry });
        const response = await fetch(`/manju/api/dhan/snapshot?${query}`, {
          signal: controller.signal,
          cache: 'no-store',
          headers: { 'X-Manju-Trace': traceId },
        });
        const responseAt = performance.now();
        chartPerf(traceId, 'response.headers', { fetchMs: Math.round(responseAt - loadStarted), status: response.status, serverTiming: response.headers.get('server-timing'), serverTrace: response.headers.get('x-manju-trace') });
        const data: any = await response.json();
        chartPerf(traceId, 'response.parsed', { parseMs: Math.round(performance.now() - responseAt), totalMs: Math.round(performance.now() - loadStarted), underlyingCandles: data.underlyingCandles?.length || 0, optionCandles: data.optionCandles?.length || 0, chainRows: data.chain?.length || 0, optionsOnly: Boolean(data.optionsOnly) });
        if (!response.ok)
          throw new Error(data.error || 'Dhan feed unavailable');
        if (!active) return;
        if (data.chartsOnly) {
          setLive((previous) => previous ? {
            ...previous,
            underlyingTimeframe: data.underlyingTimeframe,
            optionTimeframe: data.optionTimeframe,
            underlyingCandles: sanitizeLatestCandle(data.underlyingCandles || []),
            optionCandles: sanitizeLatestCandle(
              data.optionCandles || [],
              previous.chain.find((row) => row.strike === selectedStrike)
                ?.[side === 'CE' ? 'ce' : 'pe']?.ltp || 0,
            ),
            updatedAt: data.updatedAt,
          } : previous);
          if ((data.underlyingCandles || []).length > 0 && (selectedEquity || (data.optionCandles || []).length > 0))
            setChartsLoading(false);
        } else if (data.optionsOnly) {
          setLive((previous) => {
            if (!previous) return previous;
            const selectedLeg = previous.chain.find(
              (row) => row.strike === data.selectedStrike,
            )?.[data.side === 'CE' ? 'ce' : 'pe'];
            const expectedOptionPrice = selectedLeg?.ltp || 0;
            const sameOptionContract =
              (selectedStock
                ? previous.asset === 'STOCK' && previous.symbol === selectedStock.symbol
                : previous.asset === asset) &&
              previous.selectedStrike === data.selectedStrike &&
              previous.side === data.side &&
              previous.optionSecurityId === data.optionSecurityId &&
              previous.optionTimeframe === optionTimeframe;
            const optionCandles = mergeSnapshotCandles(
              data.optionCandles || [],
              sameOptionContract
                ? previous.optionCandles || []
                : [],
              optionTimeframe,
              expectedOptionPrice,
            );
            return { ...previous, ...data, optionCandles };
          });
          if (
            (data.optionCandles || []).length > 0 &&
            (liveRef.current?.underlyingCandles || []).length > 0
          ) setChartsLoading(false);
        } else {
          lastFullSnapshot.current = Date.now();
          setLive((previous) => {
            if (!previous)
              return {
                ...data,
                underlyingCandles: sanitizeLatestCandle(data.underlyingCandles || []),
                optionCandles: sanitizeLatestCandle(
                  data.optionCandles || [],
                  data.chain?.find((row: { strike: number }) => row.strike === data.selectedStrike)
                    ?.[data.side === 'CE' ? 'ce' : 'pe']?.ltp || 0,
                ),
              };
            const sameUnderlying = selectedStock
              ? previous.asset === 'STOCK' && previous.symbol === selectedStock.symbol
              : previous.asset === asset;
            const sameOption =
              sameUnderlying &&
              previous.expiry === data.expiry &&
              previous.selectedStrike === data.selectedStrike &&
              previous.side === data.side &&
              previous.optionSecurityId === data.optionSecurityId;
            const expectedOptionPrice = data.chain?.find(
              (row: { strike: number }) => row.strike === data.selectedStrike,
            )?.[data.side === 'CE' ? 'ce' : 'pe']?.ltp || 0;
            const mergedChain = sameUnderlying
              ? (data.chain || []).map((row: { strike: number; ce: ChainLeg; pe: ChainLeg }) => {
                  const prior = previous.chain.find((item) => item.strike === row.strike);
                  const keepLive = (fresh: ChainLeg, old: ChainLeg): ChainLeg =>
                    fresh && old && fresh.securityId === old.securityId
                      ? { ...fresh, ltp: old.ltp || fresh.ltp }
                      : fresh;
                  return {
                    ...row,
                    ce: keepLive(row.ce, prior?.ce || null),
                    pe: keepLive(row.pe, prior?.pe || null),
                  };
                })
              : data.chain;
            return {
              ...data,
              spot: sameUnderlying ? previous.spot || data.spot : data.spot,
              chain: mergedChain,
              underlyingCandles: mergeSnapshotCandles(
                data.underlyingCandles || [],
                sameUnderlying && previous.underlyingTimeframe === underlyingTimeframe
                  ? previous.underlyingCandles || []
                  : [],
                underlyingTimeframe,
              ),
              optionCandles: mergeSnapshotCandles(
                data.optionCandles || [],
                sameOption && previous.optionTimeframe === optionTimeframe
                  ? previous.optionCandles || []
                  : [],
                optionTimeframe,
                expectedOptionPrice,
              ),
            };
          });
          const underlyingReady = (data.underlyingCandles || []).length > 0;
          const optionReady = (data.optionCandles || []).length > 0;
          if (underlyingReady && (selectedEquity || optionReady))
            setChartsLoading(false);
        }
        requestAnimationFrame(() => requestAnimationFrame(() => chartPerf(traceId, 'render.ready', { totalMs: Math.round(performance.now() - loadStarted) })));
        // Keep the visible strike synchronized with the exact contract Dhan
        // returned (important after changing the underlying or expiry).
        if (data.selectedStrike && data.selectedStrike !== selectedStrike)
          setSelectedStrike(data.selectedStrike);
        setFeedError('');
        if (data.expiry && data.expiry !== expiry) setExpiry(data.expiry);
      } catch (error) {
        chartPerf(traceId, error instanceof DOMException && error.name === 'AbortError' ? 'load.aborted' : 'load.error', { totalMs: Math.round(performance.now() - loadStarted), message: error instanceof Error ? error.message : String(error) });
        if (active) {
          setLive(null);
          setChartsLoading(false);
          setFeedError(
            error instanceof Error ? error.message : 'Dhan feed unavailable',
          );
        }
      } finally {
        // Live prices continue through the lightweight tick endpoint. Refresh
        // history less often so strike changes are not queued behind repeated
        // full candle downloads at Dhan.
        // Tick polling updates the live candle. A slower reconciliation keeps
        // completed history accurate without continuously queueing expensive
        // Dhan chart downloads behind a user's strike change.
        if (active) timer = setTimeout(load, 300000);
      }
    };
    load();
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [asset, underlyingTimeframe, optionTimeframe, side, selectedStrike, expiry, selectedStock, selectedEquity]);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const loadTick = async () => {
      try {
        const current = liveRef.current;
        const contract = current?.chain.find((row) => row.strike === selectedStrike)
          ?.[side === 'CE' ? 'ce' : 'pe'];
        const query = new URLSearchParams({ asset });
        if (selectedStock) {
          query.set('stockSecurityId', String(selectedStock.securityId));
          query.set('stockSegment', selectedStock.segment);
          query.set('optionSegment', selectedStock.exchange === 'BSE' ? 'BSE_FNO' : 'NSE_FNO');
        }
        const currentChain = current?.chain || [];
        const strikeStep = selectedStock && currentChain.length > 1
          ? Math.min(...currentChain.slice(1).map((row, index) => row.strike - currentChain[index].strike).filter((step) => step > 0))
          : ASSETS[asset].step;
        const visibleOptionIds = currentChain
          .filter((row) => Math.abs(row.strike - Math.round((current?.spot || 0) / strikeStep) * strikeStep) <= strikeStep * 6)
          .flatMap((row) => [row.ce?.securityId, row.pe?.securityId])
          .filter((value): value is number => Boolean(value)) || [];
        if (visibleOptionIds.length)
          query.set('optionSecurityIds', visibleOptionIds.join(','));
        if (contract?.securityId)
          query.set('optionSecurityId', String(contract.securityId));
        const response = await fetch(`/manju/api/dhan/ticks?${query}`, {
          cache: 'no-store',
        });
        const tick: {
          underlyingPrice?: number;
          underlyingOhlc?: LiveOhlc;
          optionPrice?: number;
          optionPrices?: Record<string, number>;
          optionOhlc?: LiveOhlc;
          optionSecurityId?: number;
        } = await response.json();
        if (!active || !response.ok) return;
        setLive((previous) => {
          if (!previous) return previous;
          const selectedLeg = previous.chain.find((row) => row.strike === selectedStrike)
            ?.[side === 'CE' ? 'ce' : 'pe'];
          const optionMatches = Boolean(
            previous.selectedStrike === selectedStrike &&
            previous.side === side &&
            tick.optionSecurityId &&
            selectedLeg?.securityId === tick.optionSecurityId,
          );
          return {
            ...previous,
            spot: tick.underlyingPrice || previous.spot,
            underlyingCandles: applyLivePrice(
              previous.underlyingCandles,
              tick.underlyingPrice || 0,
              underlyingTimeframe,
              tick.underlyingOhlc,
            ),
            optionCandles: optionMatches
              ? applyLivePrice(
                  previous.optionCandles,
                  tick.optionPrice || 0,
                  optionTimeframe,
                  tick.optionOhlc,
                )
              : previous.optionCandles,
            chain: previous.chain.map((row) => ({
              ...row,
              ce: row.ce
                ? { ...row.ce, ltp: tick.optionPrices?.[String(row.ce.securityId)] || row.ce.ltp }
                : null,
              pe: row.pe
                ? { ...row.pe, ltp: tick.optionPrices?.[String(row.pe.securityId)] || row.pe.ltp }
                : null,
            })),
          };
        });
      } catch {
        // The slower snapshot request remains the fallback if a live tick is missed.
      } finally {
        // Stay comfortably below Dhan's quote limit. Faster polling caused
        // intermittent 429 responses that also delayed chart requests.
        if (active) timer = setTimeout(loadTick, 2000);
      }
    };
    void loadTick();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [asset, expiry, optionTimeframe, selectedStock, selectedStrike, side, underlyingTimeframe]);
  useEffect(() => {
    if (stockOnlyView || indexWorkspaceView !== 'ALL' || !showBothOptions || !live || !selectedStrike || !expiry) {
      setOppositeOption(null);
      return;
    }
    const oppositeSide: Side = side === 'CE' ? 'PE' : 'CE';
    const leg = live.chain.find((row) => row.strike === selectedStrike)
      ?.[oppositeSide === 'CE' ? 'ce' : 'pe'];
    if (!leg?.securityId) {
      setOppositeOption(null);
      return;
    }
    let active = true;
    const controller = new AbortController();
    const query = new URLSearchParams({
      asset,
      underlyingTimeframe,
      optionTimeframe,
      side: oppositeSide,
      strike: String(selectedStrike),
      expiry,
      optionsOnly: '1',
      optionSecurityId: String(leg.securityId),
    });
    if (selectedStock) {
      query.set('securityId', String(selectedStock.securityId));
      query.set('symbol', selectedStock.symbol);
      query.set('segment', selectedStock.segment);
      query.set('instrument', selectedStock.instrument);
      query.set('exchange', selectedStock.exchange);
    }
    fetch(`/manju/api/dhan/snapshot?${query}`, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Opposite option unavailable');
        if (!active || data.optionSecurityId !== leg.securityId) return;
        setOppositeOption({
          side: oppositeSide,
          securityId: leg.securityId,
          candles: sanitizeLatestCandle(data.optionCandles || [], leg.ltp),
          dayOpen: data.optionDayOpen || 0,
          weeklyOpen: data.optionWeeklyOpen || data.optionDayOpen || 0,
          previousClose: leg.previousClose || 0,
        });
      })
      .catch(() => { if (active) setOppositeOption(null); });
    return () => { active = false; controller.abort(); };
  }, [asset, expiry, indexWorkspaceView, live?.optionSecurityId, optionTimeframe, selectedStock, selectedStrike, showBothOptions, side, stockOnlyView]);
  const oppositeLivePrice = showBothOptions && oppositeOption
    ? live?.chain.find((row) => row.strike === selectedStrike)
      ?.[oppositeOption.side === 'CE' ? 'ce' : 'pe']?.ltp || 0
    : 0;
  useEffect(() => {
    if (!(oppositeLivePrice > 0)) return;
    setOppositeOption((current) => current
      ? { ...current, candles: applyLivePrice(current.candles, oppositeLivePrice, optionTimeframe) }
      : current);
  }, [oppositeLivePrice, optionTimeframe]);
  const mockStrikes = useMemo(
    () => Array.from({ length: 13 }, (_, i) => atm + (i - 6) * strikeStep),
    [atm, strikeStep],
  );
  const mockUnderlying = useMemo(
    () => makeCandles(meta.spot, meta.spot, false, underlyingTimeframe),
    [meta, underlyingTimeframe],
  );
  const distance = Math.abs(selectedStrike - atm) / strikeStep;
  const optionBase = Math.max(
    22,
    176 -
      distance * 21 +
      (side === 'CE'
        ? ((atm - selectedStrike) / strikeStep) * 12
        : ((selectedStrike - atm) / strikeStep) * 12),
  );
  const mockOptionCandles = useMemo(
    () =>
      makeCandles(
        optionBase,
        selectedStrike + (side === 'CE' ? 7 : 19),
        true,
        optionTimeframe,
      ),
    [optionBase, selectedStrike, side, optionTimeframe],
  );
  const underlying = live?.underlyingCandles?.length
    ? live.underlyingCandles
    : [];
  const spotIndicators = useMemo(() => calculateTradingIndicators(underlying), [underlying, underlyingTimeframe]);
  const optionSelectionMatches = Boolean(
    (selectedStock
      ? live?.asset === 'STOCK' && live?.symbol === selectedStock.symbol
      : live?.asset === asset) &&
    live?.selectedStrike === selectedStrike &&
    live?.side === side &&
    live?.expiry === expiry &&
    live?.optionSecurityId === live?.chain.find((row) => row.strike === selectedStrike)
      ?.[side === 'CE' ? 'ce' : 'pe']?.securityId,
  );
  const optionCandles = optionSelectionMatches && live?.optionCandles?.length
    ? live.optionCandles
    : [];
  const optionIndicators = useMemo(() => calculateTradingIndicators(optionCandles), [optionCandles, optionTimeframe]);
  const oppositeIndicators = useMemo(() => calculateTradingIndicators(oppositeOption?.candles || []), [oppositeOption?.candles, optionTimeframe]);
  const activeIndicators = activeChart === 'UNDERLYING' ? spotIndicators : activeChart === 'OPPOSITE' ? oppositeIndicators : optionIndicators;
  const activeIndicatorLabel = activeChart === 'UNDERLYING'
    ? `SPOT · ${underlyingTimeframe}`
    : `${activeChart === 'OPPOSITE' ? oppositeOption?.side || 'OPTION' : side} OPTION · ${optionTimeframe}`;
  const weeklyOpen = selectedStock ? live?.weeklyOpen || 0 : live?.weeklyOpen || meta.weeklyOpen;
  const dayOpen = selectedStock ? live?.dayOpen || 0 : live?.dayOpen || meta.spot;
  const activeLevelMode = selectedStock ? stockLevelMode : levelMode;
  const selectedOtherIndex = selectedStock?.instrument === 'INDEX';
  const underlyingLevels = selectedStock
    ? selectedOtherIndex
      ? activeLevelMode === 'WEEKLY'
        ? makeOtherIndexWeeklyLevels(weeklyOpen)
        : makeOtherIndexIntradayLevels(dayOpen)
      : activeLevelMode === 'WEEKLY'
        ? makeStockWeeklyLevels(weeklyOpen)
        : makeStockIntradayLevels(dayOpen)
    : activeLevelMode === 'WEEKLY'
      ? makeWeeklyLevels(weeklyOpen)
      : makeIntradayLevels(dayOpen, meta.intradayStep);
  const underlyingOpen = activeLevelMode === 'WEEKLY' ? weeklyOpen : dayOpen;
  const underlyingChartLevels = [
    ...underlyingLevels,
    { value: underlyingOpen, label: 'OPEN', color: '#f28c18' },
  ];
  const optionDayOpen = optionSelectionMatches ? live?.optionDayOpen || 0 : 0;
  const optionWeeklyOpen = optionSelectionMatches
    ? live?.optionWeeklyOpen || optionDayOpen
    : 0;
  const optionOpen = optionLevelMode === 'WEEKLY' ? optionWeeklyOpen : optionDayOpen;
  const optionLevels = optionLevelMode === 'WEEKLY'
    ? makeWeeklyLevels(optionOpen)
    : makeOptionLevels(optionOpen);
  const optionChartLevels = [
    ...optionLevels,
    { value: optionOpen, label: 'OPEN', color: '#f28c18' },
  ];
  const oppositeOptionOpen = optionLevelMode === 'WEEKLY'
    ? oppositeOption?.weeklyOpen || oppositeOption?.dayOpen || 0
    : oppositeOption?.dayOpen || 0;
  const oppositeOptionLevels = optionLevelMode === 'WEEKLY'
    ? makeWeeklyLevels(oppositeOptionOpen)
    : makeOptionLevels(oppositeOptionOpen);
  const oppositeOptionChartLevels = [
    ...oppositeOptionLevels,
    { value: oppositeOptionOpen, label: 'OPEN', color: '#f28c18' },
  ];
  const oppositeDrawingKey = `option:${selectedStock?.securityId || asset}:${expiry}:${selectedStrike}:${oppositeOption?.side || (side === 'CE' ? 'PE' : 'CE')}`;
  const oppositeDrawings = drawingBook[oppositeDrawingKey] || [];
  const chainRows = live?.chain?.length
    ? live.chain
        .filter((row) => Math.abs(row.strike - atm) <= strikeStep * 8)
        .sort((a, b) => b.strike - a.strike)
    : selectedStock
      ? []
      : mockStrikes.map((strike) => ({ strike, ce: null, pe: null })).sort((a, b) => b.strike - a.strike);
  const oiSeries = chainRows.map((row, i) => ({
    ce: row.ce?.oi ?? Math.round(42000 + Math.abs(i - 6) * 14500 + i * 1900),
    pe: row.pe?.oi ?? Math.round(51000 + Math.abs(i - 6) * 12800 + (12 - i) * 2300),
    cePrevious:
      row.ce?.previousOi ?? Math.round(27000 + Math.abs(i - 6) * 9200),
    pePrevious:
      row.pe?.previousOi ?? Math.round(31000 + Math.abs(i - 6) * 8100),
  }));
  const maxVisibleCeOi = Math.max(1, ...oiSeries.map((row) => row.ce));
  const maxVisiblePeOi = Math.max(1, ...oiSeries.map((row) => row.pe));
  const maxVisibleCeOiChange = Math.max(1, ...oiSeries.map((row) => Math.abs(row.ce - row.cePrevious)));
  const maxVisiblePeOiChange = Math.max(1, ...oiSeries.map((row) => Math.abs(row.pe - row.pePrevious)));
  const maxVisibleCeVolume = Math.max(1, ...chainRows.map((row) => row.ce?.volume || 0));
  const maxVisiblePeVolume = Math.max(1, ...chainRows.map((row) => row.pe?.volume || 0));
  useEffect(() => {
    if (!chainExpanded) return;
    const container = chainScrollRef.current;
    const atmRow = container?.querySelector<HTMLElement>('[data-atm-row="true"]');
    if (!container || !atmRow) return;
    const containerBox = container.getBoundingClientRect();
    const atmBox = atmRow.getBoundingClientRect();
    container.scrollTop += atmBox.top - containerBox.top - (container.clientHeight - atmBox.height) / 2;
  }, [atm, chainExpanded, chainRows.length]);
  const underlyingOiProfile: ChartOiLevel[] = chainRows
    .filter((row) => row.ce || row.pe)
    .map((row) => ({
      strike: row.strike,
      callOi: row.ce?.oi || 0,
      putOi: row.pe?.oi || 0,
    }));
  const symbolResults = useMemo(() => {
    const query = symbolSearch.trim().toLowerCase();
    const indices = (Object.keys(ASSETS) as AssetKey[]).map((key) => ({
      kind: 'INDICES' as const,
      value: key,
      symbol: key,
      name: ASSETS[key].name,
      exchange: key === 'SENSEX' ? 'BSE' : 'NSE',
    }));
    const additionalIndices = instruments
      .filter((item) => item.kind === 'INDEX')
      .filter((item) => !indices.some((index) =>
        index.name.toLowerCase() === item.name.toLowerCase() ||
        index.symbol.toLowerCase() === item.symbol.toLowerCase(),
      ))
      .map((item) => ({
        kind: 'INDICES' as const,
        value: `${item.symbol} — ${item.name}`,
        symbol: item.symbol,
        name: item.name,
        exchange: item.exchange,
      }));
    const stocks = instruments.filter((item) => item.kind === 'STOCK').map((item) => ({
      kind: 'STOCKS' as const,
      value: `${item.symbol} — ${item.name}`,
      symbol: item.symbol,
      name: item.name,
      exchange: item.exchange,
    }));
    return [...indices, ...additionalIndices, ...stocks]
      .filter((item) => symbolFilter === 'ALL' || item.kind === symbolFilter)
      .filter(
        (item) =>
          !query ||
          item.symbol.toLowerCase().includes(query) ||
          item.name.toLowerCase().includes(query),
      );
  }, [instruments, symbolFilter, symbolSearch]);
  const chooseAsset = (value: AssetKey) => {
    setSelectedStock(null);
    setAsset(value);
    setLive(null);
    setSelectedStrike(0);
    setExpiry('');
    setLinkedCrosshairTimestamp(null);
    setHoveredCrosshair(null);
    setSymbolSearchOpen(false);
    setSymbolSearch('');
  };
  const chooseInstrument = (value: string) => {
    if ((Object.keys(ASSETS) as AssetKey[]).includes(value as AssetKey)) {
      chooseAsset(value as AssetKey);
      return;
    }
    const stock = instruments.find(
      (item) =>
        `${item.symbol} — ${item.name}` === value || item.symbol === value,
    );
    if (stock) {
      setSelectedStock(stock);
      setShowSpot(true);
      setShowBothOptions(false);
      setLive(null);
      setSelectedStrike(0);
      setExpiry('');
      setLinkedCrosshairTimestamp(null);
      setHoveredCrosshair(null);
    }
    setSymbolSearchOpen(false);
    setSymbolSearch('');
  };
  useEffect(() => {
    if (!symbolSearchOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSymbolSearchOpen(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [symbolSearchOpen]);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-strike-popover]')) setLevelPopoverStrike(null);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  useEffect(() => {
    if (!hoveredOption) {
      setHoveredQuote(null);
      return;
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const query = new URLSearchParams({
          asset,
          quoteOnly: '1',
          quoteSecurityId: String(hoveredOption.securityId),
        });
        if (selectedStock) query.set('optionSegment', selectedStock.exchange === 'BSE' ? 'BSE_FNO' : 'NSE_FNO');
        const response = await fetch(`/manju/api/dhan/snapshot?${query}`, { cache: 'no-store' });
        const data = await response.json();
        if (active && response.ok) setHoveredQuote({ ...data, key: hoveredOption.key });
      } finally {
        if (active) timer = setTimeout(load, 3000);
      }
    };
    setHoveredQuote(null);
    load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [asset, hoveredOption, selectedStock]);
  const exitChartFocus = () => {
    setChartFocusMode('NONE');
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  };
  const enterChartFocus = (mode: Exclude<ChartFocusMode, 'NONE'>) => {
    setChartFocusMode(mode);
    if (!document.fullscreenElement)
      void document.documentElement.requestFullscreen?.().catch(() => {});
  };
  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setChartFocusMode('NONE');
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && chartFocusMode !== 'NONE') exitChartFocus();
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    window.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      window.removeEventListener('keydown', onEscape);
    };
  }, [chartFocusMode]);
  const focusActive = chartFocusMode !== 'NONE';
  const viewHasUnderlying = indexWorkspaceView === 'UNDERLYING' ||
    indexWorkspaceView === 'UNDERLYING_OPTION' ||
    indexWorkspaceView === 'UNDERLYING_CHAIN';
  const viewHasOption = indexWorkspaceView === 'OPTION' ||
    indexWorkspaceView === 'OPTION_CHAIN' ||
    indexWorkspaceView === 'UNDERLYING_OPTION';
  const viewHasChain = indexWorkspaceView === 'CHAIN' ||
    indexWorkspaceView === 'OPTION_CHAIN' ||
    indexWorkspaceView === 'UNDERLYING_CHAIN';
  const isTwoPanelView = indexWorkspaceView === 'OPTION_CHAIN' ||
    indexWorkspaceView === 'UNDERLYING_OPTION' ||
    indexWorkspaceView === 'UNDERLYING_CHAIN';
  const showChartsArea = focusActive || stockOnlyView || indexWorkspaceView === 'ALL' || viewHasUnderlying || viewHasOption;
  const showChainArea = !focusActive && (stockOnlyView || indexWorkspaceView === 'ALL' || viewHasChain);
  const showUnderlyingPane = focusActive
    ? chartFocusMode === 'UNDERLYING' || chartFocusMode === 'DUO'
    : stockOnlyView || viewHasUnderlying || (indexWorkspaceView === 'ALL' && showSpot);
  const showOptionPane = !stockOnlyView && derivativesAvailable && (focusActive
    ? chartFocusMode === 'OPTION' || chartFocusMode === 'DUO'
    : indexWorkspaceView === 'ALL' || viewHasOption);
  const showOppositePane = focusActive
    ? chartFocusMode === 'OPPOSITE'
    : showOptionPane && indexWorkspaceView === 'ALL' && showBothOptions;
  return (
    <main className={`app-shell ${darkMode ? 'dark' : ''} ${focusActive ? 'chart-focus-active' : ''}`} aria-busy={chartsLoading}>
      {chartsLoading && appView === 'MARKET' && (
        <div className="charts-loading-overlay" role="status" aria-live="polite">
          <div className="charts-loading-card">
            <span className="charts-loading-spinner" aria-hidden="true" />
            <strong>Loading market data</strong>
            <small>Fetching the correct candles and option chain from Dhan…</small>
          </div>
        </div>
      )}
      {symbolSearchOpen && (
        <div
          className="symbol-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSymbolSearchOpen(false);
          }}
        >
          <section className="symbol-modal" role="dialog" aria-modal="true" aria-labelledby="symbol-search-title">
            <header>
              <h2 id="symbol-search-title">Symbol search</h2>
              <button aria-label="Close symbol search" onClick={() => setSymbolSearchOpen(false)}><X /></button>
            </header>
            <label className="symbol-search-field">
              <Search />
              <input
                autoFocus
                value={symbolSearch}
                onChange={(event) => setSymbolSearch(event.target.value)}
                placeholder="Search NSE symbol or company"
              />
              {symbolSearch && <button aria-label="Clear search" onClick={() => setSymbolSearch('')}><X /></button>}
            </label>
            <div className="symbol-filters" role="tablist" aria-label="Symbol type">
              {(['ALL', 'INDICES', 'STOCKS'] as const).map((filter) => (
                <button key={filter} role="tab" aria-selected={symbolFilter === filter} className={symbolFilter === filter ? 'active' : ''} onClick={() => setSymbolFilter(filter)}>
                  {filter === 'ALL' ? 'All' : filter === 'INDICES' ? 'Indices' : 'Stocks'}
                </button>
              ))}
            </div>
            <div className="symbol-results">
              {symbolResults.map((item) => (
                <button key={`${item.kind}-${item.value}`} onClick={() => chooseInstrument(item.value)}>
                  <span className="symbol-result-mark">{item.symbol.slice(0, 1)}</span>
                  <strong>{item.symbol}</strong>
                  <span className="symbol-result-name">{item.name}</span>
                  <small>{item.kind === 'INDICES' ? 'index' : 'stock'} · {item.exchange}</small>
                </button>
              ))}
              {!symbolResults.length && <div className="symbol-empty">No matching NSE symbols</div>}
            </div>
            <footer>Search by NSE symbol or company name</footer>
          </section>
        </div>
      )}
      {focusActive && <div className="chart-focus-toolbar">
        <div>
          {chartFocusMode === 'DUO' ? <Columns2 /> : <Maximize2 />}
          <strong>{chartFocusMode === 'DUO' ? 'Underlying + option' : chartFocusMode === 'UNDERLYING' ? 'Underlying chart' : chartFocusMode === 'OPPOSITE' ? 'Opposite option chart' : 'Option chart'}</strong>
          <span>Fullscreen focus</span>
        </div>
        <button type="button" onClick={exitChartFocus} aria-label="Exit fullscreen">
          <Minimize2 /> Exit fullscreen
        </button>
      </div>}
      <div className="token-status-bar" role="status">
        <span>{tokenInfo.error || (tokenInfo.ready
          ? tokenInfo.automatic
            ? `Dhan token active · auto renewal enabled · expires ${new Date(tokenInfo.expiresAt!).toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'})} IST`
            : `Dhan token active · manual token${tokenInfo.expiresAt ? ` · expires ${new Date(tokenInfo.expiresAt).toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'})} IST` : ''}`
          : tokenInfo.configured
            ? tokenInfo.automatic ? 'Dhan automatic authentication enabled' : 'Dhan manual token is expired or invalid'
            : 'Add DHAN_CLIENT_ID and DHAN_ACCESS_TOKEN to .env.local, then restart the app')}</span>
        {tokenInfo.automatic
          ? <button disabled={generatingToken || !tokenInfo.canGenerate} onClick={generateToken}>{generatingToken ? 'Generating…' : tokenInfo.ready ? 'Token active' : 'Generate Dhan token'}</button>
          : <button disabled>{tokenInfo.ready ? 'Manual token active' : 'Token required'}</button>}
      </div>
      <header className="topbar">
        <div className="brand">
          <span className="brand-glyph">M</span>
          <div>
            <strong>MANJU</strong>
            <small>LEVELS</small>
          </div>
        </div>
        <div className="asset-picker">
          <span className="eyebrow">UNDERLYING</span>
          <button className="symbol-trigger" onClick={() => setSymbolSearchOpen(true)} aria-haspopup="dialog">
            <span>{selectedStock ? selectedStock.symbol : asset}</span>
            <ChevronDown />
          </button>
        </div>
        <div className="market-quote">
          <strong>{formatPrice(currentSpot)}</strong>
          <span className={underlyingChangePercent >= 0 ? 'positive' : 'negative'}>
            {underlyingPreviousClose > 0 && <>{underlyingChange >= 0 ? '+' : ''}{formatPrice(underlyingChange)} </>}
            ({underlyingChangePercent >= 0 ? '+' : ''}{underlyingChangePercent.toFixed(2)}%)
          </span>
          {!selectedStock && (
            <span className={`future-quote ${live?.futurePrice ? '' : 'unavailable'}`} title={live?.futureSymbol || 'Available when Dhan is connected'}>
              <small>{meta.short} FUT</small>
              <b>{live?.futurePrice ? formatPrice(live.futurePrice) : '—'}</b>
            </span>
          )}
          <span className={`live ${live ? '' : 'offline'}`}>
            <i /> {live ? 'MARKET LIVE' : 'DEMO DATA'}
          </span>
        </div>
        <div className="header-actions">
          {!focusActive && <div className="spot-indicators" aria-label={`${activeIndicatorLabel} indicators`}>
            <span className="spot-indicator-timeframe">{activeIndicatorLabel}</span>
            <span title="Bollinger Bands, 20 period, 2 standard deviations"><small>BB(20,2)</small><b>{activeIndicators.bollinger ? `${formatPrice(activeIndicators.bollinger.lower)} / ${formatPrice(activeIndicators.bollinger.middle)} / ${formatPrice(activeIndicators.bollinger.upper)}` : '—'}</b></span>
            <span title="Simple moving average over 21 candles"><small>SMA21</small><b>{activeIndicators.sma21 === null ? '—' : formatPrice(activeIndicators.sma21)}</b></span>
            <span title="Session VWAP from active chart candles and volume"><small>VWAP</small><b>{activeIndicators.vwap === null ? '—' : formatPrice(activeIndicators.vwap)}</b></span>
          </div>}
          {!stockOnlyView && <label className="workspace-view-picker" title="Choose which workspace panel fills the screen">
            <span>VIEW</span>
            <select
              value={indexWorkspaceView}
              onChange={(event) => setIndexWorkspaceView(event.target.value as IndexWorkspaceView)}
              aria-label="Workspace view"
            >
              <option value="ALL">All panels</option>
              <option value="UNDERLYING">Underlying only</option>
              <option value="OPTION">Option chart only</option>
              <option value="CHAIN">Option chain only</option>
              <option value="OPTION_CHAIN">Option chart + chain</option>
              <option value="UNDERLYING_OPTION">Underlying + option chart</option>
              <option value="UNDERLYING_CHAIN">Underlying + option chain</option>
            </select>
            <ChevronDown />
          </label>}
          {!stockOnlyView && derivativesAvailable && <button
            type="button"
            className="duo-fullscreen-button"
            title="Open underlying and option charts together in fullscreen"
            aria-label="Open underlying and option charts in fullscreen"
            onClick={() => enterChartFocus('DUO')}
          >
            <Columns2 />
            <span>Duo fullscreen</span>
          </button>}
          {(stockOnlyView || indexWorkspaceView === 'ALL') && <button
            className={`levels-toggle ${showSpot ? 'on' : ''}`}
            role="switch"
            aria-checked={showSpot}
            disabled={stockOnlyView}
            title={stockOnlyView ? 'Spot chart remains visible for cash-only stocks' : 'Show or hide spot chart'}
            onClick={() => setShowSpot((value) => !value)}
          >
            <span />
            Underlying
          </button>}
          <button
            className={`levels-toggle ${showLevels ? 'on' : ''}`}
            role="switch"
            aria-checked={showLevels}
            onClick={() => setShowLevels((value) => !value)}
          >
            <span />
            Levels
          </button>
          {!stockOnlyView && indexWorkspaceView === 'ALL' && <button
            className={`levels-toggle ${showBothOptions ? 'on' : ''}`}
            role="switch"
            aria-checked={showBothOptions}
            title="Show CE and PE charts side by side"
            onClick={() => {
              setShowBothOptions((value) => {
                if (!value) setShowSpot(false);
                return !value;
              });
            }}
          >
            <span />
            CE + PE
          </button>}
          <span
            className={`data-source ${live ? 'connected' : 'disconnected'}`}
            title={feedError}
          >
            {live ? 'Dhan connected' : 'Dhan setup required'}
          </span>
          {canViewPositions && <button
            className={`positions-nav ${appView === 'POSITIONS' ? 'active' : ''}`}
            aria-current={appView === 'POSITIONS' ? 'page' : undefined}
            onClick={() => setAppView((view) => view === 'POSITIONS' ? 'MARKET' : 'POSITIONS')}
          >
            <BriefcaseBusiness />
            {appView === 'POSITIONS' ? 'Charts' : 'Positions'}
          </button>}
          <button className="theme-toggle" aria-label={darkMode ? 'Use light mode' : 'Use dark mode'} title={darkMode ? 'Use light mode' : 'Use dark mode'} onClick={toggleTheme}>
            {darkMode ? <Sun /> : <Moon />}
          </button>
          <div className="avatar">RG</div>
        </div>
      </header>
      {!canViewPositions || appView === 'MARKET' ? <div
        className="workspace"
        style={{
          gridTemplateColumns: showChartsArea && showChainArea
            ? isTwoPanelView
              ? 'minmax(0, 1fr) 6px minmax(0, 1fr)'
              : `minmax(0, ${100 - chainPercent}fr) 6px minmax(0, ${chainPercent}fr)`
            : 'minmax(0, 1fr)',
        }}
      >
        {showChartsArea && <div
          className="charts-grid"
          style={{
            gridTemplateColumns: chartFocusMode === 'DUO'
              ? 'repeat(2, minmax(0, 1fr))'
              : focusActive
              ? 'minmax(0, 1fr)'
              : indexWorkspaceView === 'UNDERLYING_OPTION'
              ? 'repeat(2, minmax(0, 1fr))'
              : stockOnlyView || indexWorkspaceView !== 'ALL'
              ? 'minmax(0, 1fr)'
              : showBothOptions
              ? `repeat(${showSpot ? 3 : 2}, minmax(0, 1fr))`
              : showSpot
              ? `minmax(0, ${chartSplit}fr) 6px minmax(0, ${100 - chartSplit}fr)`
              : 'minmax(0, 1fr)',
          }}
        >
          {showUnderlyingPane && <Chart
            key={`underlying-${selectedStock?.securityId || asset}-${underlyingTimeframe}`}
            title={
              selectedStock
                ? `${selectedStock.symbol} · ${selectedStock.name}`
                : meta.name
            }
            subtitle={`${underlyingTimeframe} · NSE · ${activeLevelMode === 'WEEKLY' ? 'Weekly' : 'Day'} open ${formatPrice(activeLevelMode === 'WEEKLY' ? weeklyOpen : dayOpen)}`}
            candles={underlying}
            levels={showLevels ? underlyingChartLevels : []}
            previousClose={underlyingPreviousClose}
            timeframe={underlyingTimeframe}
            onTimeframeChange={setUnderlyingTimeframe}
            levelMode={activeLevelMode}
            onLevelModeChange={selectedStock ? setStockLevelMode : setLevelMode}
            accent={activeChart === 'UNDERLYING'}
            onActivate={() => setActiveChart('UNDERLYING')}
            darkMode={darkMode}
            oiProfile={underlyingOiProfile}
            linkedCrosshairTimestamp={linkedCrosshairTimestamp}
            onLinkedCrosshairChange={setLinkedCrosshairTimestamp}
            hoveredCrosshair={hoveredCrosshair}
            onCrosshairHover={setHoveredCrosshair}
            drawings={underlyingDrawings}
            onDrawingsChange={updateDrawings(underlyingDrawingKey)}
            fullscreenActive={chartFocusMode === 'UNDERLYING'}
            onFullscreenToggle={() => chartFocusMode === 'UNDERLYING' ? exitChartFocus() : enterChartFocus('UNDERLYING')}
          />}
          {!focusActive && !stockOnlyView && indexWorkspaceView === 'ALL' && showSpot && !showBothOptions && <ResizeHandle
            onDrag={(delta) =>
              setChartSplit((value) =>
                Math.min(
                  78,
                  Math.max(
                    22,
                    value +
                      (delta /
                        Math.max(
                          (window.innerWidth * (100 - chainPercent)) / 100,
                          1,
                        )) *
                        100,
                  ),
                ),
              )
            }
          />}
          {showOptionPane && (
            <Chart
              key={`option-${asset}-${expiry}-${selectedStrike}-${side}-${optionTimeframe}`}
              title={`${displayShort} ${formatExpiry(expiry)} ${selectedStrike.toLocaleString('en-IN')} ${side}`}
              subtitle={`${optionTimeframe} · ${selectedStock?.exchange === 'BSE' ? 'BSE' : 'NSE'} F&O · ${optionLevelMode === 'WEEKLY' ? 'Weekly' : 'Day'} open ${formatPrice(optionOpen)}`}
              candles={optionCandles}
              levels={showLevels ? optionChartLevels : []}
              timeframe={optionTimeframe}
              onTimeframeChange={setOptionTimeframe}
              levelMode={optionLevelMode}
              onLevelModeChange={setOptionLevelMode}
              showCandlePopover
              previousClose={live?.chain.find((row) => row.strike === selectedStrike)?.[side === 'CE' ? 'ce' : 'pe']?.previousClose || 0}
              accent={activeChart === 'OPTION'}
              onActivate={() => setActiveChart('OPTION')}
              darkMode={darkMode}
              linkedCrosshairTimestamp={linkedCrosshairTimestamp}
              onLinkedCrosshairChange={setLinkedCrosshairTimestamp}
              hoveredCrosshair={hoveredCrosshair}
              onCrosshairHover={setHoveredCrosshair}
              drawings={optionDrawings}
              onDrawingsChange={updateDrawings(optionDrawingKey)}
              fullscreenActive={chartFocusMode === 'OPTION'}
              onFullscreenToggle={() => chartFocusMode === 'OPTION' ? exitChartFocus() : enterChartFocus('OPTION')}
            />
          )}
          {showOppositePane && oppositeOption?.candles.length ? (
            <Chart
              key={`option-opposite-${asset}-${expiry}-${selectedStrike}-${oppositeOption.side}-${optionTimeframe}`}
              title={`${displayShort} ${formatExpiry(expiry)} ${selectedStrike.toLocaleString('en-IN')} ${oppositeOption.side}`}
              subtitle={`${optionTimeframe} · ${selectedStock?.exchange === 'BSE' ? 'BSE' : 'NSE'} F&O · ${optionLevelMode === 'WEEKLY' ? 'Weekly' : 'Day'} open ${formatPrice(oppositeOptionOpen)}`}
              candles={oppositeOption.candles}
              levels={showLevels ? oppositeOptionChartLevels : []}
              timeframe={optionTimeframe}
              onTimeframeChange={setOptionTimeframe}
              levelMode={optionLevelMode}
              onLevelModeChange={setOptionLevelMode}
              showCandlePopover
              previousClose={oppositeOption.previousClose}
              accent={activeChart === 'OPPOSITE'}
              onActivate={() => setActiveChart('OPPOSITE')}
              darkMode={darkMode}
              linkedCrosshairTimestamp={linkedCrosshairTimestamp}
              onLinkedCrosshairChange={setLinkedCrosshairTimestamp}
              hoveredCrosshair={hoveredCrosshair}
              onCrosshairHover={setHoveredCrosshair}
              drawings={oppositeDrawings}
              onDrawingsChange={updateDrawings(oppositeDrawingKey)}
              fullscreenActive={chartFocusMode === 'OPPOSITE'}
              onFullscreenToggle={() => chartFocusMode === 'OPPOSITE' ? exitChartFocus() : enterChartFocus('OPPOSITE')}
            />
          ) : null}
        </div>}
        {showChartsArea && showChainArea && (isTwoPanelView
          ? <div className="pane-divider fixed" aria-hidden="true" />
          : <ResizeHandle
              onDrag={(delta) =>
                setChainPercent((value) =>
                  Math.min(40, Math.max(15, value - (delta / Math.max(window.innerWidth, 1)) * 100)),
                )
              }
            />)}
        {showChainArea && chainExpanded && (
          <button
            type="button"
            className="chain-modal-backdrop"
            aria-label="Close expanded option chain"
            onClick={() => setChainExpanded(false)}
          />
        )}
        {showChainArea && <aside className={`chain-panel ${chainExpanded ? 'chain-expanded' : 'chain-compact'}`}>
          {selectedStock && live && !live.expiries?.length && (
            <div className="stock-chain-disabled">
              <strong>No listed options for {selectedStock.symbol}</strong>
              <span>Select an NSE F&amp;O stock to view derivatives.</span>
            </div>
          )}
          <div className="chain-head">
            <div>
              <span className="eyebrow">DERIVATIVES</span>
              <h2>Option chain</h2>
            </div>
            <div className="chain-head-actions">
              <button aria-label="Refresh chain" title="Refresh option chain">
                <RefreshCw />
              </button>
              <button
                type="button"
                className="chain-expand-button"
                aria-label={chainExpanded ? 'Close expanded option chain' : 'Expand option chain'}
                title={chainExpanded ? 'Close expanded option chain' : 'Expand option chain'}
                onClick={() => setChainExpanded((value) => !value)}
              >
                {chainExpanded ? <X /> : <Maximize2 />}
              </button>
            </div>
          </div>
          <div className="chain-controls">
            <label>
              <span>Expiry</span>
              <select
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
              >
                {!live?.expiries?.length && (
                  <option value="">{selectedStock && live ? 'Not listed' : 'Loading'}</option>
                )}
                {live?.expiries?.map((value) => (
                  <option key={value} value={value}>
                    {formatExpiry(value)}
                  </option>
                ))}
              </select>
            </label>
            <div className="segmented">
              {(['ALL', 'CALLS', 'PUTS'] as const).map((v) => (
                <button
                  key={v}
                  className={chainView === v ? 'active' : ''}
                  onClick={() => setChainView(v)}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div className="chain-summary">
            <span>
              <b>{formatPrice(currentSpot)}</b> Spot
            </span>
            <span>
              <b>{atm.toLocaleString('en-IN')}</b> ATM
            </span>
            <span>
              <b>1.08</b> PCR
            </span>
          </div>
          <div className={`chain-table view-${chainView.toLowerCase()}`}>
            <div className="chain-row chain-labels">
              <span className="chain-side-labels call-labels"><b>LTP</b><b>OI</b><b>OI CHG</b><b>VOL</b></span>
              <span>STRIKE</span>
              <span className="chain-side-labels put-labels"><b>LTP</b><b>OI</b><b>OI CHG</b><b>VOL</b></span>
            </div>
            <div className="chain-scroll" ref={chainScrollRef}>
              {chainRows.map((row, i) => {
                const strike = row.strike;
                const d = (strike - atm) / strikeStep;
                const ce = row.ce?.ltp ?? Math.max(7.5, 122 - d * 29 + i * 1.4);
                const pe = row.pe?.ltp ?? Math.max(7.5, 122 + d * 29 - i * 0.7);
                const ceChange = row.ce?.previousClose
                  ? ((ce - row.ce.previousClose) / row.ce.previousClose) * 100
                  : 0;
                const peChange = row.pe?.previousClose
                  ? ((pe - row.pe.previousClose) / row.pe.previousClose) * 100
                  : 0;
                const cePointChange = row.ce?.previousClose ? ce - row.ce.previousClose : 0;
                const pePointChange = row.pe?.previousClose ? pe - row.pe.previousClose : 0;
                const oi = oiSeries[i];
                const ceOiChange = oi.ce - oi.cePrevious;
                const peOiChange = oi.pe - oi.pePrevious;
                const ceOiPercent = Math.round((oi.ce / maxVisibleCeOi) * 100);
                const peOiPercent = Math.round((oi.pe / maxVisiblePeOi) * 100);
                const ceOiChangePercent = Math.round((Math.abs(ceOiChange) / maxVisibleCeOiChange) * 100);
                const peOiChangePercent = Math.round((Math.abs(peOiChange) / maxVisiblePeOiChange) * 100);
                const ceVolumePercent = Math.round(((row.ce?.volume || 0) / maxVisibleCeVolume) * 100);
                const peVolumePercent = Math.round(((row.pe?.volume || 0) / maxVisiblePeVolume) * 100);
                const isAtm = strike === atm;
                const strikeSupport = underlyingLevels
                  .filter((level) => level.value < strike)
                  .sort((a, b) => b.value - a.value)[0];
                const strikeResistance = underlyingLevels
                  .filter((level) => level.value > strike)
                  .sort((a, b) => a.value - b.value)[0];
                return (
                  <div
                    className={`chain-row ${isAtm ? 'atm' : ''}`}
                    data-atm-row={isAtm ? 'true' : undefined}
                    key={strike}
                  >
                    <button
                      className={`option-price chain-leg call-leg ${
                        selectedStrike === strike && side === 'CE'
                          ? 'selected'
                          : ''
                      }`}
                      onPointerEnter={() => row.ce && setHoveredOption({ key: `${strike}-CE`, securityId: row.ce.securityId })}
                      onPointerLeave={() => setHoveredOption((current) => current?.key === `${strike}-CE` ? null : current)}
                      onClick={() => {
                        setChartsLoading(true);
                        setSelectedStrike(strike);
                        setSide('CE');
                        setLevelPopoverStrike(null);
                      }}
                    >
                      <span className="chain-metric"><b>{formatPrice(ce)}</b><small className={cePointChange >= 0 ? 'positive' : 'negative'}>{cePointChange >= 0 ? '+' : ''}{formatPrice(cePointChange)} ({ceChange >= 0 ? '+' : ''}{ceChange.toFixed(1)}%)</small></span>
                      <span className={`chain-metric oi-strength resistance ${ceOiPercent === 100 ? 'maximum' : ceOiPercent > 80 ? 'strong' : ceOiPercent === 80 ? 'threshold' : ''}`}><b>{ceOiPercent}%</b><small>{formatOi(oi.ce)}</small></span>
                      <span className={`chain-metric oi-strength resistance ${ceOiChangePercent === 100 ? 'maximum' : ceOiChangePercent > 80 ? 'strong' : ceOiChangePercent === 80 ? 'threshold' : ''}`}><b>{ceOiChangePercent}%</b><small className={ceOiChange >= 0 ? 'positive' : 'negative'}>{formatOi(ceOiChange)}</small></span>
                      <span className={`chain-metric oi-strength resistance ${ceVolumePercent === 100 ? 'maximum' : ceVolumePercent > 80 ? 'strong' : ceVolumePercent === 80 ? 'threshold' : ''}`}><b>{ceVolumePercent}%</b><small>{formatOi(row.ce?.volume || 0)}</small></span>
                      {hoveredOption?.key === `${strike}-CE` && (
                        <span className="option-quote-popover" role="tooltip">
                          <strong>{displayShort} {strike.toLocaleString('en-IN')} CE</strong>
                          {hoveredQuote?.key === `${strike}-CE` ? <>
                            <span>Open <b>{formatPrice(hoveredQuote.open)}</b></span>
                            <span>High <b className="positive">{formatPrice(hoveredQuote.high)}</b></span>
                            <span>Low <b className="negative">{formatPrice(hoveredQuote.low)}</b></span>
                            <span>Current <b>{formatPrice(hoveredQuote.close)}</b></span>
                            <span>Prev close <b>{formatPrice(hoveredQuote.previousClose)}</b></span>
                            <em>Live · {new Date(hoveredQuote.updatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</em>
                          </> : <em>Loading Dhan quote…</em>}
                        </span>
                      )}
                    </button>
                    <button
                      className="strike"
                      data-strike-popover
                      onPointerEnter={() => setLevelPopoverStrike(strike)}
                      onPointerLeave={() => setLevelPopoverStrike((current) => current === strike ? null : current)}
                      onClick={() => {
                        if (!stockOnlyView) {
                          setChartsLoading(true);
                          setSelectedStrike(strike);
                        }
                        setLevelPopoverStrike(strike);
                      }}
                    >
                      {strike.toLocaleString('en-IN')}
                      {isAtm && <small>ATM</small>}
                      {levelPopoverStrike === strike && (
                        <span className="strike-popover" onPointerDown={(event) => event.stopPropagation()}>
                          <span className="strike-popover-title">{displayShort} · Underlying levels</span>
                          <span className="strike-level resistance"><small>Immediate resistance</small><b>{strikeResistance ? `${strikeResistance.label} · ${formatPrice(strikeResistance.value)}` : '—'}</b></span>
                          <span className="strike-level current"><small>Underlying spot</small><b>{formatPrice(strike)}</b></span>
                          <span className="strike-level support"><small>Immediate support</small><b>{strikeSupport ? `${strikeSupport.label} · ${formatPrice(strikeSupport.value)}` : '—'}</b></span>
                        </span>
                      )}
                    </button>
                    <button
                      className={`option-price chain-leg put-leg ${
                        selectedStrike === strike && side === 'PE'
                          ? 'selected'
                          : ''
                      }`}
                      onPointerEnter={() => row.pe && setHoveredOption({ key: `${strike}-PE`, securityId: row.pe.securityId })}
                      onPointerLeave={() => setHoveredOption((current) => current?.key === `${strike}-PE` ? null : current)}
                      onClick={() => {
                        setChartsLoading(true);
                        setSelectedStrike(strike);
                        setSide('PE');
                        setLevelPopoverStrike(null);
                      }}
                    >
                      <span className="chain-metric"><b>{formatPrice(pe)}</b><small className={pePointChange >= 0 ? 'positive' : 'negative'}>{pePointChange >= 0 ? '+' : ''}{formatPrice(pePointChange)} ({peChange >= 0 ? '+' : ''}{peChange.toFixed(1)}%)</small></span>
                      <span className={`chain-metric oi-strength support ${peOiPercent === 100 ? 'maximum' : peOiPercent > 80 ? 'strong' : peOiPercent === 80 ? 'threshold' : ''}`}><b>{peOiPercent}%</b><small>{formatOi(oi.pe)}</small></span>
                      <span className={`chain-metric oi-strength support ${peOiChangePercent === 100 ? 'maximum' : peOiChangePercent > 80 ? 'strong' : peOiChangePercent === 80 ? 'threshold' : ''}`}><b>{peOiChangePercent}%</b><small className={peOiChange >= 0 ? 'positive' : 'negative'}>{formatOi(peOiChange)}</small></span>
                      <span className={`chain-metric oi-strength support ${peVolumePercent === 100 ? 'maximum' : peVolumePercent > 80 ? 'strong' : peVolumePercent === 80 ? 'threshold' : ''}`}><b>{peVolumePercent}%</b><small>{formatOi(row.pe?.volume || 0)}</small></span>
                      {hoveredOption?.key === `${strike}-PE` && (
                        <span className="option-quote-popover put" role="tooltip">
                          <strong>{displayShort} {strike.toLocaleString('en-IN')} PE</strong>
                          {hoveredQuote?.key === `${strike}-PE` ? <>
                            <span>Open <b>{formatPrice(hoveredQuote.open)}</b></span>
                            <span>High <b className="positive">{formatPrice(hoveredQuote.high)}</b></span>
                            <span>Low <b className="negative">{formatPrice(hoveredQuote.low)}</b></span>
                            <span>Current <b>{formatPrice(hoveredQuote.close)}</b></span>
                            <span>Prev close <b>{formatPrice(hoveredQuote.previousClose)}</b></span>
                            <em>Live · {new Date(hoveredQuote.updatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</em>
                          </> : <em>Loading Dhan quote…</em>}
                        </span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="chain-foot">
            <div>
              <span>Max pain</span>
              <b>{atm.toLocaleString('en-IN')}</b>
            </div>
            <div>
              <span>ATM IV</span>
              <b>12.84%</b>
            </div>
            <div>
              <span>Updated</span>
              <b>
                {live
                  ? new Date(live.updatedAt).toLocaleTimeString('en-IN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'Disconnected'}
              </b>
            </div>
          </div>
        </aside>}
      </div> : (
        <PositionsView
          mode={paperMode}
          onModeChange={setPaperMode}
          positions={paperPositions}
          engineStatus={paperEngineStatus}
          snapshots={paperSnapshots}
        />
      )}
      <footer className="statusbar">
        <div>
          <span className="status-dot" /> {appView === 'MARKET' ? 'Live workspace' : 'Paper testing workspace'}
        </div>
        <div>
          {appView === 'MARKET' ? <>
            <Crosshair /> Crosshair <span className="divider" />
            <Layers3 /> Formula levels <span className="divider" />
            <BarChart3 /> {activeChart === 'UNDERLYING' ? underlyingTimeframe : optionTimeframe}
          </> : <>
            <BriefcaseBusiness /> ₹1,00,000 demo capital <span className="divider" />
            Strategy pending
          </>}
        </div>
      </footer>
    </main>
  );
}
