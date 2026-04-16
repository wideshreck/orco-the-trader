---
name: risk_first
description: When the user mentions account size, risk tolerance, position sizing, or "how much should I buy". Risk-management-first workflow.
---

# Risk-First Playbook

Use this whenever the user mentions their account size, asks "how much should I buy", or when you're about to recommend a position size.

## Gather before computing

You need four numbers:
1. **Balance** — the user's available capital in quote currency (usually USDT). Ask if not stated.
2. **Risk per trade** — what % of balance they're willing to lose on this trade. If the user hasn't said, default to 1% and state the assumption explicitly.
3. **Entry price** — from the analysis or the user's plan.
4. **Stop-loss price** — from the analysis. This must exist before sizing. If no stop exists, build one first (ATR-based or structural).

## Compute

Call `position_size` with all four numbers plus any take-profit the analysis suggests. Read the output:
- `qty` — how much of the base asset to buy/sell.
- `notional` — the USD value of the position.
- `marginRequired` — if leveraged, the collateral needed.
- `rr` — reward-to-risk ratio (present only when TP is provided). Below 1.5 is generally not worth taking.
- `stopDistancePct` — how far the stop is in %. Above 5% on spot is wide; below 0.3% is noise-vulnerable.

## Present

Always show:
- The assumed risk parameters (balance, risk %, leverage)
- Stop distance in both price and %
- Quantity in base asset
- Notional in USDT
- R:R if a take-profit was given
- A one-sentence plain-language summary: "Risking $X for a potential $Y (R:R Z), buying N units at $P with stop at $S."

## Guardrails

- If notional > balance (possible with leverage), flag it: "this position is larger than your account at X× leverage — a fast adverse move past the stop can liquidate."
- If `stopDistancePct` < 0.3%, warn about noise.
- If `rr` < 1.0, recommend skipping the trade outright: "even a 60% win rate loses money at 0.8R."
- Never present a size without a stop-loss — the two are inseparable.

## When the user changes parameters

If they say "what if I risk 2% instead", re-run `position_size` with the new number and present a side-by-side comparison. Don't estimate — recompute.
