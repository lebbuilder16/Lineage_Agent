# Lineage Agent — Mobile

Premium Expo React Native client for the Meme Lineage Agent platform.

## Stack

| Technology | Version | Purpose |
|---|---|---|
| Expo SDK | 54 | Build toolchain |
| React Native | 0.77 | Rendering (New Architecture / Fabric) |
| expo-router | 4.x | File-based navigation with typed routes |
| react-native-reanimated | 3.x | UI-thread animations |
| expo-blur | 14.x | Glassmorphism BlurView |
| Zustand | 5 | Client state (alerts, auth) |
| TanStack Query | 5 | Server state with caching |
| react-native-mmkv | 3.x | Persistent key-value storage |
| @shopify/flash-list | latest | High-performance lists |

## Design System — Aurora Glass

| Token | Value |
|---|---|
| `bgMain` | `#0A0A07` |
| `primary` | `#6F6ACF` |
| `secondary` | `#ADCEFF` |
| `success` | `#00FF88` |
| `accent` | `#FF3366` |

All tokens live in `src/theme/tokens.ts`.

## Project Structure

```
mobile/
├── app/                    # expo-router screens
│   ├── _layout.tsx         # Root layout (fonts, query client)
│   ├── index.tsx           # Redirect → /(tabs)/radar
│   ├── (tabs)/             # Bottom-tab screens
│   │   ├── radar.tsx       # Trending tokens + global stats
│   │   ├── scan.tsx        # Token search
│   │   ├── clock.tsx       # DeathClock confidence gauge
│   │   ├── alerts.tsx      # Live alert feed
│   │   └── watchlist.tsx   # Personal watchlist
│   ├── token/[mint].tsx    # Token detail report
│   ├── deployer/[address].tsx
│   ├── cartel/[id].tsx
│   ├── sol-trace/[mint].tsx
│   ├── compare.tsx         # Compare two tokens
│   └── analysis/[mint].tsx # AI analysis modal
├── src/
│   ├── components/ui/      # Design system primitives
│   ├── lib/                # api.ts, query.ts, notifications.ts
│   ├── store/              # Zustand stores
│   ├── theme/              # tokens.ts, fonts.ts
│   └── types/              # api.ts type definitions
└── assets/                 # Icons, splash, fonts
```

## Quick Start

```bash
# Install dependencies
npm install

# Start Expo dev server
npx expo start

# iOS (requires macOS + Xcode)
npx expo run:ios

# Android (requires Android Studio + emulator)
npx expo run:android
```

## Environment Variables

Create `mobile/.env.local`:

```bash
EXPO_PUBLIC_API_URL=https://lineage-agent.fly.dev
EXPO_PUBLIC_PRIVY_APP_ID=<your-privy-app-id>
```

For local development, point `EXPO_PUBLIC_API_URL` at `http://localhost:8000`.

## Production Builds (EAS)

```bash
# Install EAS CLI
npm install -g eas-cli

# Authenticate
eas login

# Build for iOS (TestFlight)
eas build --platform ios --profile preview

# Build for Android (internal testing)
eas build --platform android --profile preview

# Publish OTA update
eas update --channel production --message "release notes"
```

See `eas.json` for build profiles and `DEVELOPER_BRIEFING.md` for full architecture notes.

## Fonts

The app uses [Lexend](https://fonts.google.com/specimen/Lexend) (Light, Regular, Medium, SemiBold, Bold).

Download all 5 weights from Google Fonts and place the `.ttf` files in `assets/fonts/`:
- `Lexend-Light.ttf`
- `Lexend-Regular.ttf`
- `Lexend-Medium.ttf`
- `Lexend-SemiBold.ttf`
- `Lexend-Bold.ttf`

The placeholder files in `assets/fonts/` are 0-byte stubs — replace them before building for production.
