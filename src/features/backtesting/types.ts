export type Side = 'long' | 'short';

export type Bar = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

export type Fees = {
  takerPct: number; // 0.1 = 10 bps per fill
  slippageBps: number; // added against trader on every fill
};

export type RiskConfig = {
  initialBalance: number;
  riskPerTradePct: number;
  atrPeriod: number;
  stopAtrMult: number;
  takeProfitR: number;
  trailing: boolean;
};

export type Position = {
  side: Side;
  entryT: number;
  entryIdx: number;
  entryPrice: number;
  stopPrice: number;
  takeProfitPrice: number;
  qty: number;
  initialStop: number;
  peakExtreme: number; // used for trailing (max close for long, min close for short)
};

export type Trade = {
  side: Side;
  entryT: number;
  exitT: number;
  entryPrice: number;
  exitPrice: number;
  qty: number;
  stopPrice: number;
  takeProfitPrice: number;
  pnl: number; // net of fees
  pnlPct: number; // pnl / (entryPrice * qty)
  rMultiple: number; // pnl / initial risk in quote
  reason: 'stop' | 'take-profit' | 'signal' | 'end-of-series';
  barsHeld: number;
  fees: number;
};

export type Signal = 'enter-long' | 'enter-short' | 'exit' | null;

export type StrategyContext = {
  bars: Bar[];
  series: Record<string, (number | null)[]>;
  params: Record<string, number>;
};

export type Strategy = {
  name: string;
  description: string;
  defaults: Record<string, number>;
  prepare: (bars: Bar[], params: Record<string, number>) => StrategyContext;
  signal: (ctx: StrategyContext, i: number, openPos: Position | null) => Signal;
};

export type BacktestConfig = {
  bars: Bar[];
  strategy: Strategy;
  params: Record<string, number>;
  risk: RiskConfig;
  fees: Fees;
  allowedSides: ReadonlyArray<Side>;
};

export type EquityPoint = { t: number; equity: number };

export type Metrics = {
  initialBalance: number;
  finalBalance: number;
  totalReturnPct: number;
  cagrPct: number | null;
  maxDrawdownPct: number;
  maxDrawdownDurationBars: number;
  sharpe: number | null;
  sortino: number | null;
  trades: number;
  wins: number;
  losses: number;
  winRatePct: number;
  profitFactor: number | null;
  expectancy: number;
  avgWin: number;
  avgLoss: number;
  payoffRatio: number | null;
  avgRMultiple: number;
  avgBarsHeld: number;
  exposurePct: number;
  buyHoldReturnPct: number;
};

export type BacktestResult = {
  symbol?: string;
  strategy: string;
  params: Record<string, number>;
  risk: RiskConfig;
  fees: Fees;
  metrics: Metrics;
  trades: Trade[];
  equity: EquityPoint[];
};
