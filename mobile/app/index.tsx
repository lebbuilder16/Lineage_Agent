import { Redirect } from 'expo-router';
import { useAuthStore } from '../src/store/auth';

/** Deep-link entry: redirect "/" → Welcome (if no key) or Radar (if authenticated) */
export default function Index() {
  const apiKey = useAuthStore((s) => s.apiKey);
  const hydrated = useAuthStore((s) => s.hydrated);

  // Wait for hydration before deciding
  if (!hydrated) return null;

  if (!apiKey) {
    return <Redirect href="/(auth)/welcome" />;
  }

  return <Redirect href="/(tabs)/radar" />;
}
