import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, Linking } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { BusyOverlay } from './src/components/ui';
import { countPages, friendlyError } from './src/pdf/ops';
import EditPageScreen from './src/screens/EditPageScreen';
import HomeScreen from './src/screens/HomeScreen';
import PagesScreen from './src/screens/PagesScreen';
import ViewerScreen from './src/screens/ViewerScreen';
import { copyIncoming, importFile, readBase64 } from './src/storage/library';
import { colors } from './src/theme';
import type { Nav, Route } from './src/types';

export default function App() {
  const [stack, setStack] = useState<Route[]>([{ name: 'home' }]);
  const [busy, setBusy] = useState<string | null>(null);
  const stackRef = useRef(stack);
  stackRef.current = stack;

  const nav: Nav = useMemo(
    () => ({
      push: (r) => setStack((st) => [...st, r]),
      replace: (r) => setStack((st) => [...st.slice(0, -1), r]),
      back: () => setStack((st) => (st.length > 1 ? st.slice(0, -1) : st)),
    }),
    [],
  );

  // Android hardware back button
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stackRef.current.length > 1) {
        nav.back();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [nav]);

  // "Open with PDF Studio" from file managers, browsers, mail apps…
  useEffect(() => {
    const handle = async (url: string | null) => {
      if (!url || !/^(content|file):\/\//.test(url)) return;
      setBusy('Opening PDF…');
      try {
        const local = await copyIncoming(url);
        const pages = await countPages(await readBase64(local));
        const rawName = decodeURIComponent(url.split('/').pop() ?? '');
        const name = /\.pdf$/i.test(rawName) ? rawName : 'Shared document';
        const meta = await importFile(local, name, pages);
        setStack([{ name: 'home' }, { name: 'viewer', id: meta.id }]);
      } catch (e) {
        Alert.alert('Could not open file', friendlyError(e));
      } finally {
        setBusy(null);
      }
    };
    Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, []);

  const route = stack[stack.length - 1];
  let screen: React.ReactNode;
  switch (route.name) {
    case 'home':
      screen = <HomeScreen nav={nav} />;
      break;
    case 'viewer':
      screen = <ViewerScreen key={route.id} id={route.id} nav={nav} />;
      break;
    case 'edit':
      screen = <EditPageScreen id={route.id} page={route.page} nav={nav} />;
      break;
    case 'pages':
      screen = <PagesScreen id={route.id} nav={nav} />;
      break;
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.primary }} edges={['top']}>
        <StatusBar style="light" />
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom', 'left', 'right']}>
          {screen}
        </SafeAreaView>
        <BusyOverlay label={busy} />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
