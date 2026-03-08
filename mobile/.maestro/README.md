# Maestro E2E Tests

[Maestro](https://maestro.mobile.dev) is used for end-to-end UI testing on the mobile app.

## Prerequisites

```bash
# Install Maestro CLI
curl -Ls "https://get.maestro.mobile.dev" | bash
```

## Running Tests

```bash
# Run all flows
maestro test .maestro/flows/

# Run a single flow
maestro test .maestro/flows/onboarding.yaml
maestro test .maestro/flows/search_token.yaml
maestro test .maestro/flows/view_alerts.yaml
```

## Flows

| File | Description |
|------|-------------|
| `onboarding.yaml` | Swipes through all 3 onboarding slides and taps "Get Started" → asserts auth screen |
| `search_token.yaml` | Opens search tab, types "PEPE", taps first result → asserts lineage screen |
| `view_alerts.yaml` | Opens alerts tab → asserts list or empty state is visible |

## Notes

- Flows require a simulator/emulator running with the app installed (`expo run:android` or `expo run:ios`).
- For CI, use `maestro cloud` with your API key.
- Accessibility `testID` props must match the IDs referenced in flows (e.g. `search-input`, `token-card`, `lineage-screen`, `alerts-list`).
