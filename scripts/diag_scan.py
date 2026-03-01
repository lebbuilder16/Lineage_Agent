#!/usr/bin/env python3
"""
Diagnostic scan — analyse complète du pipeline pour 2 tokens.
Usage:
    cd /workspaces/Lineage_Agent
    PYTHONPATH=src python3 scripts/diag_scan.py
"""
from __future__ import annotations

import asyncio
import logging
import sys
import time
import traceback
from dataclasses import dataclass, field
from typing import Any, Optional

logging.basicConfig(
    format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
    level=logging.INFO, stream=sys.stdout,
)
for _q in ("httpx", "httpcore", "PIL", "asyncio"):
    logging.getLogger(_q).setLevel(logging.WARNING)
log = logging.getLogger("diag_scan")

TOKENS = [
    ("8GC4kBVgREoeQcZJAr1prxtfqW67RSu411aCqeaCpump", "Token A"),
    ("FMxSCrEzCqsCPFvr3cs7WnFzFgw9kEKCapaPEbMepump", "Token B"),
]

@dataclass
class StepResult:
    name: str
    ok: bool
    value: Any = None
    error: str = ""
    duration_ms: float = 0.0
    warnings: list[str] = field(default_factory=list)
    extra: dict = field(default_factory=dict)  # arbitrary metadata

@dataclass
class TokenReport:
    mint: str
    label: str
    deployer: str = ""
    steps: list[StepResult] = field(default_factory=list)
    gaps: list[str] = field(default_factory=list)

def _ms(t0: float) -> float:
    return (time.perf_counter() - t0) * 1000

# ──────────────────────────────────────────────────────────────────────────────
# Probes
# ──────────────────────────────────────────────────────────────────────────────

async def probe_dexscreener(mint, dex) -> tuple[StepResult, dict]:
    t0 = time.perf_counter()
    meta: dict = {}
    try:
        pairs = await dex.get_token_pairs(mint)
        dur = _ms(t0)
        if not pairs:
            return StepResult("1. DexScreener pairs", ok=False, duration_ms=dur,
                              error="0 pairs — token non indexé ou trop nouveau"), meta
        best = max(pairs, key=lambda p: (p.get("liquidity") or {}).get("usd") or 0)
        tok = best.get("baseToken") or {}
        inf = best.get("info") or {}
        meta = dict(name=tok.get("name",""), symbol=tok.get("symbol",""),
                    mcap=best.get("marketCap") or best.get("fdv") or 0,
                    liq=(best.get("liquidity") or {}).get("usd") or 0,
                    pairs=len(pairs), image=inf.get("imageUrl",""),
                    dex_url=best.get("url",""))
        warns = []
        if not meta["image"]:   warns.append("pas d'image → pHash impossible → détection visuelle aveugle")
        if meta["mcap"] == 0:   warns.append("mcap=0 sur DexScreener")
        if meta["liq"] < 500:   warns.append(f"liquidité très faible ${meta['liq']:.0f}")
        return StepResult("1. DexScreener pairs", ok=True, duration_ms=dur,
            value=f"{meta['name']} ({meta['symbol']})  mcap=${meta['mcap']:,.0f}  liq=${meta['liq']:,.0f}  pairs={meta['pairs']}",
            warnings=warns), meta
    except Exception as e:
        return StepResult("1. DexScreener pairs", ok=False, error=str(e), duration_ms=_ms(t0)), meta

async def probe_dex_search(name, mint, dex) -> StepResult:
    if not name:
        return StepResult("2. DexScreener search (famille)", ok=False, error="nom inconnu — ignoré")
    t0 = time.perf_counter()
    try:
        results = await dex.search_tokens(name)
        dur = _ms(t0)
        found_self = any((p.get("baseToken") or {}).get("address","") == mint for p in results)
        warns = []
        if not found_self:
            warns.append("token ABSENT des résultats → famille potentiellement non découverte")
        return StepResult("2. DexScreener search (famille)", ok=True, duration_ms=dur,
            value=f"'{name}' → {len(results)} résultats  self_found={found_self}", warnings=warns)
    except Exception as e:
        return StepResult("2. DexScreener search (famille)", ok=False, error=str(e), duration_ms=_ms(t0))

