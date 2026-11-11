export type OptionCandle = { timestamp: number; open: number; low: number; high: number; close: number };

export function tradingDate(timestamp = Date.now() / 1000) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(timestamp * 1000));
}

export function tradingDayCandles<T extends OptionCandle>(candles: T[], date = tradingDate()) {
  return candles.filter((candle) => tradingDate(candle.timestamp) === date)
    .sort((a, b) => a.timestamp - b.timestamp);
}

export function calculateOptionLevels(dayOpen: number) {
  if (!Number.isFinite(dayOpen) || dayOpen <= 0) return [];
  const baseValue = 2 * Math.sqrt(dayOpen);
  return Array.from({ length: 16 }, (_, index) => {
    const i = index + 1;
    const multiplier = i * 0.75;
    return { i, multiplier, label: `T${multiplier}`,
      upper: dayOpen + multiplier * baseValue,
      lower: dayOpen - multiplier * baseValue };
  });
}

export function optionTriggerLevels(dayOpen: number) {
  const levels = calculateOptionLevels(dayOpen);
  return { lowerT3: levels[3]?.lower, upperT3: levels[3]?.upper, nextLower: levels[4]?.lower };
}

export function nextOptionLevelBelow(dayOpen: number, price: number) {
  // Include the day-open line and both sides of the calculated grid.
  const candidates = [dayOpen, ...calculateOptionLevels(dayOpen).flatMap((level) => [level.lower, level.upper])]
    .filter((value) => value > 0 && value < price);
  return candidates.length ? Math.max(...candidates) : undefined;
}

export function touchesOptionLevel(candle: OptionCandle, level: number | undefined) {
  return level !== undefined && level > 0 && candle.low <= level && candle.high >= level;
}
