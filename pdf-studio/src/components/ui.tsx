import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, radius } from '../theme';

export type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export function Header({
  title,
  subtitle,
  onBack,
  onTitlePress,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  onTitlePress?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <View style={s.header}>
      {onBack ? <IconButton icon="arrow-left" color="#fff" onPress={onBack} /> : <View style={{ width: 8 }} />}
      <Pressable style={{ flex: 1, paddingHorizontal: 4 }} onPress={onTitlePress} disabled={!onTitlePress}>
        <Text numberOfLines={1} style={s.headerTitle}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={s.headerSub}>
            {subtitle}
          </Text>
        ) : null}
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>{right}</View>
    </View>
  );
}

export function IconButton({
  icon,
  onPress,
  color = colors.text,
  size = 24,
  disabled,
  active,
  label,
}: {
  icon: IconName;
  onPress?: () => void;
  color?: string;
  size?: number;
  disabled?: boolean;
  active?: boolean;
  label?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => [
        s.iconBtn,
        label ? { paddingHorizontal: 6, minWidth: 56 } : null,
        active && s.iconBtnActive,
        pressed && { opacity: 0.6 },
        disabled && { opacity: 0.35 },
      ]}
    >
      <MaterialCommunityIcons name={icon} size={size} color={active ? colors.primary : color} />
      {label ? (
        <Text style={[s.iconLabel, { color: active ? colors.primary : color }]} numberOfLines={1}>
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  icon,
  style,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger';
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const bg = kind === 'primary' ? colors.primary : kind === 'danger' ? '#DC2626' : colors.surface;
  const fg = kind === 'secondary' ? colors.text : '#fff';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.btn,
        { backgroundColor: bg, borderWidth: kind === 'secondary' ? 1 : 0 },
        pressed && { opacity: 0.8 },
        style,
      ]}
    >
      {icon ? <MaterialCommunityIcons name={icon} size={18} color={fg} style={{ marginRight: 6 }} /> : null}
      <Text style={[s.btnText, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function BusyOverlay({ label }: { label: string | null }) {
  if (!label) return null;
  return (
    <View style={s.busy} pointerEvents="auto">
      <View style={s.busyCard}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ marginTop: 12, color: colors.text }}>{label}</Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ prompt modal */

export type PromptField = {
  key: string;
  label: string;
  initial?: string;
  placeholder?: string;
  numeric?: boolean;
  multiline?: boolean;
};

export type PromptConfig = {
  title: string;
  message?: string;
  fields: PromptField[];
  submitLabel?: string;
  onSubmit: (values: Record<string, string>) => void;
};

export function PromptModal({ config, onClose }: { config: PromptConfig | null; onClose: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    if (config) setValues(Object.fromEntries(config.fields.map((f) => [f.key, f.initial ?? ''])));
  }, [config]);

  return (
    <Modal visible={!!config} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.modalBackdrop}>
        <View style={s.modalCard}>
          {config ? (
            <>
              <Text style={s.modalTitle}>{config.title}</Text>
              {config.message ? <Text style={s.modalMsg}>{config.message}</Text> : null}
              {config.fields.map((f, i) => (
                <View key={f.key} style={{ marginTop: 10 }}>
                  <Text style={s.fieldLabel}>{f.label}</Text>
                  <TextInput
                    autoFocus={i === 0}
                    value={values[f.key] ?? ''}
                    onChangeText={(t) => setValues((v) => ({ ...v, [f.key]: t }))}
                    placeholder={f.placeholder}
                    placeholderTextColor="#9CA3AF"
                    keyboardType={f.numeric ? 'number-pad' : 'default'}
                    multiline={f.multiline}
                    style={[s.input, f.multiline && { minHeight: 80, textAlignVertical: 'top' }]}
                  />
                </View>
              ))}
              <View style={s.modalActions}>
                <Button title="Cancel" kind="secondary" onPress={onClose} style={{ marginRight: 8 }} />
                <Button
                  title={config.submitLabel ?? 'OK'}
                  onPress={() => {
                    const v = values;
                    onClose();
                    config.onSubmit(v);
                  }}
                />
              </View>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------------ action sheet */

export type SheetAction = { icon: IconName; label: string; onPress: () => void; danger?: boolean };

export function ActionSheet({
  visible,
  title,
  actions,
  onClose,
}: {
  visible: boolean;
  title?: string;
  actions: SheetAction[];
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.sheetBackdrop} onPress={onClose}>
        <Pressable style={s.sheet} onPress={() => {}}>
          {title ? <Text style={s.sheetTitle}>{title}</Text> : null}
          <ScrollView style={{ maxHeight: 480 }}>
            {actions.map((a) => (
              <Pressable
                key={a.label}
                style={({ pressed }) => [s.sheetRow, pressed && { backgroundColor: colors.bg }]}
                onPress={() => {
                  onClose();
                  a.onPress();
                }}
              >
                <MaterialCommunityIcons name={a.icon} size={22} color={a.danger ? '#DC2626' : colors.text} />
                <Text style={[s.sheetLabel, a.danger && { color: '#DC2626' }]}>{a.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  header: {
    height: 56,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  headerSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12 },
  iconBtn: { padding: 8, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  iconBtnActive: { backgroundColor: colors.selected },
  iconLabel: { fontSize: 11, marginTop: 2 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius,
    borderColor: colors.border,
  },
  btnText: { fontWeight: '600', fontSize: 15 },
  busy: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  busyCard: { backgroundColor: '#fff', padding: 24, borderRadius: radius, alignItems: 'center', minWidth: 180 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: '#fff', borderRadius: radius, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  modalMsg: { marginTop: 6, color: colors.muted },
  fieldLabel: { fontSize: 13, color: colors.muted, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 18 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingBottom: 28, paddingTop: 8 },
  sheetTitle: { fontSize: 13, color: colors.muted, paddingHorizontal: 20, paddingVertical: 10, fontWeight: '600' },
  sheetRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14 },
  sheetLabel: { marginLeft: 16, fontSize: 16, color: colors.text },
});
