import { Redirect } from 'expo-router';

/** Deep-link entry: redirect "/" → RadarScreen (first tab) */
export default function Index() {
  return <Redirect href="/(tabs)/radar" />;
}