async def probe_rpc_asset(mint, rpc) -> tuple[StepResult, str, str]:
    t0 = time.perf_counter()
    deployer = uri = ""
    try:
        asset = await rpc.get_asset(mint)
        dur = _ms(t0)
        if not asset:
            return StepResult("3. RPC getAsset (DAS)", ok=False, duration_ms=dur,
                              error="réponse null — mint introuvable on-chain"), deployer, uri
        content = asset.get("content") or {}
        meta = content.get("metadata") or {}
        uri = content.get("json_uri") or (content.get("links") or {}).get("external_url","")
        image = (content.get("links") or {}).get("image","")
        creators = asset.get("creators") or []
        deployer = creators[0].get("address","") if creators else ""
        if not deployer:
            deployer = ((asset.get("authorities") or [{}])[0]).get("address","")
        warns = []
        if not deployer: warns.append("déployeur introuvable dans DAS")
        if not uri:      warns.append("json_uri absent → fingerprint DNA impossible")
        if not image:    warns.append("image absente dans DAS links")
        name = meta.get("name",""); symbol = meta.get("symbol","")
        return StepResult("3. RPC getAsset (DAS)", ok=True, duration_ms=dur,
            value=f"name={name!r}  deployer={deployer[:16]}…  uri={'✓' if uri else '✗'}  img={'✓' if image else '✗'}",
            warnings=warns), deployer, uri
    except Exception as e:
        return StepResult("3. RPC getAsset (DAS)", ok=False,
                          error=traceback.format_exc(limit=2), duration_ms=_ms(t0)), deployer, uri

async def probe_oldest_sig(mint: str, rpc) -> tuple[StepResult, str]:
    """Always run sig-walk directly on the mint, independent of DAS deployer."""
    t0 = time.perf_counter()
    try:
        from lineage_agent.data_sources.solana_rpc import SolanaRpcClient
        deployer_found, ts = await asyncio.wait_for(
            rpc.get_deployer_and_timestamp(mint), timeout=20.0
        )
        dur = _ms(t0)
        warns = []
        if not deployer_found:
            warns.append("deployer non résolu via sig-walk — mint trop jeune, signatures purgées ou PumpFun tx-history trop longue")
        return StepResult("4. RPC oldest signature", ok=True, duration_ms=dur,
            value=f"deployer={deployer_found[:16] + '…' if deployer_found else 'N/A'}  ts={ts}",
            warnings=warns), deployer_found
    except asyncio.TimeoutError:
        return StepResult("4. RPC oldest signature", ok=False, duration_ms=_ms(t0),
                          error="timeout 20s — historique trop long ou RPC lent"), ""
    except Exception as e:
        return StepResult("4. RPC oldest signature", ok=False, error=str(e), duration_ms=_ms(t0)), ""

async def probe_image_phash(image_url, img_client) -> tuple[StepResult, Optional[str]]:
    if not image_url:
        return StepResult("5. Image pHash", ok=False, error="URL d'image absente"), None
    t0 = time.perf_counter()
    try:
        import io, imagehash
        from PIL import Image
        resp = await asyncio.wait_for(img_client.get(image_url), timeout=10.0)
        dur = _ms(t0)
        if resp.status_code != 200:
            return StepResult("5. Image pHash", ok=False, duration_ms=dur,
                              error=f"HTTP {resp.status_code}"), None
        img = Image.open(io.BytesIO(resp.content)).convert("RGB")
        h = str(imagehash.phash(img))
        return StepResult("5. Image pHash", ok=True, duration_ms=dur,
                          value=f"hash={h}  size={img.size}"), h
    except ImportError:
        return StepResult("5. Image pHash", ok=False, error="imagehash/PIL non installé"), None
    except asyncio.TimeoutError:
        return StepResult("5. Image pHash", ok=False, duration_ms=_ms(t0),
                          error="timeout 10s — image inaccessible"), None
    except Exception as e:
        return StepResult("5. Image pHash", ok=False, error=str(e), duration_ms=_ms(t0)), None

