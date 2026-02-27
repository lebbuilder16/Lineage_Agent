# Prompt d'Audit Complet — Lineage Agent

> **Usage** : Copier-coller ce prompt tel quel dans une nouvelle session Claude/GPT.
> Joindre le workspace complet ou le repo GitHub en contexte.

---

## PROMPT

```
Tu es un auditeur senior spécialisé en applications blockchain analytics (Solana).
Tu vas effectuer un audit systématique, feature par feature, de l'application
"Lineage Agent" — un outil d'analyse forensique de memecoins sur Solana.

═══════════════════════════════════════════════════════════════
CONTEXTE CRITIQUE (problèmes connus à vérifier en priorité)
═══════════════════════════════════════════════════════════════

1. FIABILITÉ DES DONNÉES : Certaines données affichées ne correspondent pas
   aux données on-chain réelles. Exemples constatés :
   - Le deployer affiché pour un token PumpFun (ex: F2GVP…xpump) ne correspondait
     pas au creator Solscan/PumpFun réel.
   - Suspicion de données simulées, hardcodées ou fallback silencieux qui
     masquent des échecs de récupération on-chain.

2. ARCHITECTURE EN SILOS : Les features semblent fonctionner indépendamment
   sans partager leurs résultats entre elles. Redondance de logique entre
   services (ex: résolution de deployer dupliquée à plusieurs endroits).

3. STRUCTURE TOUFFUE : Le code est dense, les features sont mal organisées
   et déconnectées, rendant les résultats d'analyse difficiles à interpréter.

4. UI/UX : L'interface est complexe, chargée, difficile à déchiffrer pour
   un utilisateur. Les gens ne se retrouvent pas dans la masse d'information.

═══════════════════════════════════════════════════════════════
STRUCTURE DE L'APPLICATION (référence)
═══════════════════════════════════════════════════════════════

Backend (Python/FastAPI) :
- src/lineage_agent/api.py              → Endpoints REST + WebSocket
- src/lineage_agent/lineage_detector.py  → Orchestrateur principal (detect_lineage)
- src/lineage_agent/deployer_service.py  → Deployer Profile
- src/lineage_agent/operator_impact_service.py → Operator Impact
- src/lineage_agent/sol_flow_service.py  → SOL Flow Trace
- src/lineage_agent/cartel_service.py    → Cartel Detection (graph)
- src/lineage_agent/cartel_financial_service.py → Cartel Financial edges
- src/lineage_agent/bundle_tracker_service.py → Bundle Detection
- src/lineage_agent/liquidity_arch.py    → Liquidity Architecture
- src/lineage_agent/metadata_dna_service.py → Operator DNA Fingerprint
- src/lineage_agent/factory_service.py   → Factory Rhythm
- src/lineage_agent/death_clock.py       → Death Clock
- src/lineage_agent/rug_detector.py      → Rug Detection sweep
- src/lineage_agent/insider_sell_service.py → Insider Sell detection
- src/lineage_agent/zombie_detector.py   → Zombie Token detection
- src/lineage_agent/data_sources/solana_rpc.py → Client RPC Solana
- src/lineage_agent/data_sources/dexscreener.py → Client DexScreener
- src/lineage_agent/data_sources/_clients.py → Singletons + cache helpers
- src/lineage_agent/models.py           → Pydantic models
- src/lineage_agent/cache.py            → SQLiteCache + TTLCache

Frontend (Next.js/React) :
- frontend/src/app/lineage/             → Page principale lineage
- frontend/src/app/deployer/            → Page Deployer Profile
- frontend/src/app/operator/            → Page Operator Dossier
- frontend/src/app/sol-trace/           → Page SOL Flow
- frontend/src/app/cartel/              → Page Cartel Graph
- frontend/src/components/FamilyTree.tsx → Arbre de famille visuel
- frontend/src/components/EvidencePanel.tsx → Panneau de preuves
- frontend/src/components/LineageCard.tsx → Carte token
- frontend/src/components/forensics/    → Composants forensiques
- frontend/src/lib/api.ts              → Client API fetch
- frontend/src/lib/useLineageWS.ts     → Hook WebSocket

═══════════════════════════════════════════════════════════════
MÉTHODOLOGIE D'AUDIT — Grille d'évaluation par feature
═══════════════════════════════════════════════════════════════

Pour CHAQUE feature ci-dessous, tu dois produire une fiche structurée
contenant exactement ces 7 axes d'évaluation :

┌─────────────────────────────────────────────────────────┐
│ AXE 1 — EXACTITUDE DES DONNÉES (note /10)              │
│                                                         │
│ • Les données proviennent-elles réellement du on-chain  │
│   (RPC Solana, DAS Helius) ou sont-elles simulées,     │
│   hardcodées, ou issues d'un fallback silencieux ?      │
│ • Y a-t-il des valeurs par défaut qui masquent un       │
│   échec de récupération ? (ex: deployer="", score=0)    │
│ • Les adresses, montants, timestamps correspondent-ils  │
│   à ce qu'on verrait sur Solscan/Solana Explorer ?      │
│ • Le cache peut-il servir des données périmées ou       │
│   invalides ? Version de cache appropriée ?             │
│ → Lister chaque donnée suspecte avec fichier:ligne      │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ AXE 2 — GESTION DES ERREURS (note /10)                 │
│                                                         │
│ • Les erreurs RPC/API sont-elles gérées explicitement   │
│   ou avalées silencieusement (try/except: pass) ?       │
│ • L'utilisateur est-il informé quand une donnée n'a     │
│   pas pu être récupérée ?                               │
│ • Y a-t-il des fallback silencieux qui retournent des   │
│   données partielles sans avertissement ?               │
│ • Les timeouts sont-ils appropriés ?                    │
│ → Lister chaque except silencieux avec fichier:ligne    │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ AXE 3 — COHÉRENCE INTER-FEATURES (note /10)            │
│                                                         │
│ • Cette feature partage-t-elle des données avec         │
│   d'autres features ? Si oui, utilisent-elles la       │
│   même source ou re-calculent-elles indépendamment ?    │
│ • Y a-t-il de la logique dupliquée avec un autre        │
│   service ? (ex: résolution deployer, scan signatures)  │
│ • Les résultats de cette feature alimentent-ils         │
│   d'autres features ou sont-ils isolés en silo ?        │
│ → Lister chaque duplication avec les 2 emplacements     │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ AXE 4 — CLARTÉ DU CODE & MAINTENABILITÉ (note /10)     │
│                                                         │
│ • Le code est-il lisible et bien structuré ?            │
│ • Les responsabilités sont-elles clairement séparées ?  │
│ • La documentation interne (docstrings, commentaires)   │
│   est-elle suffisante et exacte ?                       │
│ • Le naming est-il cohérent et descriptif ?             │
│ → Identifier les fonctions trop longues (>80 lignes)    │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ AXE 5 — UI/UX DE LA FEATURE (note /10)                 │
│                                                         │
│ • L'information est-elle présentée de manière claire    │
│   et actionnable pour un utilisateur non-technique ?    │
│ • Y a-t-il trop de données brutes affichées sans       │
│   hiérarchie ni explication ?                           │
│ • Les états d'erreur/chargement/vide sont-ils gérés ?  │
│ • L'utilisateur comprend-il ce que signifie chaque     │
│   score, pourcentage ou valeur affichée ?               │
│ → Proposer des améliorations UX concrètes              │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ AXE 6 — VALEUR ANALYTIQUE RÉELLE (note /10)            │
│                                                         │
│ • Cette feature apporte-t-elle une information          │
│   réellement utile pour détecter un rug/scam ?          │
│ • Le signal est-il suffisamment fiable pour être        │
│   actionnable (acheter/ne pas acheter) ?                │
│ • Pourrait-on fusionner cette feature avec une autre    │
│   pour plus de clarté sans perte d'information ?        │
│ → Évaluer le ratio signal/bruit                        │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ AXE 7 — TESTS & COUVERTURE (note /10)                  │
│                                                         │
│ • Existe-t-il des tests unitaires pour cette feature ?  │
│ • Les tests vérifient-ils l'exactitude des données      │
│   ou seulement que "ça ne plante pas" ?                 │
│ • Y a-t-il des tests d'intégration avec des données     │
│   on-chain réelles (ou snapshots réalistes) ?           │
│ → Identifier les cas non testés critiques              │
└─────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════
FEATURES À AUDITER (dans cet ordre)
═══════════════════════════════════════════════════════════════

FEATURE 1 — DEPLOYER PROFILE
  Backend : deployer_service.py, death_clock.py, factory_service.py
  Frontend : frontend/src/app/deployer/
  Endpoint : GET /deployer/{address}
  Question clé : Le profil (nb tokens, rug rate, factory rhythm, death clock)
  est-il calculé à partir de données on-chain vérifiables ou d'un cache
  potentiellement incomplet (bootstrap DAS) ?

FEATURE 2 — OPERATOR IMPACT
  Backend : operator_impact_service.py, metadata_dna_service.py
  Frontend : frontend/src/app/operator/
  Endpoint : GET /operator/{fingerprint}
  Question clé : Le fingerprint DNA relie-t-il réellement des wallets
  du même opérateur ? La méthode de clustering (metadata URI similarity)
  est-elle fiable ou génère-t-elle des faux positifs ?

FEATURE 3 — SOL FLOW TRACE
  Backend : sol_flow_service.py
  Frontend : frontend/src/app/sol-trace/
  Endpoint : GET /lineage/{mint}/sol-trace
  Question clé : Les flux SOL tracés correspondent-ils aux transactions
  réelles visibles sur Solscan ? Le graphe de flux est-il complet ou
  tronqué par les limites de pagination RPC ?

FEATURE 4 — CARTEL DETECTION
  Backend : cartel_service.py, cartel_financial_service.py
  Frontend : frontend/src/app/cartel/
  Endpoints : GET /cartel/search, GET /cartel/{deployer}/financial
  Question clé : Les "communautés" détectées reflètent-elles une vraie
  coordination ou sont-elles des artefacts du clustering ? Les edges
  (funding_link, shared_lp, sniper_ring) sont-ils vérifiés on-chain ?

FEATURE 5 — BUNDLE DETECTION
  Backend : bundle_tracker_service.py
  Frontend : composant dans la page lineage
  Endpoint : GET /bundle/{mint}
  Question clé : La détection de bundles Jito est-elle basée sur des
  signatures de transactions réelles ou sur des heuristiques faibles ?
  Le verdict d'extraction (SOL returned) est-il vérifiable ?

FEATURE 6 — LIQUIDITY ARCHITECTURE
  Backend : liquidity_arch.py
  Frontend : composant dans la page lineage
  Données : Calculé inline dans detect_lineage()
  Question clé : L'analyse de la structure de liquidité (pools, DEX routing)
  est-elle basée sur des données de pools réelles ou uniquement sur les
  pairs DexScreener ? Les lock/burn de LP sont-ils vérifiés on-chain ?

FEATURE 7 — FAMILY TREE (arbre de famille)
  Backend : lineage_detector.py (_assign_generations, _select_root)
  Frontend : FamilyTree.tsx, LineageCard.tsx
  Endpoint : GET /lineage/{mint}/graph
  Question clé : L'algorithme de sélection du root token et l'assignation
  des générations sont-ils fiables ? Le deployer est-il correctement
  résolu pour chaque nœud ? L'arbre reflète-t-il la réalité chronologique ?

FEATURE 8 — DERIVATIVES (tokens dérivés/clones)
  Backend : lineage_detector.py (scoring, _enrich, pre-filtering)
  Frontend : EvidencePanel.tsx, page lineage
  Endpoint : GET /lineage?mint=
  Question clé : Le scoring composite (name 25%, symbol 15%, image 25%,
  deployer 20%, temporal 15%) est-il calibré correctement ? Les candidats
  sont-ils correctement filtrés ou y a-t-il des faux positifs/négatifs ?

═══════════════════════════════════════════════════════════════
AUDIT GLOBAL (après les 8 fiches individuelles)
═══════════════════════════════════════════════════════════════

Après avoir produit les 8 fiches, tu dois fournir :

A) TABLEAU RÉCAPITULATIF
   Une matrice 8 features × 7 axes avec les notes /10 et une note globale.

B) TOP 10 DES PROBLÈMES CRITIQUES
   Les 10 problèmes les plus graves classés par impact sur la fiabilité,
   avec fichier:ligne, description, et correction proposée.

C) CARTE DES DÉPENDANCES INTER-FEATURES
   Un schéma (texte/mermaid) montrant comment les features devraient
   communiquer vs comment elles communiquent actuellement.

D) PLAN DE REFACTORING PRIORISÉ
   Un plan d'action en 3 phases :
   - Phase 1 (urgent) : Corriger les données fausses/simulées
   - Phase 2 (important) : Désiler les features, supprimer les doublons
   - Phase 3 (amélioration) : Simplifier l'UI/UX

E) SCORE DE CONFIANCE GLOBAL
   Sur 100, quel est le niveau de confiance qu'un utilisateur devrait
   accorder aux analyses produites par cette application aujourd'hui ?
   Justifier.

═══════════════════════════════════════════════════════════════
RÈGLES DE CONDUITE
═══════════════════════════════════════════════════════════════

- Sois factuel : cite le code source exact (fichier + ligne).
- Pas de complaisance : si une feature est inutile ou dangereusement
  trompeuse, dis-le clairement.
- Pas de suppositions : si tu ne peux pas vérifier une donnée,
  marque-la comme "NON VÉRIFIABLE" plutôt que de supposer qu'elle est OK.
- Distingue clairement : données on-chain vérifiées vs données calculées
  vs données simulées/hardcodées.
- Pour chaque problème, propose une correction concrète (pas juste
  "il faudrait améliorer").

Commence par la Feature 1 (Deployer Profile) et progresse dans l'ordre.
Produis l'audit complet sans t'arrêter.
```
