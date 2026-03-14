// Lightweight mock for expo-notifications — used by unit test project (node env)
// The real module pulls in the full Expo runtime which requires __DEV__ and RN globals.
module.exports = {
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  setNotificationHandler: jest.fn(),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('mock-notification-id'),
  addNotificationReceivedListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  addNotificationResponseReceivedListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
};