async def probe_dna(mint, uri) -> tuple[StepResult, Optional[str]]:
    if not uri:
        return StepResult("6. DNA fingerprint", ok=False,
                          error="json_uri absent → fingerprint impossible"), None
    t0 = time.perf_counter()
    try:
        from lineage_agent.metadata_dna_service import _get_fingerprint
        result = await asyncio.wait_for(_get_fingerprint(mint, uri), timeout=10.0)
        dur = _ms(t0)
        if result is None:
            return StepResult("6. DNA fingerprint", ok=False, duration_ms=dur,
                              error="_get_fingerprint → None (description vide ou URI inaccessible)",
                              warnings=["description vide → opérateur non identifiable"]), None
        fp, desc_norm = result
        warns = ["desc_norm vide → faible discrimination"] if not desc_norm else []
        return StepResult("6. DNA fingerprint", ok=True, duration_ms=dur,
                          value=f"fp={fp[:24]}…  desc_norm={desc_norm[:60]!r}", warnings=warns), fp
    except asyncio.TimeoutError:
        return StepResult("6. DNA fingerprint", ok=False, duration_ms=_ms(t0),
                          error="timeout 10s — URI off-chain inaccessible"), None
    except Exception as e:
        return StepResult("6. DNA fingerprint", ok=False, error=str(e), duration_ms=_ms(t0)), None

async def probe_bundle(mint, deployer) -> StepResult:
    if not deployer:
        return StepResult("7. Bundle analysis", ok=False, error="déployeur manquant")
    t0 = time.perf_counter()
    try:
        from lineage_agent.bundle_tracker_service import analyze_bundle
        report = await asyncio.wait_for(analyze_bundle(mint, deployer), timeout=35.0)
        dur = _ms(t0)
        if report is None:
            return StepResult("7. Bundle analysis", ok=False, duration_ms=dur,
                              error="analyze_bundle → None",
                              warnings=["bundle non analysé → extraction de SOL non quantifiée"])
        verdict = getattr(report, "overall_verdict", "?")
        n_wallets = len(getattr(report, "bundle_wallets", []) or [])
        sol_spent = getattr(report, "total_sol_spent_by_bundle", 0) or 0
        sol_ext = getattr(report, "total_sol_extracted_confirmed", 0) or 0
        warns = []
        if verdict in ("insufficient_data","no_bundle_detected") and n_wallets == 0:
            warns.append(f"verdict={verdict} — lancement léger ou signatures RPC purgées (>30min)")
        return StepResult("7. Bundle analysis", ok=True, duration_ms=dur,
            value=f"verdict={verdict}  wallets={n_wallets}  sol_spent={sol_spent:.4f}  sol_extracted={sol_ext:.4f}",
            warnings=warns)
    except asyncio.TimeoutError:
        return StepResult("7. Bundle analysis", ok=False, duration_ms=_ms(t0),
                          error="TIMEOUT >35s — trop de signatures",
                          warnings=["bundle trop lent → verdict manquant sur la coordination d'achat"])
    except Exception as e:
        return StepResult("7. Bundle analysis", ok=False,
                          error=traceback.format_exc(limit=3), duration_ms=_ms(t0))

async def probe_sol_flow(mint, deployer) -> StepResult:
    if not deployer:
        return StepResult("8. SOL flow trace", ok=False, error="déployeur manquant")
    t0 = time.perf_counter()
    try:
        from lineage_agent.sol_flow_service import trace_sol_flow
        report = await asyncio.wait_for(trace_sol_flow(mint, deployer), timeout=30.0)
        dur = _ms(t0)
        if report is None:
            return StepResult("8. SOL flow trace", ok=False, duration_ms=dur, error="None retourné")
        n_edges = len(getattr(report, "edges", []) or [])
        total_sol = getattr(report, "total_sol_traced", 0) or 0
        n_dests = len(getattr(report, "destination_labels", {}) or {})
        warns = ["0 edge SOL — wallet jetable ou fonds non encore bougés"] if n_edges == 0 else []
        return StepResult("8. SOL flow trace", ok=True, duration_ms=dur,
            value=f"edges={n_edges}  total_sol={total_sol:.4f}  destinations={n_dests}", warnings=warns)
    except asyncio.TimeoutError:
        return StepResult("8. SOL flow trace", ok=False, duration_ms=_ms(t0),
                          error="TIMEOUT >30s",
                          warnings=["flux SOL partiel — destination des fonds inconnue"])
    except Exception as e:
        return StepResult("8. SOL flow trace", ok=False,
                          error=traceback.format_exc(limit=3), duration_ms=_ms(t0))

