/**
 * Alerts tab — redirects to Watchlist (alerts now surface via UrgencyBanner + FlagTimeline).
 * File kept for Expo Router compatibility and backward deep-link support.
 */
import { Redirect } from 'expo-router';

export default function AlertsRedirect() {
  return <Redirect href="/(tabs)/watchlist" />;
}
