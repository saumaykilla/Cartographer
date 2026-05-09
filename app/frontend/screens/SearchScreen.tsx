import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  FlatList, SafeAreaView, ActivityIndicator, Alert,
  Animated, Modal, Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../lib/supabase';
import { searchIngredientSubstitutions, SubstitutionResult } from '../lib/gemini';
import { useAuth } from '../context/AuthContext';

interface ShoppingList { id: string; name: string; title?: string; }

const PRICE_COLORS = {
  budget: { bg: '#F0FDF4', text: '#16A34A', label: '💚 Budget' },
  mid:    { bg: '#EFF6FF', text: '#2563EB', label: '💙 Mid' },
  premium:{ bg: '#FDF4FF', text: '#9333EA', label: '💜 Premium' },
};

function getScoreColor(s: number) {
  if (s >= 90) return { bg: '#ECFDF5', text: '#059669' };
  if (s >= 75) return { bg: '#EFF6FF', text: '#3B82F6' };
  return { bg: '#FFF7ED', text: '#EA580C' };
}

// ── Memoised result card ──────────────────────────────────────────────────────
interface CardProps {
  item: SubstitutionResult;
  isAdded: boolean;
  isAdding: boolean;
  onAdd: (item: SubstitutionResult) => void;
}
const ResultCard = React.memo(({ item, isAdded, isAdding, onAdd }: CardProps) => {
  const sc = getScoreColor(item.matchScore);
  const pc = PRICE_COLORS[item.priceRange] ?? PRICE_COLORS.mid;
  return (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <View style={{ flex: 1, marginRight: 10 }}>
          <Text style={s.cardName}>{item.name}</Text>
          <Text style={s.cardSub}>{item.brand} · {item.category}</Text>
        </View>
        <View style={[s.scoreBadge, { backgroundColor: sc.bg }]}>
          <Text style={[s.scoreText, { color: sc.text }]}>{item.matchScore}%</Text>
        </View>
      </View>
      <Text style={s.desc}>{item.description}</Text>
      {(item.dietaryFlags ?? []).length > 0 && (
        <View style={s.flagRow}>
          {item.dietaryFlags.map(f => (
            <View key={f} style={s.flag}><Text style={s.flagText}>✓ {f}</Text></View>
          ))}
        </View>
      )}
      <View style={s.tip}>
        <MaterialCommunityIcons name="lightbulb-outline" size={13} color="#F59E0B" />
        <Text style={s.tipText}>{item.preparationTip}</Text>
      </View>
      <View style={s.cardFooter}>
        <View style={s.tagsRow}>
          <View style={s.tag}>
            <MaterialCommunityIcons name="map-marker-outline" size={11} color="#64748B" />
            <Text style={s.tagText}>{item.originMatch}</Text>
          </View>
          <View style={[s.tag, { backgroundColor: pc.bg }]}>
            <Text style={[s.tagText, { color: pc.text }]}>{pc.label}</Text>
          </View>
          <View style={s.tag}>
            <MaterialCommunityIcons name="store-outline" size={11} color="#64748B" />
            <Text style={s.tagText}>{item.storeSection}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={[s.addBtn, isAdded && s.addedBtn]}
          onPress={() => !isAdded && onAdd(item)}
          disabled={isAdded || isAdding}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={isAdded ? 'Added' : 'Add to list'}
          accessibilityRole="button"
        >
          {isAdding
            ? <ActivityIndicator size="small" color="#fff" />
            : <MaterialCommunityIcons name={isAdded ? 'check' : 'plus'} size={20} color="#fff" />}
        </TouchableOpacity>
      </View>
    </View>
  );
});

