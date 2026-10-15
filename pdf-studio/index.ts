import { registerRootComponent } from 'expo';
import React from 'react';
import { Alert } from 'react-native';
import { CrashScreen } from './src/components/ErrorBoundary';

// Show JavaScript errors in a dialog instead of closing the app.
const g = global as any;
if (g.ErrorUtils?.setGlobalHandler) {
  g.ErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
    Alert.alert(
      isFatal ? 'Unexpected error' : 'Error',
      `${error?.message ?? String(error)}\n\n${String(error?.stack ?? '').slice(0, 600)}`,
    );
  });
}

// If loading the app itself fails, show the reason on screen.
let Root: React.ComponentType;
try {
  Root = require('./App').default;
} catch (error) {
  Root = () => React.createElement(CrashScreen, { error });
}

registerRootComponent(Root);
