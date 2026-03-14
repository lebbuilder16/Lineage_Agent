import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';

// Silence the expected console.error calls from ErrorBoundary.componentDidCatch
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => {
  (console.error as jest.Mock).mockRestore();
});

const ThrowingComponent = () => {
  throw new Error('Test crash');
};

// A component that can be toggled to stop throwing — used for the reset test
let controlledShouldThrow = true;
const ControlledComponent = () => {
  if (controlledShouldThrow) throw new Error('Controlled crash');
  return null;
};

describe('ErrorBoundary', () => {
  beforeEach(() => {
    controlledShouldThrow = true;
  });

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <React.Fragment>
          <></>
        </React.Fragment>
      </ErrorBoundary>,
    );
    // No error UI shown
    expect(screen.queryByText('Something went wrong')).toBeNull();
  });

  it('renders the default error UI when a child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByText('Test crash')).toBeTruthy();
    expect(screen.getByText('Try again')).toBeTruthy();
  });

  it('renders the custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<React.Fragment><></></React.Fragment>}>
        <ThrowingComponent />
      </ErrorBoundary>,
    );
    // default error text should NOT appear; fallback is custom
    expect(screen.queryByText('Something went wrong')).toBeNull();
  });

  it('resets error state when "Try again" is pressed', () => {
    // Use a controlled component so we can stop it from throwing after reset
    render(
      <ErrorBoundary>
        <ControlledComponent />
      </ErrorBoundary>,
    );

    // Error UI is visible
    expect(screen.getByText('Try again')).toBeTruthy();

    // Allow children to render without throwing
    controlledShouldThrow = false;

    // Press reset — boundary clears state, children re-render without error
    fireEvent.press(screen.getByText('Try again'));

    expect(screen.queryByText('Something went wrong')).toBeNull();
  });

  it('has correct accessibility attributes on error container and retry button', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>,
    );

    // Error message is shown — verifies the error container rendered
    expect(screen.getByText('Something went wrong')).toBeTruthy();

    // Retry button has the correct label for screen readers
    expect(screen.getByLabelText('Retry')).toBeTruthy();
  });
});
