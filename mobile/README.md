# Lineage Agent — Mobile App

Application Android (React Native + Expo) publiable sur le **Google Play Store**.

## Stack technique

| Couche | Technologie |
|---|---|
| Framework | React Native 0.76 + Expo ~52 |
| Navigation | Expo Router ~4 (file-based) |
| Styling | NativeWind v4 (Tailwind CSS) |
| State | Zustand v5 |
| Data fetching | TanStack Query v5 |
| Animations | Reanimated 3 + Gesture Handler |
| Auth | Privy `@privy-io/expo` (embedded wallet) |
| Push | Firebase Cloud Messaging (Expo Notifications) |
| Build | EAS Build + EAS Submit |

## Prérequis

- Node.js ≥ 20
- Expo CLI : `npm i -g expo-cli eas-cli`
- Compte [Privy](https://console.privy.io) → App ID
- Compte [Firebase](https://console.firebase.google.com) → `google-services.json`
- Compte [Expo EAS](https://expo.dev) → `npx eas init`

## Installation

```bash
cd mobile
cp .env.example .env.local
# Remplir EXPO_PUBLIC_API_URL, EXPO_PUBLIC_PRIVY_APP_ID
npm install
```

## Développement

```bash
# Dev server Expo Go
npm start

# Dev sur device Android (USB)
npm run android
```

> En mode dev, l'écran auth expose un champ `privy_id` manuel pour  
> bypasser le flow Privy. En production ce champ est absent.

## Build Android (EAS)

```bash
# APK interne pour tests (pas signé Play)
eas build --platform android --profile preview

# AAB production (prêt Play Store)
eas build --platform android --profile production

# Soumettre directement sur la track interne Play
eas submit --platform android --profile production
```

## Variables d'environnement

Voir [.env.example](.env.example) pour la liste complète.

## Fichiers à ne PAS committer (déjà dans .gitignore)

```
mobile/.env.local
mobile/google-services.json          # Credentials Firebase Android
mobile/google-play-service-account.json  # Credentials EAS Submit
```

## Architecture des écrans

```
app/
  (tabs)/
    index.tsx          # Home Feed — AI Brief + alertes live
    search.tsx         # Recherche de tokens
    watchlist.tsx      # Tokens surveillés (auth requise)
    alerts.tsx         # Centre de notifications
    account.tsx        # Profil, plan, logout
  auth.tsx             # Connexion Privy
  lineage/[mint].tsx   # Détail forensique d'un token
  deployer/[address].tsx  # Profil déployeur
  chat/[mint].tsx      # AI Chat SSE (Pro uniquement)
  paywall.tsx          # Modal upgrade Pro
```

## Variables backend nécessaires (Fly.io / .env)

| Variable | Description |
|---|---|
| `FIREBASE_PROJECT_ID` | ID projet Firebase pour FCM push |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Chemin vers le SA JSON (FCM Admin) |
