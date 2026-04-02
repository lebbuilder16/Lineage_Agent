"""
Flag message templates — combinatorial system for varied, delta-aware alerts.

Each flag type has a list of template strings with {placeholders}.
A random template is picked at runtime and formatted with actual values.
With 6-8 templates per flag, each showing old→new deltas, users never
see the same message twice in a row.
"""

from __future__ import annotations

import random
from typing import Any

# ── Template registry ─────────────────────────────────────────────────────

TEMPLATES: dict[str, list[str]] = {

    # ── SOL Extraction (new) ──────────────────────────────────────────────
    "SOL_EXTRACTION_NEW": [
        "{new_sol:.1f} SOL drained through a {hops}-hop route — first extraction detected",
        "Funds moving out for the first time: {new_sol:.1f} SOL via {hops} hops",
        "New capital extraction: {new_sol:.1f} SOL funneled through {hops}-hop path",
        "First signs of drain — {new_sol:.1f} SOL extracted via hidden {hops}-hop route",
        "{new_sol:.1f} SOL just left through a {hops}-hop chain — extraction started",
        "Money is moving: {new_sol:.1f} SOL drained for the first time ({hops} hops)",
    ],

    # ── SOL Extraction (increased) ────────────────────────────────────────
    "SOL_EXTRACTION_INCREASED": [
        "+{delta:.1f} SOL drained since last scan (was {old_sol:.1f}, now {new_sol:.1f})",
        "Another {delta:.1f} SOL funneled out since last check · {new_sol:.1f} total",
        "Ongoing drain: +{delta:.1f} SOL since last scan · was {old_sol:.1f}, now {new_sol:.1f}",
        "Money still moving: {delta:.1f} SOL extracted since last check · {new_sol:.1f} total",
        "Fresh extraction: +{delta:.1f} SOL · total now {new_sol:.1f} (was {old_sol:.1f})",
        "{delta:.1f} more SOL drained since last scan — extraction continues ({new_sol:.1f} total)",
    ],

    # ── Deployer Exit ─────────────────────────────────────────────────────
    "DEPLOYER_EXITED": [
        "Deployer just sold everything (was still holding at last scan)",
        "Creator wallet is now empty — held tokens at last check, now zero",
        "Full deployer exit since last scan — all holdings liquidated",
        "The deployer dumped all remaining tokens since last check",
        "Deployer went from holding to zero since your last scan",
        "Creator cashed out completely — was still in at last scan",
    ],

    # ── Insider Dump ──────────────────────────────────────────────────────
    "INSIDER_DUMP_DETECTED": [
        "Insider dump started since last scan{sell_pressure} — was not dumping before",
        "Heavy insider selling detected (new since last check){sell_pressure}",
        "Insiders began dumping since last scan{sell_pressure}",
        "New signal: insider sell-off in progress{sell_pressure}",
        "Insider behavior changed since last scan — now actively dumping{sell_pressure}",
        "Insiders went from holding to selling since last check{sell_pressure}",
    ],

    # ── Bundle Detected ───────────────────────────────────────────────────
    "BUNDLE_DETECTED": [
        "Coordinated buying detected since last scan — wallets buying in sync",
        "New: bundle wallets spotted (not present at last check)",
        "Suspicious group activity appeared since last scan — coordinated buys",
        "Bundle pattern emerged since last check — multiple wallets acting together",
        "First signs of coordinated wallets since last scan",
        "New cluster of synchronized buyers found since last check",
    ],

    # ── Bundle Wallets New ────────────────────────────────────────────────
    "BUNDLE_WALLETS_NEW": [
        "+{delta} coordinated wallets since last scan (was {old}, now {new})",
        "Bundle network grew by {delta} wallets since last check · {new} total",
        "{delta} more bundled buyers discovered since last scan · was {old}, now {new}",
        "Coordinated group expanding: +{delta} wallets since last check ({new} total)",
        "More wallets joined the bundle since last scan — {old} → {new}",
        "{delta} new synchronized wallets found · group now at {new} (was {old})",
    ],

    # ── Cartel Detected ───────────────────────────────────────────────────
    "CARTEL_DETECTED": [
        "Deployer linked to a {wallets}-wallet network launching tokens together",
        "Connected to a ring of {wallets} coordinated wallets — first detection",
        "New: this deployer operates within a {wallets}-wallet cartel",
        "Coordinated network found: {wallets} wallets working together",
        "First cartel signal — deployer part of a {wallets}-wallet operation",
        "{wallets} linked wallets discovered around this deployer",
    ],

    # ── Cartel Expanded ───────────────────────────────────────────────────
    "CARTEL_EXPANDED": [
        "+{delta} wallets joined the ring since last scan (was {old}, now {new})",
        "Network grew by {delta} addresses since last check · {new} linked wallets total",
        "{delta} new wallets connected since last scan — cartel now {new} strong",
        "The coordinated group expanded: +{delta} since last check (was {old}, now {new})",
        "Ring is growing: {delta} new addresses joined since last scan · {new} total",
        "More wallets linked since last check — {old} → {new} (+{delta})",
    ],

    # ── Risk Escalation ──────────────────────────────────────────────────
    "RISK_ESCALATION": [
        "Risk jumped from {old} to {new} since last scan",
        "Elevated since last check — was {old}, now rated {new}",
        "Risk upgrade since last scan: {old} → {new}",
        "Worse than last check — risk went from {old} to {new}",
        "Risk level changed since last scan: {old} → {new}",
        "Deteriorated: was {old} at last check, now {new}",
    ],

    # ── Deployer New Rug ──────────────────────────────────────────────────
    "DEPLOYER_NEW_RUG": [
        "This deployer just rugged another token since last scan ({new} total rugs)",
        "New rug confirmed since last check — {old} → {new} rugs by this deployer",
        "+{delta} rug since last scan · this deployer now has {new} confirmed rugs",
        "Deployer rugged again since last check: was {old} rugs, now {new}",
        "Another token rugged since last scan — deployer at {new} total rugs",
        "Fresh rug by this deployer since your last check ({new} total, was {old})",
    ],

    # ── Sell Pressure Spike ───────────────────────────────────────────────
    "SELL_PRESSURE_SPIKE": [
        "Sell pressure jumped from {old:.0f}% to {new:.0f}% since last scan",
        "Heavy selling since last check — pressure went {old:.0f}% → {new:.0f}%",
        "Sellers took over since last scan: {old:.0f}% → {new:.0f}% sell ratio",
        "Selling intensified since last check — {new:.0f}% pressure (was {old:.0f}%)",
        "Big shift since last scan: sell pressure {old:.0f}% → {new:.0f}%",
        "Sell ratio spiked since last check — from {old:.0f}% to {new:.0f}%",
    ],

    # ── Bundle Wallet Exit ────────────────────────────────────────────────
    "BUNDLE_WALLET_EXIT": [
        "{exits} bundled wallets cashed out since last scan · {holding} still in",
        "{exits} coordinated wallets sold since last check · {holding} remaining",
        "Bundle exit: {exits} wallets sold since last scan ({holding} still holding)",
        "{exits} bundle wallets dumped since last check · {holding} haven't moved yet",
        "Since last scan: {exits} bundled wallets exited · {holding} still in position",
        "{exits} from the coordinated group sold since last check · {holding} left",
    ],

    # ── Bundle All Exited ─────────────────────────────────────────────────
    "BUNDLE_WALLETS_ALL_EXITED": [
        "Every bundled wallet has sold — the coordinated group is fully out",
        "Complete bundle exit — zero holders left from the coordinated group",
        "All bundle wallets exited since last scan — you may be holding alone",
        "The entire coordinated group cashed out — no bundle wallets left",
        "Full extraction: every bundle wallet sold their position",
        "Nobody left: all bundled wallets exited since last check",
    ],

    # ── Cumulative Price Crash ────────────────────────────────────────────
    "CUMULATIVE_PRICE_CRASH": [
        "Down {pct:.0f}% since you started watching · was ${ref:.6f}, now ${now:.6f}",
        "Lost more than half its value since you added it ({pct:+.0f}%)",
        "Price collapsed {pct:+.0f}% since watchlist add · ${ref:.6f} → ${now:.6f}",
        "Massive decline since you started watching: {pct:+.0f}%",
        "{pct:+.0f}% since added to your watchlist — price in freefall",
        "Down hard since you added it: ${ref:.6f} → ${now:.6f} ({pct:+.0f}%)",
    ],

    # ── Cumulative Price Decline ──────────────────────────────────────────
    "CUMULATIVE_PRICE_DECLINE": [
        "Steady decline: {pct:+.0f}% since you added it",
        "Price sliding since watchlist add — down {pct:.0f}% overall",
        "Losing value: {pct:+.0f}% since you started watching",
        "Gradual drop since added — {pct:+.0f}% total",
        "{pct:+.0f}% since added to watchlist — slow bleed",
        "Price eroding: {pct:+.0f}% since you started tracking",
    ],

    # ── Cumulative Liquidity Drain ────────────────────────────────────────
    "CUMULATIVE_LIQ_DRAIN": [
        "Liquidity gutted — {pct:.0f}% gone since you started watching",
        "More than half the liquidity pulled since watchlist add ({pct:+.0f}%)",
        "Massive liquidity drain: {pct:+.0f}% since you added this token",
        "Liquidity disappearing — {pct:+.0f}% since added to watchlist",
        "{pct:+.0f}% liquidity gone since you started watching — exit getting harder",
        "Pool drying up: {pct:+.0f}% liquidity drained since watchlist add",
    ],

    # ── Cumulative SOL Extraction ─────────────────────────────────────────
    "CUMULATIVE_SOL_EXTRACTION": [
        "{delta:.0f} SOL siphoned since you started watching (was {ref:.0f}, now {now:.0f})",
        "Ongoing extraction: {delta:.0f} SOL drained since watchlist add",
        "Capital still flowing out — {delta:.0f} SOL extracted since you added it",
        "{delta:.0f} more SOL extracted since you started watching · {now:.0f} total",
        "Drain continues: +{delta:.0f} SOL since watchlist add ({ref:.0f} → {now:.0f})",
        "Since you added it: {delta:.0f} SOL extracted ({now:.0f} total now)",
    ],

    # ── Cross: Deployer Exit + Bundle Active ──────────────────────────────
    "CROSS_DEPLOYER_EXIT_BUNDLE_ACTIVE": [
        "Creator just exited but {bundle} bundle wallets unchanged — dump likely",
        "Deployer sold everything since last scan · {bundle} coordinated wallets still holding",
        "Deployer out since last check · {bundle} bundled wallets haven't moved — watch closely",
        "Deployer cashed out while {bundle} bundle wallets stay — delayed dump?",
        "Creator went from holding to zero · {bundle} coordinated wallets still in position",
        "Fresh deployer exit but {bundle} bundle wallets remain — be ready for their move",
        "The creator is out since last scan — {bundle} bundled wallets still haven't sold",
        "Red flag: deployer exited while {bundle} coordinated wallets hold steady",
    ],

    # ── Cross: Deployer Exit + Cartel Active ──────────────────────────────
    "CROSS_DEPLOYER_EXIT_CARTEL_ACTIVE": [
        "Creator exited but the {cartel}-wallet network is still operating",
        "Deployer gone since last scan while cartel of {cartel} wallets remains active",
        "The deployer walked away, leaving a {cartel}-wallet ring still in play",
        "Creator out · {cartel}-wallet cartel still active — proceed with caution",
        "Deployer cashed out but the {cartel}-wallet network keeps running",
        "Deployer exit + {cartel} cartel wallets still operating — coordinated scheme?",
        "The deployer left since last scan — the {cartel}-wallet ring continues without them",
        "Creator gone, cartel stays: {cartel} wallets still active after deployer exit",
    ],

    # ── Cross: Rug Pattern ────────────────────────────────────────────────
    "CROSS_RUG_PATTERN": [
        "Deployer exit + {sol:.0f} SOL drain + price {pct:+.0f}% since last scan — rug signature",
        "Since last check: creator out, {sol:.0f} SOL extracted, price {pct:+.0f}% — classic rug",
        "All the signs: deployer gone · {sol:.0f} SOL drained · {pct:+.0f}% price drop",
        "Rug pattern: deployer exited + {sol:.0f} SOL out + price crashed {pct:+.0f}%",
        "Creator out, {sol:.0f} SOL gone, price {pct:+.0f}% — this looks like a rug",
        "Multiple red flags: exit + {sol:.0f} SOL drain + {pct:+.0f}% crash",
        "Classic rug: deployer exit + {sol:.0f} SOL extraction + {pct:+.0f}% collapse",
        "The deployer left with {sol:.0f} SOL — price down {pct:.0f}% — rug in progress",
    ],

    # ── Cross: Coordinated Extraction ─────────────────────────────────────
    "CROSS_COORDINATED_EXTRACTION": [
        "Full coordinated exit — insiders dumped and all bundle wallets sold",
        "Everyone is out: insider dump + every bundled wallet exited",
        "Complete extraction: insider selling + bundle wallets all cashed out",
        "Nobody left: insiders dumped, bundle wallets gone — coordinated exit",
        "Both insiders and bundle wallets sold since last scan — total extraction",
        "Insiders + bundle wallets all exited — you may be the last holder",
        "Coordinated selloff complete: insiders and bundled wallets both out",
        "Double exit since last check: insiders dumped + bundle wallets sold",
    ],

    # ── Cross: Serial Scam Ring ───────────────────────────────────────────
    "CROSS_SERIAL_SCAM_RING": [
        "Serial scam ring: {cartel} wallets, {rugs} confirmed rugs by this deployer",
        "Repeat offender: {rugs} rugs across a {cartel}-wallet network",
        "High-risk cartel: {cartel} linked wallets with {rugs} known rug pulls",
        "{cartel}-wallet network with {rugs} past rugs — serial scammer pattern",
        "This deployer has {rugs} confirmed rugs within a {cartel}-wallet operation",
        "Known scam ring: {rugs} rugs, {cartel} connected wallets",
        "Pattern of fraud: {rugs} rugs from a {cartel}-wallet coordinated network",
        "Repeat scammer in a {cartel}-wallet ring — {rugs} tokens rugged so far",
    ],

    # ── Cross: Extraction + Bundle Exit ───────────────────────────────────
    "CROSS_EXTRACTION_AND_EXIT": [
        "Double signal: {sol:.0f} SOL extracted + all bundle wallets sold",
        "Active drain ({sol:.0f} SOL) while every coordinated wallet exited",
        "Extraction in progress ({sol:.0f} SOL) and bundle team is gone",
        "{sol:.0f} SOL drained + all bundled wallets out — active extraction",
        "Everyone left and the money is flowing: {sol:.0f} SOL out + bundle exit complete",
        "Bundle wallets sold + {sol:.0f} SOL extracted — nothing left to hold for",
        "Complete bundle exit + {sol:.0f} SOL drainage — two critical signals at once",
        "All coordinated wallets gone while {sol:.0f} SOL keeps draining out",
    ],
}


def render_flag(flag_type: str, **kwargs: Any) -> str:
    """Pick a random template for *flag_type* and format it with *kwargs*.

    Falls back to a generic "{flag_type}: {key=value}" if no template found
    or if formatting fails.
    """
    templates = TEMPLATES.get(flag_type)
    if not templates:
        parts = [f"{k}={v}" for k, v in kwargs.items() if v is not None]
        return f"{flag_type}: {', '.join(parts)}" if parts else flag_type

    # Try up to 3 templates in case one has missing keys
    shuffled = random.sample(templates, min(3, len(templates)))
    for tmpl in shuffled:
        try:
            return tmpl.format(**kwargs)
        except (KeyError, ValueError, IndexError):
            continue

    # Last resort: first template with best-effort formatting
    try:
        return templates[0].format_map(kwargs)
    except Exception:
        return flag_type
