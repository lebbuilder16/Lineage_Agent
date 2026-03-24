import { Stack } from 'expo-router';
import { tokens } from '../../src/theme/tokens';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: tokens.bgMain },
        animation: 'fade',
      }}
    />
  );
}
