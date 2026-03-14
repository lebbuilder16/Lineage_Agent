// Mock for expo-clipboard in Jest
module.exports = {
  setStringAsync: jest.fn(() => Promise.resolve()),
  getStringAsync: jest.fn(() => Promise.resolve('')),
  hasStringAsync: jest.fn(() => Promise.resolve(true)),
};
