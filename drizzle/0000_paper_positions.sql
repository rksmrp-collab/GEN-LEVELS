CREATE TABLE IF NOT EXISTS paper_positions (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL DEFAULT 'FORWARD',
  asset TEXT NOT NULL,
  source_side TEXT NOT NULL,
  side TEXT NOT NULL,
  strike REAL NOT NULL,
  contract TEXT NOT NULL,
  expiry TEXT NOT NULL,
  security_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  signal_level REAL NOT NULL,
  open_time TEXT NOT NULL,
  close_time TEXT,
  quantity INTEGER NOT NULL,
  lot_size INTEGER NOT NULL,
  entry_price REAL NOT NULL,
  exit_price REAL,
  stop_price REAL NOT NULL,
  target_price REAL NOT NULL,
  pnl REAL NOT NULL DEFAULT 0,
  close_reason TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS paper_signals (
  signal_key TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_paper_positions_status_asset
ON paper_positions(status, asset);
CREATE INDEX IF NOT EXISTS idx_paper_positions_open_time
ON paper_positions(open_time DESC);
