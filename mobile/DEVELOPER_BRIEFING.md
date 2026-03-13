# Lineage Agent — Briefing Développeur Mobile

> Document destiné au développeur externe chargé de finaliser et publier l'application mobile.  
> Date : Mars 2026 — Version codebase : `main`

---

## 1. Vue d'ensemble du projet

**Lineage Agent** est une application mobile d'intelligence on-chain pour les tokens Solana.  
Elle permet aux traders de détecter les rugs, scams, et manipulations de marché en temps réel.

**Plateformes cibles :** iOS + Android  
**Stack technique :** React Native · Expo SDK 54 · Expo Router · TypeScript  
**Backend :** FastAPI (Python) déployé sur Fly.io → `https://lineage-agent.fly.dev`  
**Design System :** "Noelle Dark" — dark theme, glassmorphism, gradients violet/cyan

---

## 2. Repository

```
GitHub : https://github.com/lebbuilder16/Lineage_Agent
Branche principale : main
Dossier de l'app : /mobile
```

### Cloner et installer

```bash
git clone https://github.com/lebbuilder16/Lineage_Agent.git
cd Lineage_Agent/mobile
npm install
cp .env.example .env.local    # Remplir les variables (voir section 4)
npx expo start
```

---

## 3. Architecture du projet

```
mobile/
├── app/                        # Routes Expo Router (file-based)
│   ├── _layout.tsx             # Root layout (Privy, QueryClient, ThemeContext)
│   ├── auth.tsx                # Écran login (email OTP + Phantom Wallet)
│   ├── onboarding.tsx          # Onboarding 3 étapes
│   ├── paywall.tsx             # Écran upgrade Pro (RevenueCat)
│   ├── phantom-connect.tsx     # Callback deep link Phantom Wallet
│   ├── (tabs)/
│   │   ├── index.tsx           # Onglet Home — feed temps réel
│   │   ├── search.tsx          # Onglet Search — recherche tokens
│   │   ├── watchlist.tsx       # Onglet Watchlist
│   │   ├── alerts.tsx          # Onglet Alertes push
│   │   └── account.tsx         # Onglet Compte / Paramètres
│   ├── lineage/[mint].tsx      # Écran détail Lineage d'un token
│   └── chat/[mint].tsx         # Écran AI Chat pour un token
│
├── src/
│   ├── lib/
│   │   ├── api.ts              # Client HTTP → backend FastAPI
│   │   ├── websocket.ts        # WebSocket live alerts (/ws/alerts)
│   │   ├── solanaWallet.ts     # Intégration Phantom Wallet (NaCl deeplink)
│   │   ├── purchases.ts        # RevenueCat (abonnements Pro)
│   │   ├── pushNotifications.ts # FCM push notifications
│   │   └── sentry.ts           # Monitoring erreurs (Sentry)
│   ├── store/
│   │   ├── auth.ts             # Zustand store — utilisateur authentifié
│   │   └── alerts.ts           # Zustand store — alertes temps réel
│   ├── theme/
│   │   ├── colors.ts           # Tokens couleurs Noelle Dark/Light
│   │   ├── ThemeContext.tsx    # useTheme() hook
│   │   ├── typography.ts
│   │   └── gradients.ts
│   ├── components/
│   │   ├── ui/                 # Composants réutilisables (GlassCard, RiskBadge, etc.)
│   │   ├── lineage/            # Composants spécifiques Lineage
│   │   └── forensics/         # Composants signaux forensiques
│   └── types/
│       └── api.ts              # Types TypeScript (User, AlertItem, LineageResult…)
│
├── app.json                    # Config Expo (bundle IDs, scheme, plugins)
├── eas.json                    # Config EAS Build (dev/preview/production)
├── .env.example                # Variables d'environnement requises
└── screens-preview.html        # Maquette HTML de référence du design
```

---

## 4. Variables d'environnement (`.env.local`)

Créer le fichier `mobile/.env.local` avec les valeurs suivantes :