async def probe_full_pipeline(mint) -> tuple[StepResult, Any]:
    t0 = time.perf_counter()
    try:
        from lineage_agent.lineage_detector import detect_lineage
        result = await asyncio.wait_for(detect_lineage(mint), timeout=120.0)
        dur = _ms(t0)
        warns = []
        if result.root is None:              warns.append("root=None — origine non déterminée")
        if result.confidence < 0.5:          warns.append(f"confiance faible ({result.confidence:.0%})")
        if result.family_size <= 1:          warns.append("family_size=1 — aucune famille détectée")
        if not result.zombie_alert:          warns.append("zombie_alert=None — résurrection non vérifiée")
        if not result.operator_fingerprint:  warns.append("operator_fingerprint=None — opérateur non identifié")
        if not result.bundle_report:         warns.append("bundle_report=None — bundle non calculé")
        if not result.sol_flow:              warns.append("sol_flow=None — flux SOL non tracé")
        if not result.death_clock:           warns.append("death_clock=None — prévision de rug absente")
        return StepResult("9. Pipeline complet detect_lineage", ok=True, duration_ms=dur,
            value=(f"root={result.root.name if result.root else 'NONE'}  "
                   f"conf={result.confidence:.0%}  family={result.family_size}  "
                   f"derivatives={len(result.derivatives)}"),
            warnings=warns), result
    except asyncio.TimeoutError:
        return StepResult("9. Pipeline complet detect_lineage", ok=False,
                          error="TIMEOUT >120s", duration_ms=_ms(t0)), None
    except Exception as e:
        return StepResult("9. Pipeline complet detect_lineage", ok=False,
                          error=traceback.format_exc(limit=5), duration_ms=_ms(t0)), None

# ──────────────────────────────────────────────────────────────────────────────

async def scan_token(mint, label) -> tuple[TokenReport, Any]:
    from lineage_agent.data_sources._clients import init_clients, get_dex_client, get_rpc_client, get_img_client
    await init_clients()
    dex = get_dex_client(); rpc = get_rpc_client(); img = get_img_client()

    report = TokenReport(mint=mint, label=label)
    log.info("╔══ SCAN %s (%s) ══", label, mint)

    step, dex_meta = await probe_dexscreener(mint, dex);             report.steps.append(step)
    step = await probe_dex_search(dex_meta.get("name",""), mint, dex); report.steps.append(step)
    step, deployer_das, uri = await probe_rpc_asset(mint, rpc);      report.steps.append(step)
    # Step 4: sig-walk always runs on the mint directly (not blocked by empty DAS deployer)
    step, deployer_sigwalk = await probe_oldest_sig(mint, rpc);      report.steps.append(step)
    # Best deployer = DAS first (more reliable when available), sig-walk as fallback
    deployer = deployer_das or deployer_sigwalk
    report.deployer = deployer
    step, phash = await probe_image_phash(dex_meta.get("image",""), img)
    step.extra["phash"] = phash; report.steps.append(step)
    step, fp = await probe_dna(mint, uri)
    step.extra["fp"] = fp; report.steps.append(step)
    log.info("  ⏳ Bundle (≤35s)…")
    step = await probe_bundle(mint, deployer);                       report.steps.append(step)
    log.info("  ⏳ SOL flow (≤30s)…")
    step = await probe_sol_flow(mint, deployer);                     report.steps.append(step)
    log.info("  ⏳ Pipeline complet (≤120s)…")
    step, lineage_result = await probe_full_pipeline(mint);          report.steps.append(step)

    for s in report.steps:
        if not s.ok:
            report.gaps.append(f"[FAIL] {s.name}: {s.error[:120]}")
        for w in s.warnings:
            report.gaps.append(f"[WARN] {s.name}: {w}")

    log.info("╚══ FIN %s — %d lacunes\n", label, len(report.gaps))
    return report, lineage_result

