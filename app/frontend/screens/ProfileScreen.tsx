import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  TextInput,
  ActivityIndicator,
  Modal,
  Pressable,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

const DIETARY_OPTIONS = [
  'Vegetarian', 'Vegan', 'Halal', 'Kosher', 'Gluten-Free',
  'Lactose-Free', 'Nut-Free', 'Dairy-Free', 'Keto', 'Paleo',
];

const LANGUAGES = [
  'English', 'Hindi', 'Spanish', 'French', 'Arabic',
  'Mandarin', 'Portuguese', 'German', 'Urdu', 'Bengali',
];

// ─── Sub-components (memoised) ────────────────────────────────────────────────

interface EditableRowProps {
  icon: string;
  label: string;
  value: string;
  onPress: () => void;
}

const EditableRow = React.memo(({ icon, label, value, onPress }: EditableRowProps) => (
  <TouchableOpacity
    style={styles.editRow}
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={`Edit ${label}`}
    hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}
  >
    <View style={styles.editRowIcon}>
      <MaterialCommunityIcons name={icon as any} size={18} color="#3B82F6" />
    </View>
    <View style={styles.editRowContent}>
      <Text style={styles.editRowLabel}>{label}</Text>
      <Text style={styles.editRowValue} numberOfLines={1}>
        {value || <Text style={styles.editRowPlaceholder}>Tap to set</Text>}
      </Text>
    </View>
    <MaterialCommunityIcons name="pencil-outline" size={16} color="#CBD5E1" />
  </TouchableOpacity>
));

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { user, profile, signOut, refreshProfile } = useAuth();

  // Edit modal state
  const [editField, setEditField] = useState<
    'full_name' | 'home_country' | 'preferred_language' | 'dietary_preferences' | null
  >(null);
  const [editText, setEditText] = useState('');
  const [editDiet, setEditDiet] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // ── Derived ─────────────────────────────────────────────────────────────────

  const fullName = profile?.full_name || user?.user_metadata?.full_name || '';
  const initials = (() => {
    if (!fullName) return (user?.email?.[0] ?? '?').toUpperCase();
    const parts = fullName.trim().split(' ');
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : fullName[0].toUpperCase();
  })();
  const dietaryPrefs: string[] = profile?.dietary_preferences ?? [];

  // ── Edit helpers ─────────────────────────────────────────────────────────────

  const openEdit = useCallback((field: typeof editField) => {
    setEditField(field);
    if (field === 'dietary_preferences') {
      setEditDiet(profile?.dietary_preferences ?? []);
    } else if (field === 'full_name') {
      setEditText(fullName);
    } else if (field === 'home_country') {
      setEditText(profile?.home_country ?? '');
    } else if (field === 'preferred_language') {
      setEditText(profile?.preferred_language ?? '');
    }
  }, [profile, fullName]);

  const closeEdit = useCallback(() => {
    setEditField(null);
    setEditText('');
    setEditDiet([]);
  }, []);

  const toggleDiet = useCallback((pref: string) => {
    setEditDiet(prev =>
      prev.includes(pref) ? prev.filter(p => p !== pref) : [...prev, pref]
    );
  }, []);

  const saveEdit = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    try {
      const update: Record<string, any> = { updated_at: new Date().toISOString() };

      if (editField === 'dietary_preferences') {
        update.dietary_preferences = editDiet;
      } else if (editField === 'full_name') {
        update.full_name = editText.trim();
      } else if (editField === 'home_country') {
        update.home_country = editText.trim();
      } else if (editField === 'preferred_language') {
        update.preferred_language = editText.trim();
      }

      const { error } = await supabase
        .from('profiles')
        .update(update)
        .eq('id', user.id);

      if (error) throw error;
      await refreshProfile();
      closeEdit();
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  }, [editField, editText, editDiet, user, refreshProfile, closeEdit]);

  const handleSignOut = useCallback(() => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  }, [signOut]);

  // ── Edit modal content ───────────────────────────────────────────────────────

  const renderEditContent = () => {
    if (editField === 'dietary_preferences') {
      return (
        <>
          <Text style={styles.modalSubtitle}>Select all that apply</Text>
          <View style={styles.chipGrid}>
            {DIETARY_OPTIONS.map(opt => {
              const active = editDiet.includes(opt);
              return (
                <TouchableOpacity
                  key={opt}
                  style={[styles.optionChip, active && styles.optionChipActive]}
                  onPress={() => toggleDiet(opt)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: active }}
                >
                  {active && <MaterialCommunityIcons name="check" size={12} color="#fff" style={{ marginRight: 4 }} />}
                  <Text style={[styles.optionChipText, active && styles.optionChipTextActive]}>
                    {opt}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      );
    }

    if (editField === 'preferred_language') {
      return (
        <>
          <Text style={styles.modalSubtitle}>Select a language</Text>
          <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
            {LANGUAGES.map(lang => {
              const active = editText === lang;
              return (
                <TouchableOpacity
                  key={lang}
                  style={[styles.langRow, active && styles.langRowActive]}
                  onPress={() => setEditText(lang)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.langText, active && styles.langTextActive]}>{lang}</Text>
                  {active && <MaterialCommunityIcons name="check" size={18} color="#3B82F6" />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </>
      );
    }

    return (
      <TextInput
        style={styles.modalInput}
        value={editText}
        onChangeText={setEditText}
        placeholder={editField === 'full_name' ? 'Your name' : 'Enter value'}
        placeholderTextColor="#94A3B8"
        autoFocus
        autoCapitalize={editField === 'home_country' ? 'words' : 'sentences'}
        returnKeyType="done"
        onSubmitEditing={saveEdit}
      />
    );
  };

  const modalTitles: Record<string, string> = {
    full_name: 'Edit Name',
    home_country: 'Home Country',
    preferred_language: 'Preferred Language',
    dietary_preferences: 'Dietary Preferences',
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero: avatar + name ────────────────────────────────────────── */}
        <View style={styles.hero}>
          <TouchableOpacity
            style={styles.avatarWrap}
            onPress={() => openEdit('full_name')}
            accessibilityLabel="Edit name"
            accessibilityRole="button"
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={styles.avatarEdit}>
              <MaterialCommunityIcons name="pencil" size={10} color="#fff" />
            </View>
          </TouchableOpacity>

          <Text style={styles.displayName}>{fullName || 'Your Name'}</Text>
          <Text style={styles.emailText}>{user?.email}</Text>

          <View style={styles.memberBadge}>
            <MaterialCommunityIcons name="earth" size={11} color="#3B82F6" />
            <Text style={styles.memberBadgeText}>Cartographer Member</Text>
          </View>
        </View>

        {/* ── Travel Profile ─────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Travel Profile</Text>

          <View style={styles.card}>
            <EditableRow
              icon="home-outline"
              label="Home Country"
              value={profile?.home_country ?? ''}
              onPress={() => openEdit('home_country')}
            />
            <View style={styles.divider} />
            <EditableRow
              icon="translate"
              label="Preferred Language"
              value={profile?.preferred_language ?? ''}
              onPress={() => openEdit('preferred_language')}
            />
            <View style={styles.divider} />

            {/* Dietary prefs – tappable chips */}
            <TouchableOpacity
              style={styles.editRow}
              onPress={() => openEdit('dietary_preferences')}
              accessibilityRole="button"
              accessibilityLabel="Edit dietary preferences"
            >
              <View style={styles.editRowIcon}>
                <MaterialCommunityIcons name="leaf" size={18} color="#3B82F6" />
              </View>
              <View style={styles.editRowContent}>
                <Text style={styles.editRowLabel}>Dietary Preferences</Text>
                {dietaryPrefs.length > 0 ? (
                  <View style={styles.miniChipRow}>
                    {dietaryPrefs.map(p => (
                      <View key={p} style={styles.miniChip}>
                        <Text style={styles.miniChipText}>{p}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.editRowPlaceholder}>Tap to set</Text>
                )}
              </View>
              <MaterialCommunityIcons name="pencil-outline" size={16} color="#CBD5E1" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Account ───────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Account</Text>
          <View style={styles.card}>
            <View style={styles.staticRow}>
              <View style={styles.editRowIcon}>
                <MaterialCommunityIcons name="email-outline" size={18} color="#64748B" />
              </View>
              <View style={styles.editRowContent}>
                <Text style={styles.editRowLabel}>Email</Text>
                <Text style={styles.editRowValue}>{user?.email}</Text>
              </View>
            </View>
            <View style={styles.divider} />
            <View style={styles.staticRow}>
              <View style={[styles.editRowIcon, { backgroundColor: '#F0FDF4' }]}>
                <MaterialCommunityIcons name="shield-check" size={18} color="#16A34A" />
              </View>
              <View style={styles.editRowContent}>
                <Text style={styles.editRowLabel}>Account Status</Text>
                <View style={styles.verifiedRow}>
                  <MaterialCommunityIcons name="check-circle" size={13} color="#16A34A" />
                  <Text style={styles.verifiedText}>Verified</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* ── About ─────────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>About</Text>
          <View style={styles.card}>
            <View style={styles.aboutRow}>
              <View style={[styles.editRowIcon, { width: 42, height: 42, borderRadius: 12 }]}>
                <MaterialCommunityIcons name="map-legend" size={22} color="#3B82F6" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.aboutTitle}>Your grocery compass abroad</Text>
                <Text style={styles.aboutBody}>
                  Find foods from home, get cultural substitutions, and shop smarter anywhere.
                </Text>
              </View>
            </View>
            <View style={styles.divider} />
            <View style={styles.versionRow}>
              <Text style={styles.versionLabel}>Version</Text>
              <Text style={styles.versionValue}>1.0.0 MVP</Text>
            </View>
          </View>
        </View>

        {/* ── Sign Out ──────────────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.signOutBtn}
          onPress={handleSignOut}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          <MaterialCommunityIcons name="logout" size={20} color="#EF4444" />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── Edit Modal ────────────────────────────────────────────────────── */}
      <Modal
        visible={editField !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeEdit}
      >
        <SafeAreaView style={styles.modal}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity
              style={styles.modalCancel}
              onPress={closeEdit}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {editField ? modalTitles[editField] : ''}
            </Text>
            <TouchableOpacity
              style={[styles.modalSaveBtn, saving && { opacity: 0.6 }]}
              onPress={saveEdit}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Save"
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.modalSaveText}>Save</Text>}
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.modalBody}
            contentContainerStyle={{ paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            {renderEditContent()}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' },
  scrollContent: { paddingBottom: 16 },

  // Hero
  hero: {
    alignItems: 'center',
    paddingTop: 28,
    paddingBottom: 28,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    marginBottom: 24,
  },
  avatarWrap: { position: 'relative', marginBottom: 14 },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: '#fff', fontSize: 28, fontWeight: '800', letterSpacing: 1 },
  avatarEdit: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  displayName: { fontSize: 20, fontWeight: '800', color: '#0F172A', marginBottom: 4 },
  emailText: { fontSize: 13, color: '#64748B', marginBottom: 12 },
  memberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    gap: 5,
  },
  memberBadgeText: { fontSize: 12, color: '#3B82F6', fontWeight: '700' },

  // Sections
  section: { marginBottom: 8 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    marginHorizontal: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    marginHorizontal: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },

  // Rows
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 60, // ≥44pt guaranteed
  },
  staticRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 60,
  },
  editRowIcon: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  editRowContent: { flex: 1 },
  editRowLabel: { fontSize: 11, color: '#94A3B8', fontWeight: '600', marginBottom: 2 },
  editRowValue: { fontSize: 15, color: '#0F172A', fontWeight: '600' },
  editRowPlaceholder: { fontSize: 14, color: '#CBD5E1', fontStyle: 'italic' },

  divider: { height: 1, backgroundColor: '#F1F5F9', marginLeft: 62 },

  // Mini chips in dietary row
  miniChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  miniChip: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  miniChipText: { fontSize: 11, color: '#16A34A', fontWeight: '700' },

  // Verified badge
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  verifiedText: { fontSize: 13, color: '#16A34A', fontWeight: '700' },

  // About
  aboutRow: { flexDirection: 'row', alignItems: 'flex-start', padding: 16 },
  aboutTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 4 },
  aboutBody: { fontSize: 13, color: '#64748B', lineHeight: 19 },
  versionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  versionLabel: { fontSize: 14, color: '#64748B' },
  versionValue: { fontSize: 14, fontWeight: '600', color: '#0F172A' },

  // Sign out
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: 24,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: '#FEF2F2',
    gap: 8,
    minHeight: 56,
  },
  signOutText: { color: '#EF4444', fontWeight: '700', fontSize: 16 },

  // Modal
  modal: { flex: 1, backgroundColor: '#F1F5F9' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#fff',
  },
  modalCancel: { paddingVertical: 4, paddingRight: 8, minWidth: 60 },
  modalCancelText: { fontSize: 16, color: '#64748B', fontWeight: '500' },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  modalSaveBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 60,
    alignItems: 'center',
    minHeight: 36,
    justifyContent: 'center',
  },
  modalSaveText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  modalBody: { flex: 1, padding: 20 },
  modalSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 16,
    fontWeight: '500',
  },
  modalInput: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#0F172A',
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    minHeight: 52,
  },

  // Dietary chip grid
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  optionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    minHeight: 44,
  },
  optionChipActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  optionChipText: { fontSize: 14, color: '#475569', fontWeight: '600' },
  optionChipTextActive: { color: '#fff' },

  // Language list
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 8,
    minHeight: 52,
  },
  langRowActive: { backgroundColor: '#EFF6FF', borderWidth: 1.5, borderColor: '#BFDBFE' },
  langText: { fontSize: 15, color: '#475569', fontWeight: '500' },
  langTextActive: { color: '#2563EB', fontWeight: '700' },
});