// ── Main screen ───────────────────────────────────────────────────────────────
export default function SearchScreen({ navigation }: any) {
  const { user, profile } = useAuth();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SubstitutionResult[]>([]);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Add-to-list modal state
  const [pendingItem, setPendingItem] = useState<SubstitutionResult | null>(null);
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [listsLoading, setListsLoading] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [creatingList, setCreatingList] = useState(false);
  const [showNewListInput, setShowNewListInput] = useState(false);

  const dietary: string[] = profile?.dietary_preferences ?? [];

  // Fetch user's lists when modal opens
  const openAddModal = useCallback(async (item: SubstitutionResult) => {
    if (!user) return;
    setPendingItem(item);
    setShowNewListInput(false);
    setNewListName('');
    setListsLoading(true);
    const { data } = await supabase
      .from('shopping_lists')
      .select('id, name, title')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setLists((data ?? []).map((l: any) => ({ ...l, name: l.name || l.title || 'Untitled' })));
    setListsLoading(false);
  }, [user]);

  const closeModal = useCallback(() => {
    setPendingItem(null);
    setNewListName('');
    setShowNewListInput(false);
  }, []);

  const addToList = useCallback(async (listId: string, listName: string) => {
    if (!pendingItem || !user) return;
    const itemId = pendingItem.id;
    setAddingId(itemId);
    try {
      const { error } = await supabase.from('list_items').insert({
        list_id: listId,
        name: pendingItem.name,
        original_ingredient: pendingItem.name,
        brand: pendingItem.brand,
        category: pendingItem.category,
        match_score: pendingItem.matchScore,
        notes: pendingItem.preparationTip,
        is_checked: false,
      });
      if (error) throw error;
      setAddedIds(prev => new Set(prev).add(itemId));
      closeModal();
      Alert.alert('Added!', `"${pendingItem.name}" added to ${listName}.`);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Could not add item.');
    } finally {
      setAddingId(null);
    }
  }, [pendingItem, user, closeModal]);

  const createListAndAdd = useCallback(async () => {
    if (!newListName.trim() || !user || !pendingItem) return;
    setCreatingList(true);
    try {
      const { data, error } = await supabase
        .from('shopping_lists')
        .insert({ user_id: user.id, name: newListName.trim(), title: newListName.trim() })
        .select('id, name').single();
      if (error) throw error;
      await addToList(data.id, data.name);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Could not create list.');
    } finally {
      setCreatingList(false);
    }
  }, [newListName, user, pendingItem, addToList]);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    setResults([]);
    setErrorMsg(null);
    try {
      const data = await searchIngredientSubstitutions(
        query.trim(),
        profile?.home_country,
        dietary
      );
      setResults(data);
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Something went wrong.');
    } finally {
      setSearching(false);
    }
  }, [query, profile?.home_country, dietary, fadeAnim]);

  const renderItem = useCallback(({ item }: { item: SubstitutionResult }) => (
    <ResultCard
      item={item}
      isAdded={addedIds.has(item.id)}
      isAdding={addingId === item.id}
      onAdd={openAddModal}
    />
  ), [addedIds, addingId, openAddModal]);

  const keyExtractor = useCallback((item: SubstitutionResult) => item.id, []);

  const ListHeader = useCallback(() => (
    <View style={s.resultsHeader}>
      <Text style={s.resultsCount}>{results.length} AI Matches</Text>
      <View style={s.aiTag}>
        <MaterialCommunityIcons name="robot-outline" size={12} color="#8B5CF6" />
        <Text style={s.aiTagText}>Gemini 2.5 Flash</Text>
      </View>
      {dietary.length > 0 && (
        <View style={s.dietBadge}>
          <MaterialCommunityIcons name="leaf" size={11} color="#16A34A" />
          <Text style={s.dietBadgeText}>{dietary.length} filters</Text>
        </View>
      )}
    </View>
  ), [results.length, dietary.length]);

  return (
    <SafeAreaView style={s.container}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <MaterialCommunityIcons name="arrow-left" size={24} color="#0F172A" />
        </TouchableOpacity>
        <View style={s.searchBox}>
          <MaterialCommunityIcons name="magnify" size={20} color="#94A3B8" style={{ marginRight: 8 }} />
          <TextInput
            style={s.searchInput}
            placeholder="Search brands, dishes, ingredients..."
            placeholderTextColor="#94A3B8"
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            autoFocus
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(''); setResults([]); setErrorMsg(null); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialCommunityIcons name="close-circle" size={20} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={s.goBtn} onPress={handleSearch} accessibilityRole="button" accessibilityLabel="Search">
          <Text style={s.goBtnText}>Go</Text>
        </TouchableOpacity>
      </View>

      {/* Quick chips */}
      {results.length === 0 && !searching && !errorMsg && (
        <View style={s.chips}>
          {['Amul Butter', 'Maggi', 'Gochujang', 'Halloumi', 'Miso'].map(c => (
            <TouchableOpacity key={c} style={s.chip} onPress={() => setQuery(c)}>
              <Text style={s.chipText}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Loading */}
      {searching && (
        <View style={s.loadWrap}>
          <View style={s.loadCard}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={s.loadTitle}>AI is searching…</Text>
            <Text style={s.loadSub}>Finding US matches for "{query}"</Text>
            {dietary.length > 0 && <Text style={s.loadSub}>Applying: {dietary.join(', ')}</Text>}
          </View>
        </View>
      )}

      {/* Error */}
      {!!errorMsg && !searching && (
        <View style={s.loadWrap}>
          <MaterialCommunityIcons name="alert-circle-outline" size={48} color="#FCA5A5" />
          <Text style={s.loadTitle}>Search Failed</Text>
          <Text style={s.loadSub}>{errorMsg}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={handleSearch}>
            <Text style={s.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Results */}
      {!searching && results.length > 0 && (
        <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
          <FlatList
            data={results}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            ListHeaderComponent={ListHeader}
            contentContainerStyle={s.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews={Platform.OS === 'android'}
          />
        </Animated.View>
      )}

      {/* Empty state */}
      {!searching && results.length === 0 && !errorMsg && (
        <View style={s.empty}>
          <View style={s.emptyIcon}>
            <MaterialCommunityIcons name="earth" size={40} color="#3B82F6" />
          </View>
          <Text style={s.emptyTitle}>Find your taste of home</Text>
          <Text style={s.emptySub}>Search any brand or dish from your home country.</Text>
          {dietary.length > 0 && (
            <View style={s.dietNote}>
              <MaterialCommunityIcons name="leaf" size={14} color="#16A34A" />
              <Text style={s.dietNoteText}>Results filtered for: {dietary.join(', ')}</Text>
            </View>
          )}
          <View style={s.exGrid}>
            {[{ icon: '🧈', text: 'Amul Butter' }, { icon: '🍜', text: 'Maggi Noodles' },
              { icon: '🌶️', text: 'Gochujang' }, { icon: '🧀', text: 'Halloumi' }].map(e => (
              <TouchableOpacity key={e.text} style={s.exCard} onPress={() => setQuery(e.text)}>
                <Text style={{ fontSize: 26, marginBottom: 6 }}>{e.icon}</Text>
                <Text style={s.exText}>{e.text}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* ── Add-to-list modal ──────────────────────────────────────────────── */}
      <Modal visible={!!pendingItem} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeModal}>
        <SafeAreaView style={s.modal}>
          <View style={s.modalHeader}>
            <TouchableOpacity onPress={closeModal} style={s.modalCancelWrap}>
              <Text style={s.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={s.modalTitle}>Add to List</Text>
            <View style={{ width: 64 }} />
          </View>

          {pendingItem && (
            <View style={s.pendingRow}>
              <MaterialCommunityIcons name="package-variant" size={18} color="#3B82F6" />
              <Text style={s.pendingName} numberOfLines={1}>{pendingItem.name}</Text>
              <View style={[s.scoreBadge, { backgroundColor: getScoreColor(pendingItem.matchScore).bg }]}>
                <Text style={[s.scoreText, { color: getScoreColor(pendingItem.matchScore).text }]}>{pendingItem.matchScore}%</Text>
              </View>
            </View>
          )}

          <Text style={s.sectionLabel}>Your Lists</Text>

          {listsLoading ? (
            <ActivityIndicator style={{ marginTop: 20 }} color="#3B82F6" />
          ) : (
            <FlatList
              data={lists}
              keyExtractor={l => l.id}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
              renderItem={({ item: list }) => (
                <TouchableOpacity
                  style={s.listRow}
                  onPress={() => addToList(list.id, list.name)}
                  accessibilityRole="button"
                >
                  <MaterialCommunityIcons name="format-list-checks" size={20} color="#3B82F6" />
                  <Text style={s.listRowName}>{list.name}</Text>
                  <MaterialCommunityIcons name="chevron-right" size={18} color="#CBD5E1" />
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={s.noLists}>No lists yet — create one below.</Text>}
            />
          )}

          <View style={s.createSection}>
            {!showNewListInput ? (
              <TouchableOpacity style={s.createBtn} onPress={() => setShowNewListInput(true)} accessibilityRole="button">
                <MaterialCommunityIcons name="plus" size={20} color="#fff" />
                <Text style={s.createBtnText}>Create New List</Text>
              </TouchableOpacity>
            ) : (
              <View style={s.newListRow}>
                <TextInput
                  style={s.newListInput}
                  placeholder="List name..."
                  placeholderTextColor="#94A3B8"
                  value={newListName}
                  onChangeText={setNewListName}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={createListAndAdd}
                />
                <TouchableOpacity
                  style={[s.createConfirm, (!newListName.trim() || creatingList) && { opacity: 0.4 }]}
                  onPress={createListAndAdd}
                  disabled={!newListName.trim() || creatingList}
                >
                  {creatingList
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <MaterialCommunityIcons name="check" size={20} color="#fff" />}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', gap: 8 },
  backBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: 14, paddingHorizontal: 12, height: 48 },
  searchInput: { flex: 1, fontSize: 15, color: '#0F172A' },
  goBtn: { backgroundColor: '#0F172A', borderRadius: 12, paddingHorizontal: 16, height: 44, justifyContent: 'center', alignItems: 'center' },
  goBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Chips
  chips: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, paddingVertical: 10, gap: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  chip: { backgroundColor: '#F1F5F9', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, minHeight: 36, justifyContent: 'center' },
  chipText: { fontSize: 13, color: '#475569', fontWeight: '500' },

  // States
  loadWrap: { flex: 1, alignItems: 'center', paddingTop: 80, paddingHorizontal: 24 },
  loadCard: { backgroundColor: '#fff', borderRadius: 24, padding: 32, alignItems: 'center', width: '100%', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  loadTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A', marginTop: 14 },
  loadSub: { fontSize: 13, color: '#64748B', marginTop: 6, textAlign: 'center' },
  retryBtn: { marginTop: 20, backgroundColor: '#0F172A', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  retryText: { color: '#fff', fontWeight: '700' },

  // Results list
  listContent: { padding: 16, paddingBottom: 40 },
  resultsHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 8 },
  resultsCount: { fontSize: 14, fontWeight: '700', color: '#0F172A', flex: 1 },
  aiTag: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F3FF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, gap: 4 },
  aiTagText: { fontSize: 11, color: '#8B5CF6', fontWeight: '600' },
  dietBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0FDF4', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, gap: 4 },
  dietBadgeText: { fontSize: 11, color: '#16A34A', fontWeight: '600' },

  // Card
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 18, marginBottom: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  cardName: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  cardSub: { fontSize: 12, color: '#64748B', marginTop: 2 },
  scoreBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  scoreText: { fontSize: 13, fontWeight: '800' },
  desc: { fontSize: 13, color: '#475569', lineHeight: 20, marginBottom: 10 },
  flagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  flag: { backgroundColor: '#F0FDF4', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  flagText: { fontSize: 11, color: '#16A34A', fontWeight: '700' },
  tip: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#FFFBEB', borderRadius: 10, padding: 10, gap: 6, marginBottom: 12 },
  tipText: { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 18 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tagsRow: { flexDirection: 'row', gap: 5, flexWrap: 'wrap', flex: 1 },
  tag: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8, gap: 3 },
  tagText: { fontSize: 11, color: '#64748B', fontWeight: '500' },
  addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#0F172A', justifyContent: 'center', alignItems: 'center' },
  addedBtn: { backgroundColor: '#059669' },

  // Empty
  empty: { flex: 1, alignItems: 'center', paddingTop: 60, paddingHorizontal: 24 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A', textAlign: 'center' },
  emptySub: { fontSize: 14, color: '#64748B', textAlign: 'center', marginTop: 8, lineHeight: 22 },
  dietNote: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0FDF4', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginTop: 12, gap: 6 },
  dietNoteText: { fontSize: 13, color: '#16A34A', fontWeight: '600' },
  exGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 28, justifyContent: 'center' },
  exCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, alignItems: 'center', width: '44%', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  exText: { fontSize: 13, color: '#0F172A', fontWeight: '600', textAlign: 'center' },

  // Modal
  modal: { flex: 1, backgroundColor: '#F8FAFC' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: '#fff' },
  modalCancelWrap: { minWidth: 64, minHeight: 44, justifyContent: 'center' },
  modalCancel: { fontSize: 16, color: '#64748B' },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  pendingRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EFF6FF', margin: 16, borderRadius: 14, padding: 14, gap: 10 },
  pendingName: { flex: 1, fontSize: 14, fontWeight: '700', color: '#0F172A' },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1, marginHorizontal: 16, marginBottom: 8 },
  listRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 16, marginBottom: 8, gap: 12, minHeight: 56 },
  listRowName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#0F172A' },
  noLists: { textAlign: 'center', color: '#94A3B8', fontSize: 14, paddingVertical: 20 },
  createSection: { padding: 16, borderTopWidth: 1, borderTopColor: '#E2E8F0', backgroundColor: '#fff' },
  createBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#2563EB', borderRadius: 14, paddingVertical: 14, gap: 8, minHeight: 52 },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  newListRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  newListInput: { flex: 1, backgroundColor: '#F1F5F9', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: '#0F172A', minHeight: 48 },
  createConfirm: { width: 48, height: 48, borderRadius: 12, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center' },
});
