import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

/** Shows the error on screen instead of letting the app close, so problems can be reported. */
export function CrashScreen({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const e = error as any;
  const text = `${e?.name ?? 'Error'}: ${e?.message ?? String(error)}\n\n${String(e?.stack ?? '').slice(0, 3000)}`;
  return (
    <View style={{ flex: 1, backgroundColor: '#fff', paddingTop: 48, paddingHorizontal: 16 }}>
      <Text style={{ fontSize: 20, fontWeight: '700', color: '#B8221E' }}>PDF Studio hit an error</Text>
      <Text style={{ color: '#6B7280', marginTop: 6, marginBottom: 12 }}>
        Please take a screenshot of this screen and share it with the developer.
      </Text>
      <ScrollView style={{ flex: 1, backgroundColor: '#F4F5F7', borderRadius: 8, padding: 10 }}>
        <Text selectable style={{ fontFamily: 'monospace', fontSize: 12, color: '#1B1D22' }}>
          {text}
        </Text>
      </ScrollView>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          style={{ backgroundColor: '#E5322D', padding: 14, borderRadius: 12, alignItems: 'center', marginVertical: 16 }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Back to home</Text>
        </Pressable>
      ) : (
        <View style={{ height: 24 }} />
      )}
    </View>
  );
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; onReset?: () => void },
  { error: unknown }
> {
  state = { error: null as unknown };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <CrashScreen
          error={this.state.error}
          onRetry={() => {
            this.props.onReset?.();
            this.setState({ error: null });
          }}
        />
      );
    }
    return this.props.children;
  }
}
