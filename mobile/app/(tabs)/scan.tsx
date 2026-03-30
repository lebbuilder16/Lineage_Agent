/**
 * Scan tab — redirects to Watchlist (search is now inline in Watchlist header).
 * File kept for Expo Router compatibility (routes must have a corresponding file).
 */
import { Redirect } from 'expo-router';

export default function ScanRedirect() {
  return <Redirect href="/(tabs)/watchlist" />;
}
