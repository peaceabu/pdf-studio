import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { BusyOverlay, Header, IconButton, PromptModal, type IconName, type PromptConfig } from '../components/ui';
import { countPages, createBlank, friendlyError, imagesToPdf, mergeDocuments } from '../pdf/ops';
import { loadImages, pickImages, pickPdfs } from '../pickers';
import {
  createFromBase64,
  deleteDoc,
  formatSize,
  importFile,
  listDocs,
  readBase64,
  renameDoc,
} from '../storage/library';
import { colors, radius } from '../theme';
import type { DocMeta, Nav } from '../types';

export default function HomeScreen({ nav }: { nav: Nav }) {
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<PromptConfig | null>(null);

  const refresh = useCallback(() => listDocs().then(setDocs), []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      Alert.alert('Something went wrong', friendlyError(e));
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const openPdf = async () => {
    const [file] = await pickPdfs(false);
    if (!file) return;
    await run('Importing…', async () => {
      const pages = await countPages(await readBase64(file.uri));
      const meta = await importFile(file.uri, file.name, pages);
      nav.push({ name: 'viewer', id: meta.id });
    });
  };

  const mergePdfs = async () => {
    const files = await pickPdfs(true);
    if (!files.length) return;
    if (files.length < 2) {
      Alert.alert('Merge PDFs', 'Select at least two PDF files (long-press to multi-select in the picker).');
      return;
    }
    await run(`Merging ${files.length} files…`, async () => {
      const b64s: string[] = [];
      for (const f of files) b64s.push(await readBase64(f.uri));
      const { b64, pages } = await mergeDocuments(b64s);
      const meta = await createFromBase64(b64, 'Merged document', pages);
      nav.push({ name: 'viewer', id: meta.id });
    });
  };

  const imagesPdf = async () => {
    const imgs = await pickImages(true);
    if (!imgs.length) return;
    await run('Creating PDF…', async () => {
      const { b64, pages } = await imagesToPdf(await loadImages(imgs));
      const meta = await createFromBase64(b64, 'Images', pages);
      nav.push({ name: 'viewer', id: meta.id });
    });
  };

  const blankPdf = () =>
    setPrompt({
      title: 'New blank PDF',
      fields: [
        { key: 'name', label: 'Name', initial: 'Untitled' },
        { key: 'pages', label: 'Number of pages (A4)', initial: '1', numeric: true },
      ],
      submitLabel: 'Create',
      onSubmit: (v) =>
        run('Creating…', async () => {
          const n = Math.max(1, Math.min(200, parseInt(v.pages, 10) || 1));
          const meta = await createFromBase64(await createBlank(n), v.name || 'Untitled', n);
          nav.push({ name: 'viewer', id: meta.id });
        }),
    });

  const docOptions = (d: DocMeta) =>
    Alert.alert(d.name, undefined, [
      {
        text: 'Rename',
        onPress: () =>
          setPrompt({
            title: 'Rename',
            fields: [{ key: 'name', label: 'Name', initial: d.name }],
            onSubmit: (v) => run('Renaming…', async () => void (await renameDoc(d, v.name))),
          }),
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Delete document?', `"${d.name}" will be removed from PDF Studio.`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => run('Deleting…', () => deleteDoc(d.id)) },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const actions: { icon: IconName; label: string; onPress: () => void }[] = [
    { icon: 'folder-open', label: 'Open PDF', onPress: openPdf },
    { icon: 'call-merge', label: 'Merge PDFs', onPress: mergePdfs },
    { icon: 'image-multiple', label: 'Images → PDF', onPress: imagesPdf },
    { icon: 'file-plus', label: 'Blank PDF', onPress: blankPdf },
  ];

  return (
    <View style={{ flex: 1 }}>
      <Header title="PDF Studio" subtitle="Read • Edit • Sign • Organize" />
      <FlatList
        data={docs}
        keyExtractor={(d) => d.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
        ListHeaderComponent={
          <>
            <View style={st.grid}>
              {actions.map((a) => (
                <Pressable
                  key={a.label}
                  onPress={a.onPress}
                  style={({ pressed }) => [st.tile, pressed && { opacity: 0.7 }]}
                >
                  <View style={st.tileIcon}>
                    <MaterialCommunityIcons name={a.icon} size={26} color={colors.primary} />
                  </View>
                  <Text style={st.tileLabel}>{a.label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={st.section}>Recent documents</Text>
          </>
        }
        ListEmptyComponent={
          <View style={st.empty}>
            <MaterialCommunityIcons name="file-pdf-box" size={64} color={colors.border} />
            <Text style={{ color: colors.muted, marginTop: 8, textAlign: 'center' }}>
              No documents yet.{'\n'}Tap “Open PDF” to get started.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => nav.push({ name: 'viewer', id: item.id })}
            onLongPress={() => docOptions(item)}
            style={({ pressed }) => [st.row, pressed && { backgroundColor: colors.bg }]}
          >
            <MaterialCommunityIcons name="file-pdf-box" size={40} color={colors.primary} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={st.rowTitle} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={st.rowSub}>
                {item.pageCount ? `${item.pageCount} page${item.pageCount === 1 ? '' : 's'} • ` : ''}
                {formatSize(item.size)} • {new Date(item.updatedAt).toLocaleDateString()}
              </Text>
            </View>
            <IconButton icon="dots-vertical" color={colors.muted} onPress={() => docOptions(item)} />
          </Pressable>
        )}
      />
      <Pressable style={({ pressed }) => [st.fab, pressed && { opacity: 0.85 }]} onPress={openPdf}>
        <MaterialCommunityIcons name="plus" size={30} color="#fff" />
      </Pressable>
      <PromptModal config={prompt} onClose={() => setPrompt(null)} />
      <BusyOverlay label={busy} />
    </View>
  );
}

const st = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  tile: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: radius,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 1,
  },
  tileIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.selected,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  tileLabel: { fontWeight: '600', color: colors.text, flexShrink: 1 },
  section: { marginTop: 12, marginBottom: 8, fontWeight: '700', color: colors.muted, fontSize: 13, letterSpacing: 0.5 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius,
    padding: 12,
    marginBottom: 8,
  },
  rowTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  rowSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  empty: { alignItems: 'center', paddingVertical: 48 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
});