def print_report(report: TokenReport) -> None:
    W = 78
    print(f"\n{'═'*W}")
    print(f"  RAPPORT — {report.label}  |  {report.mint}")
    print(f"  Déployeur : {report.deployer or '(inconnu)'}")
    print("═"*W)
    ok = sum(1 for s in report.steps if s.ok)
    ko = sum(1 for s in report.steps if not s.ok)
    tt = sum(s.duration_ms for s in report.steps)
    print(f"  {ok} ✅  {ko} ❌   temps total : {tt/1000:.1f}s\n")
    for s in report.steps:
        icon = "✅" if s.ok else "❌"
        print(f"  {icon} [{s.duration_ms:>7.0f}ms]  {s.name}")
        if s.ok and s.value:
            for l in str(s.value)[:200].split("\n"): print(f"             → {l}")
        if s.error:
            for l in str(s.error)[:300].split("\n"): print(f"             ✗ {l}")
        for w in s.warnings: print(f"             ⚠  {w}")
    print(f"\n  {'─'*70}")
    print(f"  LACUNES ({len(report.gaps)})")
    print(f"  {'─'*70}")
    ICONS = {"FAIL":"❌","WARN":"⚠ ","GAP":"🔍","PIPELINE":"🔧"}
    for i, gap in enumerate(report.gaps, 1):
        tag, _, msg = gap.partition("] "); tag = tag.lstrip("[")
        print(f"  {i:>2}. {ICONS.get(tag,'•')} [{tag}]  {msg}")
    print("═"*W)

async def main() -> None:
    from lineage_agent.data_sources._clients import close_clients
    reports, results = [], []
    try:
        for mint, label in TOKENS:
            r, lr = await scan_token(mint, label)
            reports.append(r); results.append(lr)
    finally:
        await close_clients()

    for r in reports: print_report(r)

    print("\n" + "═"*78)
    print("  COMPARAISON INTER-TOKENS")
    print("═"*78)
    if len(reports) == 2:
        ra, rb = reports
        same_d = ra.deployer and rb.deployer and ra.deployer == rb.deployer
        print(f"  Déployeur A : {ra.deployer or '?'}")
        print(f"  Déployeur B : {rb.deployer or '?'}")
        print(f"  Même déployeur : {'🚨 OUI' if same_d else 'Non'}")

        fp_a = next((s.extra.get("fp") for s in ra.steps if s.name.startswith("6.")), None)
        fp_b = next((s.extra.get("fp") for s in rb.steps if s.name.startswith("6.")), None)
        same_fp = fp_a and fp_b and fp_a == fp_b
        print(f"  DNA fp A : {fp_a or '?'}")
        print(f"  DNA fp B : {fp_b or '?'}")
        print(f"  Même opérateur DNA : {'🚨 OUI' if same_fp else 'Non'}")

        ph_a = next((s.extra.get("phash") for s in ra.steps if s.name.startswith("5.")), None)
        ph_b = next((s.extra.get("phash") for s in rb.steps if s.name.startswith("5.")), None)
        if ph_a and ph_b:
            try:
                import imagehash
                dist = imagehash.hex_to_hash(ph_a) - imagehash.hex_to_hash(ph_b)
                label = "🚨 quasi-identiques (<8)" if dist < 8 else ("similaires" if dist < 16 else "différentes")
                print(f"  Distance pHash A↔B : {dist}/64  ({label})")
            except Exception as e:
                print(f"  pHash comparaison : erreur ({e})")
        else:
            print("  pHash : données manquantes pour comparaison")

    from collections import Counter
    all_gaps = [g.split("] ",1)[-1] for r in reports for g in r.gaps]
    common = [(g,c) for g,c in Counter(all_gaps).most_common() if c >= 2]
    print(f"\n  LACUNES COMMUNES (×2 tokens) :")
    if common:
        for g,c in common: print(f"  ⚡ ×{c}  {g}")
    else:
        print("  Aucune lacune commune.")
    print("═"*78)

if __name__ == "__main__":
    asyncio.run(main())