```env
# Backend API (déjà déployé sur Fly.io)
EXPO_PUBLIC_API_URL=https://lineage-agent.fly.dev

# Privy Auth — récupérer dans https://console.privy.io
EXPO_PUBLIC_PRIVY_APP_ID=<votre-privy-app-id>

# EAS Project ID — récupérer via: npx eas init
EXPO_PUBLIC_EAS_PROJECT_ID=7e3aa1cf-5f84-4c9b-8afe-66bce3a21a18

# RevenueCat — https://app.revenuecat.com → API Keys
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=<votre-clé-android>
EXPO_PUBLIC_REVENUECAT_IOS_KEY=<votre-clé-ios>
```

---

## 5. Services tiers à configurer

### 5.1 Privy (Authentification)
- URL : https://console.privy.io
- Créer une app → noter l'`App ID`
- Activer : **Email OTP** + **External Wallets (Phantom)**
- Ajouter le deep link scheme : `lineage://`
- Mettre l'App ID dans `EXPO_PUBLIC_PRIVY_APP_ID`

### 5.2 Expo / EAS (Build & Deploy)
- URL : https://expo.dev
- Compte : `leb16` (propriétaire actuel du projet)
- Project ID déjà configuré : `7e3aa1cf-5f84-4c9b-8afe-66bce3a21a18`
- Commandes de build :
  ```bash
  npx eas build --profile development --platform android
  npx eas build --profile production --platform all
  ```

### 5.3 RevenueCat (Abonnements In-App)
- URL : https://app.revenuecat.com
- Créer un projet → créer 2 produits :
  - `pro_monthly` — $9.99/mois
  - `pro_yearly` — $79.99/an
- Créer l'entitlement : `pro`
- Créer une Offering : `default` avec les 2 packages
- Récupérer les clés API Android + iOS

### 5.4 Firebase (Push Android)
- URL : https://console.firebase.google.com
- Le fichier `google-services.json` est déjà présent dans `mobile/`
- Si régénération nécessaire : Firebase Console → Paramètres projet → Android

### 5.5 Sentry (Monitoring)
- URL : https://sentry.io
- Récupérer le DSN du projet
- Ajouter `SENTRY_AUTH_TOKEN` dans les secrets EAS :
  ```bash
  npx eas secret:create --name SENTRY_AUTH_TOKEN --value <token>
  ```

---

## 6. Écrans à implémenter / finaliser

L'architecture et le design sont en place. Voici l'état de chaque écran :

| Écran | Fichier | État |
|---|---|---|
| Auth (Email + Phantom) | `app/auth.tsx` | ✅ Complet |
| Onboarding | `app/onboarding.tsx` | ✅ Complet |
| Home Feed (temps réel) | `app/(tabs)/index.tsx` | ✅ Complet |
| Search tokens | `app/(tabs)/search.tsx` | ✅ Complet |
| Watchlist | `app/(tabs)/watchlist.tsx` | ✅ Complet |
| Alertes | `app/(tabs)/alerts.tsx` | ✅ Complet |
| Compte / Settings | `app/(tabs)/account.tsx` | ✅ Complet |
| Lineage Détail | `app/lineage/[mint].tsx` | ✅ Complet |
| AI Chat | `app/chat/[mint].tsx` | ✅ Complet |
| Paywall Pro | `app/paywall.tsx` | ✅ Complet |
| Phantom callback | `app/phantom-connect.tsx` | ✅ Complet |

**Tâches restantes :**
- [ ] Configurer les clés manquantes (Privy, RevenueCat) dans `.env.local`
- [ ] Créer les produits in-app sur App Store Connect + Google Play Console
- [ ] Tester le flow complet Phantom Wallet sur device physique
- [ ] Vérifier les notifications push FCM sur Android physique
- [ ] Publier le build production via EAS

---

## 7. API Backend — Endpoints disponibles

Le backend est déjà déployé. Documentation complète : `https://lineage-agent.fly.dev/docs`

