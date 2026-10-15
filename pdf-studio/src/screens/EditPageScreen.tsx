import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  Image,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Pdf from '../components/PdfView';
import Svg, { Image as SvgImage, Path, Rect, Text as SvgText } from 'react-native-svg';
import { BusyOverlay, Header, IconButton, PromptModal, type IconName, type PromptConfig } from '../components/ui';
import { pageGeo } from '../pdf/coords';
import { applyAnnotations, extractPages, friendlyError, loadDoc } from '../pdf/ops';
import { pickImages } from '../pickers';
import { currentUri, editDocument, getDoc, readBase64, writeTemp } from '../storage/library';
import { colors } from '../theme';
import type { Annotation, DocMeta, Nav, Pt } from '../types';

type Tool = 'pen' | 'highlight' | 'text' | 'rect' | 'whiteout' | 'image';

const TOOLS: { key: Tool; icon: IconName; label: string }[] = [
  { key: 'pen', icon: 'draw', label: 'Draw' },
  { key: 'highlight', icon: 'marker', label: 'Highlight' },
  { key: 'text', icon: 'format-text', label: 'Text' },
  { key: 'rect', icon: 'rectangle-outline', label: 'Box' },
  { key: 'whiteout', icon: 'eraser', label: 'Whiteout' },
  { key: 'image', icon: 'image', label: 'Image' },
];

const PALETTE = ['#1B1D22', '#E5322D', '#1D4ED8', '#16A34A', '#F59E0B', '#FFE400', '#9333EA', '#FFFFFF'];
const STROKES = [1.5, 3, 6];
const TEXT_SIZES = [10, 14, 20, 28];

