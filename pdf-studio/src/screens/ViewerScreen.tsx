import * as Sharing from 'expo-sharing';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import Pdf from 'react-native-pdf';
import {
  ActionSheet,
  BusyOverlay,
  Header,
  IconButton,
  PromptModal,
  type PromptConfig,
  type SheetAction,
} from '../components/ui';
import {
  addPageNumbers,
  addWatermark,
  appendDocument,
  appendImages,
  extractPages,
  friendlyError,
  getMetadata,
  loadDoc,
  parseRanges,
  setMetadata,
  type PageNumberFormat,
} from '../pdf/ops';
import { loadImages, pickImages, pickPdfs } from '../pickers';
import {
  canUndo,
  createFromBase64,
  currentUri,
  editDocument,
  exportCopy,
  formatSize,
  getDoc,
  readBase64,
  renameDoc,
  saveToDevice,
  undo,
  updatePageCount,
} from '../storage/library';
import { colors } from '../theme';
import type { DocMeta, Nav } from '../types';

/** remembers the last page viewed per document while the app is running */
export const pageMemory: Record<string, number> = {};

export default function ViewerScreen({ id, nav }: { id: string; nav: Nav }) {
  const [meta, setMeta] = useState<DocMeta | null>(null);
  const [page, setPage] = useState(pageMemory[id] ?? 1);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<PromptConfig | null>(null);
  const [tools, setTools] = useState(false);
  const [password, setPassword] = useState<string | undefined>();
  const [horizontal, setHorizontal] = useState(false);
  const pdfRef = useRef<any>(null);

  useEffect(() => {
    getDoc(id).then((m) => {
      if (!m) {
        Alert.alert('Not found', 'This document no longer exists.');
        nav.back();
      } else setMeta(m);
    });
  }, [id, nav]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      Alert.alert('Something went wrong', friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  /** apply a pdf-lib mutation and save it as a new (undoable) version */
  const edit = (label: string, mutate: Parameters<typeof editDocument>[1]) =>
    run(label, async () => {
      if (!meta) return;
      setMeta(await editDocument(meta, mutate));
    });

  if (!meta) return <View style={{ flex: 1, backgroundColor: colors.canvas }} />;

  /* ------------------------------------------------------------- actions */

  const rename = () =>
    setPrompt({
      title: 'Rename document',
      fields: [{ key: 'name', label: 'Name', initial: meta.name }],
      onSubmit: (v) => run('Renaming…', async () => setMeta(await renameDoc(meta, v.name))),
    });

  const jumpTo = () =>
    setPrompt({
      title: 'Go to page',
      fields: [{ key: 'p', label: `Page (1 – ${total || meta.pageCount})`, numeric: true }],
      submitLabel: 'Go',
      onSubmit: (v) => {
        const n = parseInt(v.p, 10);
        if (n >= 1 && n <= (total || meta.pageCount)) pdfRef.current?.setPage(n);
      },
    });

  const share = () =>
    run('Preparing…', async () => {
      const uri = await exportCopy(meta);
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: meta.name, UTI: 'com.adobe.pdf' });
    });

  const save = () =>
    run('Saving…', async () => {
      if (await saveToDevice(meta)) Alert.alert('Saved', `"${meta.name}.pdf" was saved to the selected folder.`);
    });

  const doUndo = () => run('Undoing…', async () => setMeta(await undo(meta)));

  const pageNumbers = () =>
    Alert.alert('Add page numbers', 'Choose a format (added at the bottom-centre of every page).', [
      { text: '1, 2, 3', onPress: () => applyNumbers('n') },
      { text: 'Page 1', onPress: () => applyNumbers('page-n') },
      { text: 'Page 1 of N', onPress: () => applyNumbers('page-n-of-t') },
    ]);
  const applyNumbers = (f: PageNumberFormat) => edit('Adding page numbers…', (doc) => addPageNumbers(doc, f));

  const watermark = () =>
    setPrompt({
      title: 'Add watermark',
      message: 'Diagonal text stamped on every page.',
      fields: [
        { key: 'text', label: 'Text', initial: 'CONFIDENTIAL' },
        { key: 'opacity', label: 'Opacity % (5–60)', initial: '15', numeric: true },
      ],
      submitLabel: 'Apply',
      onSubmit: (v) => {
        if (!v.text.trim()) return;
        const op = Math.max(5, Math.min(60, parseInt(v.opacity, 10) || 15)) / 100;
        edit('Adding watermark…', (doc) => addWatermark(doc, v.text.trim(), op));
      },
    });

  const extract = () =>
    setPrompt({
      title: 'Extract pages',
      message: 'Creates a new PDF containing only these pages.',
      fields: [{ key: 'r', label: 'Pages (e.g. 1-3, 5, 8-10)', initial: `${page}` }],
      submitLabel: 'Extract',
      onSubmit: (v) =>
        run('Extracting…', async () => {
          const doc = await loadDoc(await readBase64(currentUri(meta)));
          const idx = parseRanges(v.r, doc.getPageCount());
          const b64 = await extractPages(doc, idx);
          const created = await createFromBase64(b64, `${meta.name} (pages ${v.r.replace(/\s/g, '')})`, idx.length);
          Alert.alert('Done', `Created "${created.name}".`, [
            { text: 'Stay here' },
            { text: 'Open it', onPress: () => nav.replace({ name: 'viewer', id: created.id }) },
          ]);
        }),
    });

  const appendPdf = async () => {
    const files = await pickPdfs(true);
    if (!files.length) return;
    edit('Appending…', async (doc) => {
      for (const f of files) await appendDocument(doc, await readBase64(f.uri));
    });
  };

  const addImages = async () => {
    const imgs = await pickImages(true);
    if (!imgs.length) return;
    const data = await loadImages(imgs);
    edit('Adding images…', (doc) => appendImages(doc, data));
  };

  const properties = () =>
    run('Loading…', async () => {
      const doc = await loadDoc(await readBase64(currentUri(meta)));
      const m = getMetadata(doc);
      setPrompt({
        title: 'Document properties',
        message: `${doc.getPageCount()} pages • ${formatSize(meta.size)}`,
        fields: [
          { key: 'title', label: 'Title', initial: m.title },
          { key: 'author', label: 'Author', initial: m.author },
          { key: 'subject', label: 'Subject', initial: m.subject },
          { key: 'keywords', label: 'Keywords (comma separated)', initial: m.keywords },
        ],
        submitLabel: 'Save',
        onSubmit: (v) =>
          edit('Saving…', (d) =>
            setMetadata(d, { title: v.title, author: v.author, subject: v.subject, keywords: v.keywords }),
          ),
      });
    });

  const toolActions: SheetAction[] = [
    { icon: 'pencil', label: 'Annotate / sign this page', onPress: () => nav.push({ name: 'edit', id, page }) },
    { icon: 'file-document-multiple', label: 'Organize pages', onPress: () => nav.push({ name: 'pages', id }) },
    { icon: 'numeric', label: 'Add page numbers', onPress: pageNumbers },
    { icon: 'water', label: 'Add watermark', onPress: watermark },
    { icon: 'content-cut', label: 'Extract pages to new PDF', onPress: extract },
    { icon: 'file-plus', label: 'Append another PDF', onPress: appendPdf },
    { icon: 'image-plus', label: 'Append images as pages', onPress: addImages },
    { icon: 'information-outline', label: 'Properties (title, author…)', onPress: properties },
    { icon: 'rename-box', label: 'Rename', onPress: rename },
    {
      icon: horizontal ? 'swap-vertical' : 'swap-horizontal',
      label: horizontal ? 'Vertical scrolling' : 'Horizontal (book) mode',
      onPress: () => setHorizontal((h) => !h),
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <Header
        title={meta.name}
        subtitle={`${formatSize(meta.size)}${canUndo(meta) ? ' • edited' : ''}`}
        onBack={nav.back}
        onTitlePress={rename}
        right={
          <>
            <IconButton icon="undo" color="#fff" disabled={!canUndo(meta)} onPress={doUndo} />
            <IconButton icon="share-variant" color="#fff" onPress={share} />
            <IconButton icon="content-save" color="#fff" onPress={save} />
          </>
        }
      />

      <View style={{ flex: 1 }}>
        <Pdf
          key={`${currentUri(meta)}-${horizontal}-${password ?? ''}`}
          ref={pdfRef}
          source={{ uri: currentUri(meta), cache: false }}
          page={page}
          password={password}
          horizontal={horizontal}
          enablePaging={horizontal}
          spacing={8}
          minScale={1}
          maxScale={5}
          enableAntialiasing
          trustAllCerts={false}
          style={st.pdf}
          onLoadComplete={(n) => {
            setTotal(n);
            if (n !== meta.pageCount) updatePageCount(meta, n).then(setMeta);
          }}
          onPageChanged={(p, n) => {
            setPage(p);
            setTotal(n);
            pageMemory[id] = p;
          }}
          onError={(err: any) => {
            const msg = String(err?.message ?? err);
            if (/password/i.test(msg)) {
              setPrompt({
                title: 'Password required',
                message: 'This PDF is protected. Enter its password to view it.',
                fields: [{ key: 'pw', label: 'Password' }],
                submitLabel: 'Unlock',
                onSubmit: (v) => setPassword(v.pw),
              });
            } else {
              Alert.alert('Cannot display PDF', msg);
            }
          }}
        />
        {total > 0 ? (
          <Text style={st.pageBadge} onPress={jumpTo}>
            {page} / {total}
          </Text>
        ) : null}
      </View>

      <View style={st.toolbar}>
        <IconButton icon="pencil" label="Annotate" onPress={() => nav.push({ name: 'edit', id, page })} />
        <IconButton icon="draw-pen" label="Sign" onPress={() => nav.push({ name: 'edit', id, page })} />
        <IconButton icon="file-document-multiple" label="Pages" onPress={() => nav.push({ name: 'pages', id })} />
        <IconButton icon="book-open-page-variant" label="Go to" onPress={jumpTo} />
        <IconButton icon="dots-grid" label="Tools" onPress={() => setTools(true)} />
      </View>

      <ActionSheet visible={tools} title="TOOLS" actions={toolActions} onClose={() => setTools(false)} />
      <PromptModal config={prompt} onClose={() => setPrompt(null)} />
      <BusyOverlay label={busy} />
    </View>
  );
}

const st = StyleSheet.create({
  pdf: { flex: 1, backgroundColor: colors.canvas },
  pageBadge: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    color: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    overflow: 'hidden',
    fontWeight: '600',
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.surface,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