| Méthode | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/privy` | Login / register via Privy ID |
| `GET` | `/api/tokens/search` | Recherche tokens (paginated) |
| `GET` | `/api/tokens/{mint}/lineage` | Analyse de lignée d'un token |
| `GET` | `/api/global-stats` | Statistiques globales |
| `GET` | `/api/stats/brief` | Brief IA (résumé intelligence) |
| `GET` | `/api/watchlist` | Liste de surveillance utilisateur |
| `POST` | `/api/watchlist` | Ajouter à la watchlist |
| `DELETE`| `/api/watchlist/{mint}` | Retirer de la watchlist |
| `GET` | `/api/alerts` | Historique alertes utilisateur |
| `POST` | `/api/push-token` | Enregistrer token FCM |
| `WS` | `/ws/alerts` | Stream WebSocket alertes temps réel |

**Authentification :** Header `X-API-Key: <clé>` (retournée par `/api/auth/privy`)

---

## 8. Deep Link Scheme

- Scheme : `lineage://`
- Callback Phantom Wallet : `lineage://phantom-connect?...`
- Configuré dans `app.json` → `scheme: "lineage"`

---

## 9. Workflow de build et publication

### Dev local
```bash
cd mobile
npm install
npx expo start                    # Expo Go ou dev build
npx expo start --clear            # Reset cache
```

### Build preview (APK interne)
```bash
npx eas build --profile preview --platform android
# Partager le QR code aux testeurs
```

### Build production
```bash
# Android (AAB pour Google Play)
npx eas build --profile production --platform android

# iOS (IPA pour App Store)
npx eas build --profile production --platform ios

# Soumettre aux stores
npx eas submit --profile production --platform android
npx eas submit --profile production --platform ios
```

### OTA Updates (sans rebuild)
```bash
npx eas update --channel production --message "Fix Phantom connect"
```

---

## 10. Informations App Stores

| Champ | Valeur |
|---|---|
| Nom de l'app | Lineage Agent |
| Bundle ID iOS | `com.lineageagent.mobile` |
| Package Android | `com.lineageagent.mobile` |
| Catégorie | Finance / Crypto |
| Âge minimum | 17+ (contenu financier) |
| Support biométrique | Face ID / Touch ID |

---

## 11. Design de référence

Le fichier `mobile/screens-preview.html` contient une maquette HTML interactive de tous les écrans.  
Ouvrir dans un navigateur pour référence visuelle complète.

**Fichier Figma (Dark) :** `a6PHaT6GaxDYFGRuGNxTGZ` (accès requis)  
**Tokens design :** `design/figma-tokens-full.json`  
**Police :** Plus Jakarta Sans (embarquée via `@expo-google-fonts`)

---

## 12. Contacts et accès

| Ressource | Accès requis |
|---|---|
| GitHub repo | Invitation à `lebbuilder16/Lineage_Agent` |
| Expo project | Invitation sur expo.dev projet `leb16` |
| Privy console | Invitation sur console.privy.io |
| RevenueCat | Invitation sur app.revenuecat.com |
| Firebase | Invitation sur console.firebase.google.com |
| Fly.io (backend) | Invitation sur fly.io (lecture seule suffisante) |

---

## 13. Points d'attention techniques

1. **Phantom Wallet** — Le flow utilise NaCl box encryption + SecureStore pour persister la session cryptographique. Ne pas modifier `src/lib/solanaWallet.ts` sans comprendre le protocole.

2. **Async/await strict** — `buildPhantomConnectURL()` et `decryptPhantomResponse()` sont async. Toujours les `await`.

3. **useTheme()** — Tous les styles utilisent `useTheme()` inline (jamais `StyleSheet.create` au module level) pour supporter le dark/light mode dynamiquement.

4. **WebSocket** — Le store Zustand `alerts` est alimenté par le WebSocket `/ws/alerts`. Le client gère la reconnexion automatique avec backoff exponentiel.

5. **SecureStore** — Toutes les données sensibles (API key, Phantom session) sont stockées via `expo-secure-store`, jamais en clair.

6. **EAS Build obligatoire** — Les modules natifs (`expo-notifications`, `react-native-purchases`) nécessitent un **dev build** ou **production build**. Expo Go seul est insuffisant pour tester toutes les fonctionnalités.
