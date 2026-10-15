import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { BusyOverlay, Header, IconButton } from '../components/ui';
import {
  deletePages,
  duplicatePages,
  extractPages,
  friendlyError,
  getPageInfo,
  insertBlankPage,
  loadDoc,
  movePage,
  rotatePages,
  type PageInfo,
} from '../pdf/ops';
import { createFromBase64, currentUri, editDocument, getDoc, readBase64 } from '../storage/library';
import { colors, radius } from '../theme';
import type { DocMeta, Nav } from '../types';
import { pageMemory } from './ViewerScreen';

const COLS = 3;

export default function PagesScreen({ id, nav }: { id: string; nav: Nav }) {
  const [meta, setMeta] = useState<DocMeta | null>(null);
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [sel, setSel] = useState<number[]>([]);
  const [busy, setBusy] = useState<string | null>('Loading pages…');
  const { width } = useWindowDimensions();
  const cell = (width - 16 * 2 - 8 * (COLS - 1)) / COLS;

  const load = useCallback(async (m: DocMeta) => {
    const doc = await loadDoc(await readBase64(currentUri(m)));
    setPages(getPageInfo(doc));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const m = await getDoc(id);
        if (!m) throw new Error('Document not found');
        setMeta(m);
        await load(m);
      } catch (e) {
        Alert.alert('Cannot organize pages', friendlyError(e));
        nav.back();
      } finally {
        setBusy(null);
      }
    })();
  }, [id, load, nav]);

  const edit = async (label: string, mutate: Parameters<typeof editDocument>[1], newSel: number[] = []) => {
    if (!meta) return;
    setBusy(label);
    try {
      const m = await editDocument(meta, mutate);
      setMeta(m);
      await load(m);
      setSel(newSel);
    } catch (e) {
      Alert.alert('Something went wrong', friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  const toggle = (i: number) => setSel((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i].sort((a, b) => a - b)));
  const one = sel.length === 1 ? sel[0] : -1;

  const del = () =>
    Alert.alert(`Delete ${sel.length} page${sel.length > 1 ? 's' : ''}?`, 'You can undo this from the viewer.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => edit('Deleting…', (d) => deletePages(d, sel)) },
    ]);

  const extract = async () => {
    if (!meta) return;
    setBusy('Extracting…');
    try {
      const doc = await loadDoc(await readBase64(currentUri(meta)));
      const created = await createFromBase64(await extractPages(doc, sel), `${meta.name} (extract)`, sel.length);
      Alert.alert('Done', `Created "${created.name}" with ${sel.length} page(s).`);
      setSel([]);
    } catch (e) {
      Alert.alert('Something went wrong', friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  const hasSel = sel.length > 0;

  return (
    <View style={{ flex: 1 }}>
      <Header
        title={hasSel ? `${sel.length} selected` : 'Organize pages'}
        subtitle={meta ? `${meta.name} • ${pages.length} pages` : undefined}
        onBack={nav.back}
        right={
          <>
            <IconButton
              icon={hasSel ? 'select-off' : 'select-all'}
              color="#fff"
              onPress={() => setSel(hasSel ? [] : pages.map((_, i) => i))}
            />
            <IconButton icon="check" color="#fff" onPress={nav.back} />
          </>
        }
      />
      <Text style={st.hint}>
        {hasSel ? 'Choose an action below' : 'Tap pages to select them • long-press to open a page'}
      </Text>
      <FlatList
        data={pages}
        key={COLS}
        numColumns={COLS}
        keyExtractor={(_, i) => String(i)}
        columnWrapperStyle={{ gap: 8 }}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        renderItem={({ item, index }) => {
          const selected = sel.includes(index);
          const ratio = item.width / item.height;
          const h = cell * 1.3;
          const pw = ratio > cell / h ? cell - 16 : (h - 16) * ratio;
          const ph = pw / ratio;
          return (
            <Pressable
              onPress={() => toggle(index)}
              onLongPress={() => {
                pageMemory[id] = index + 1;
                nav.back();
              }}
              style={[st.cell, { width: cell, height: h + 22 }, selected && st.cellSel]}
            >
              <View style={{ height: h, alignItems: 'center', justifyContent: 'center' }}>
                <View style={[st.paper, { width: pw, height: ph }]}>
                  <MaterialCommunityIcons name="file-document-outline" size={22} color={colors.border} />
                  {item.rotation ? <Text style={st.rot}>{item.rotation}°</Text> : null}
                </View>
              </View>
              <Text style={[st.num, selected && { color: colors.primary }]}>{index + 1}</Text>
              {selected ? (
                <View style={st.check}>
                  <MaterialCommunityIcons name="check" size={14} color="#fff" />
                </View>
              ) : null}
            </Pressable>
          );
        }}
      />
      <View style={st.toolbar}>
        <IconButton icon="rotate-left" label="Left" disabled={!hasSel} onPress={() => edit('Rotating…', (d) => rotatePages(d, sel, -90), sel)} />
        <IconButton icon="rotate-right" label="Right" disabled={!hasSel} onPress={() => edit('Rotating…', (d) => rotatePages(d, sel, 90), sel)} />
        <IconButton icon="arrow-left-bold" label="Move" disabled={one <= 0} onPress={() => edit('Moving…', (d) => movePage(d, one, one - 1), [one - 1])} />
        <IconButton
          icon="arrow-right-bold"
          label="Move"
          disabled={one < 0 || one >= pages.length - 1}
          onPress={() => edit('Moving…', (d) => movePage(d, one, one + 1), [one + 1])}
        />
        <IconButton icon="content-copy" label="Copy" disabled={!hasSel} onPress={() => edit('Duplicating…', (d) => duplicatePages(d, sel))} />
        <IconButton
          icon="file-plus-outline"
          label="Blank"
          onPress={() => {
            const at = hasSel ? sel[sel.length - 1] + 1 : pages.length;
            edit('Inserting…', (d) => insertBlankPage(d, at), [at]);
          }}
        />
        <IconButton icon="export-variant" label="Extract" disabled={!hasSel} onPress={extract} />
        <IconButton icon="delete" label="Delete" disabled={!hasSel} onPress={del} />
      </View>
      <BusyOverlay label={busy} />
    </View>
  );
}

const st = StyleSheet.create({
  hint: { textAlign: 'center', color: colors.muted, fontSize: 12, paddingTop: 10 },
  cell: {
    backgroundColor: colors.surface,
    borderRadius: radius,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    overflow: 'hidden',
  },
  cellSel: { borderColor: colors.primary, backgroundColor: colors.selected },
  paper: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  rot: { fontSize: 10, color: colors.muted, marginTop: 2 },
  num: { fontWeight: '700', color: colors.text, marginBottom: 4 },
  check: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    backgroundColor: colors.surface,
    paddingVertical: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