export default function EditPageScreen({ id, page, nav }: { id: string; page: number; nav: Nav }) {
  const [meta, setMeta] = useState<DocMeta | null>(null);
  const [pageFile, setPageFile] = useState<string | null>(null);
  const [geo, setGeo] = useState<{ w: number; h: number } | null>(null); // page size in display units (pt)
  const [area, setArea] = useState<{ w: number; h: number } | null>(null);
  const [tool, setTool] = useState<Tool>('pen');
  const [colorsByTool, setColorsByTool] = useState<Record<string, string>>({
    pen: '#1D4ED8',
    highlight: '#FFE400',
    text: '#1B1D22',
    rect: '#E5322D',
  });
  const [stroke, setStroke] = useState(3);
  const [textSize, setTextSize] = useState(14);
  const [annots, setAnnots] = useState<Annotation[]>([]);
  const [draft, setDraft] = useState<Annotation | null>(null);
  const draftRef = useRef<Annotation | null>(null);
  const updateDraft = (d: Annotation | null) => {
    draftRef.current = d;
    setDraft(d);
  };
  const [busy, setBusy] = useState<string | null>('Loading page…');
  const [prompt, setPrompt] = useState<PromptConfig | null>(null);

  const color = colorsByTool[tool] ?? '#1B1D22';

  /* --------------------------------------------------------------- load page */
  useEffect(() => {
    (async () => {
      try {
        const m = await getDoc(id);
        if (!m) throw new Error('Document not found');
        setMeta(m);
        const doc = await loadDoc(await readBase64(currentUri(m)));
        const idx = Math.min(Math.max(page - 1, 0), doc.getPageCount() - 1);
        const g = pageGeo(doc.getPage(idx));
        setGeo({ w: g.dispW, h: g.dispH });
        // render just this page so react-native-pdf draws it exactly into our canvas box
        setPageFile(await writeTemp(await extractPages(doc, [idx]), 'page'));
      } catch (e) {
        Alert.alert('Cannot edit this page', friendlyError(e));
        nav.back();
      } finally {
        setBusy(null);
      }
    })();
  }, [id, page, nav]);

  /* --------------------------------------------------------------- back guard */
  const dirtyRef = useRef(false);
  dirtyRef.current = annots.length > 0;
  const leave = () => {
    if (!dirtyRef.current) return nav.back();
    Alert.alert('Discard changes?', 'Your annotations on this page have not been saved.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: nav.back },
    ]);
  };
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!dirtyRef.current) return false;
      leave();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --------------------------------------------------------------- layout */
  const box = useMemo(() => {
    if (!geo || !area) return null;
    const pad = 12;
    const k = Math.min((area.w - pad * 2) / geo.w, (area.h - pad * 2) / geo.h); // screen px per pt
    return { w: geo.w * k, h: geo.h * k, k };
  }, [geo, area]);

  /* --------------------------------------------------------------- gestures */
  const state = useRef({ tool, color, stroke, textSize, box, geo, start: { x: 0, y: 0 } as Pt });
  state.current = { ...state.current, tool, color, stroke, textSize, box, geo };

  const toUnits = (px: number, py: number): Pt => {
    const { box: b, geo: g } = state.current;
    if (!b || !g) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(g.w, px / b.k)),
      y: Math.max(0, Math.min(g.h, py / b.k)),
    };
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          const { locationX, locationY } = e.nativeEvent;
          state.current.start = { x: locationX, y: locationY };
          const p = toUnits(locationX, locationY);
          const { tool: t, color: c, stroke: w } = state.current;
          if (t === 'pen') updateDraft({ kind: 'ink', points: [p], color: c, width: w });
          else if (t === 'highlight') updateDraft({ kind: 'highlight', x: p.x, y: p.y, w: 0, h: 0, color: c });
          else if (t === 'whiteout') updateDraft({ kind: 'whiteout', x: p.x, y: p.y, w: 0, h: 0 });
          else if (t === 'rect') updateDraft({ kind: 'rect', x: p.x, y: p.y, w: 0, h: 0, color: c, width: w });
          else updateDraft(null);
        },
        onPanResponderMove: (_e, g) => {
          const d = draftRef.current;
          if (!d) return;
          const { start } = state.current;
          const p = toUnits(start.x + g.dx, start.y + g.dy);
          if (d.kind === 'ink') {
            const last = d.points[d.points.length - 1];
            if (Math.abs(last.x - p.x) + Math.abs(last.y - p.y) < 0.8) return; // skip tiny moves
            updateDraft({ ...d, points: [...d.points, p] });
          } else if (d.kind === 'highlight' || d.kind === 'whiteout' || d.kind === 'rect') {
            const s0 = toUnits(start.x, start.y);
            updateDraft({
              ...d,
              x: Math.min(s0.x, p.x),
              y: Math.min(s0.y, p.y),
              w: Math.abs(p.x - s0.x),
              h: Math.abs(p.y - s0.y),
            });
          }
        },
        onPanResponderRelease: (_e, g) => {
          const { tool: t, start } = state.current;
          const tap = Math.abs(g.dx) < 6 && Math.abs(g.dy) < 6;
          if (t === 'text' && tap) return askText(toUnits(start.x, start.y));
          if (t === 'image' && tap) return placeImage(toUnits(start.x, start.y));
          const d = draftRef.current;
          if (d) {
            const keep = d.kind === 'ink' || ('w' in d && 'h' in d && d.w > 3 && d.h > 3);
            if (keep) setAnnots((a) => [...a, d]);
          }
          updateDraft(null);
        },
        onPanResponderTerminate: () => updateDraft(null),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const askText = (p: Pt) => {
    const { color: c, textSize: size } = state.current;
    setPrompt({
      title: 'Add text',
      fields: [{ key: 't', label: `Text (size ${size}pt)`, multiline: true }],
      submitLabel: 'Add',
      onSubmit: (v) => {
        const text = v.t.replace(/\r/g, '');
        if (!text.trim()) return;
        setAnnots((a) => [...a, { kind: 'text', x: p.x, y: p.y + size * 0.8, text, size, color: c }]);
      },
    });
  };

  const placeImage = async (p: Pt) => {
    const [img] = await pickImages(false);
    if (!img) return;
    Image.getSize(
      img.uri,
      (iw, ih) => {
        const g = state.current.geo!;
        const w = g.w * 0.35;
        const h = (w * ih) / iw;
        const x = Math.max(0, Math.min(g.w - w, p.x - w / 2));
        const y = Math.max(0, Math.min(g.h - h, p.y - h / 2));
        setAnnots((a) => [...a, { kind: 'image', x, y, w, h, uri: img.uri, mime: img.mime }]);
      },
      () => Alert.alert('Image', 'Could not read this image.'),
    );
  };

  /* --------------------------------------------------------------- save */
  const save = async () => {
    if (!meta || !annots.length) return nav.back();
    setBusy('Saving…');
    try {
      const imageData: Record<string, string> = {};
      for (const a of annots) if (a.kind === 'image' && !imageData[a.uri]) imageData[a.uri] = await readBase64(a.uri);
      await editDocument(meta, (doc) => applyAnnotations(doc, page - 1, annots, imageData));
      setAnnots([]);
      dirtyRef.current = false;
      nav.back();
    } catch (e) {
      Alert.alert('Could not save', friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  /* --------------------------------------------------------------- render */
  const renderAnnot = (a: Annotation, i: number | string) => {
    switch (a.kind) {
      case 'ink':
        return (
          <Path
            key={i}
            d={a.points.map((p, j) => `${j ? 'L' : 'M'}${p.x} ${p.y}`).join(' ') + (a.points.length === 1 ? ' l0.01 0' : '')}
            stroke={a.color}
            strokeWidth={a.width}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        );
      case 'highlight':
        return <Rect key={i} x={a.x} y={a.y} width={a.w} height={a.h} fill={a.color} opacity={0.4} />;
      case 'whiteout':
        return <Rect key={i} x={a.x} y={a.y} width={a.w} height={a.h} fill="#fff" stroke="#ccc" strokeWidth={0.5} strokeDasharray="2,2" />;
      case 'rect':
        return <Rect key={i} x={a.x} y={a.y} width={a.w} height={a.h} fill="none" stroke={a.color} strokeWidth={a.width} />;
      case 'text':
        return a.text.split('\n').map((line, j) => (
          <SvgText key={`${i}-${j}`} x={a.x} y={a.y + j * a.size * 1.2} fontSize={a.size} fill={a.color} fontFamily="sans-serif">
            {line}
          </SvgText>
        ));
      case 'image':
        return <SvgImage key={i} x={a.x} y={a.y} width={a.w} height={a.h} href={{ uri: a.uri }} preserveAspectRatio="none" />;
    }
  };

  const hint =
    tool === 'text'
      ? 'Tap where the text should start'
      : tool === 'image'
        ? 'Tap to place an image (signature, stamp, logo…)'
        : tool === 'whiteout'
          ? 'Drag to cover existing content with white'
          : tool === 'pen'
            ? 'Draw or sign with your finger'
            : 'Drag to draw a rectangle';

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <Header
        title={`Edit page ${page}`}
        subtitle={meta?.name}
        onBack={leave}
        right={
          <>
            <IconButton icon="undo-variant" color="#fff" disabled={!annots.length} onPress={() => setAnnots((a) => a.slice(0, -1))} />
            <IconButton
              icon="delete-sweep"
              color="#fff"
              disabled={!annots.length}
              onPress={() =>
                Alert.alert('Clear all?', 'Remove all unsaved annotations on this page?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Clear', style: 'destructive', onPress: () => setAnnots([]) },
                ])
              }
            />
            <IconButton icon="check" color="#fff" onPress={save} />
          </>
        }
      />

      <View style={st.area} onLayout={(e: LayoutChangeEvent) => setArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {box && pageFile && geo ? (
          <View style={{ width: box.w, height: box.h, backgroundColor: '#fff' }}>
            <Pdf
              source={{ uri: pageFile, cache: false }}
              singlePage
              spacing={0}
              fitPolicy={0}
              minScale={1}
              maxScale={1}
              scrollEnabled={false}
              style={{ width: box.w, height: box.h, backgroundColor: '#fff' }}
            />
            <Svg
              style={StyleSheet.absoluteFill}
              width={box.w}
              height={box.h}
              viewBox={`0 0 ${geo.w} ${geo.h}`}
              pointerEvents="none"
            >
              {annots.map(renderAnnot)}
              {draft ? renderAnnot(draft, 'draft') : null}
            </Svg>
            <View style={StyleSheet.absoluteFill} {...responder.panHandlers} />
          </View>
        ) : null}
      </View>

      <View style={st.panel}>
        <Text style={st.hint}>{hint}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.row}>
          {TOOLS.map((t) => (
            <IconButton key={t.key} icon={t.icon} label={t.label} active={tool === t.key} onPress={() => setTool(t.key)} />
          ))}
        </ScrollView>

        {tool !== 'whiteout' && tool !== 'image' ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[st.row, { paddingVertical: 6 }]}>
            {PALETTE.map((c) => (
              <Pressable
                key={c}
                onPress={() => setColorsByTool((m) => ({ ...m, [tool]: c }))}
                style={[st.swatch, { backgroundColor: c }, color === c && st.swatchActive]}
              />
            ))}
            <View style={st.divider} />
            {tool === 'text'
              ? TEXT_SIZES.map((sz) => (
                  <Pressable key={sz} onPress={() => setTextSize(sz)} style={[st.chip, textSize === sz && st.chipActive]}>
                    <Text style={[st.chipText, textSize === sz && { color: colors.primary }]}>{sz}</Text>
                  </Pressable>
                ))
              : tool === 'pen' || tool === 'rect'
                ? STROKES.map((w) => (
                    <Pressable key={w} onPress={() => setStroke(w)} style={[st.chip, stroke === w && st.chipActive]}>
                      <View style={{ width: 22, height: w * 1.5, borderRadius: w, backgroundColor: stroke === w ? colors.primary : colors.text }} />
                    </Pressable>
                  ))
                : null}
          </ScrollView>
        ) : null}
      </View>

      <PromptModal config={prompt} onClose={() => setPrompt(null)} />
      <BusyOverlay label={busy} />
    </View>
  );
}

const st = StyleSheet.create({
  area: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  panel: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
    paddingBottom: 6,
  },
  hint: { textAlign: 'center', color: colors.muted, fontSize: 12, marginBottom: 2 },
  row: { paddingHorizontal: 10, alignItems: 'center' },
  swatch: { width: 30, height: 30, borderRadius: 15, marginHorizontal: 5, borderWidth: 1, borderColor: colors.border },
  swatchActive: { borderWidth: 3, borderColor: colors.primary },
  divider: { width: 1, height: 26, backgroundColor: colors.border, marginHorizontal: 8 },
  chip: {
    minWidth: 40,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
    paddingHorizontal: 8,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.selected },
  chipText: { fontWeight: '600', color: colors.text },
});
