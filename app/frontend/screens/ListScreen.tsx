import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, FlatList,
  SafeAreaView, ActivityIndicator, Alert, TextInput,
  Modal, Animated, Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ListItem {
  id: string;
  list_id: string;
  name: string;
  brand?: string;
  category?: string;
  match_score?: number;
  notes?: string;
  is_checked: boolean;
}

interface ShoppingList {
  id: string;
  name: string;
  user_id: string;
}

// ─── Item Row (memoised — prevents FlatList re-renders) ───────────────────────

interface ItemRowProps {
  item: ListItem;
  onToggle: (item: ListItem) => void;
  onDelete: (id: string) => void;
}

const ITEM_HEIGHT = 68;

const ItemRow = React.memo(({ item, onToggle, onDelete }: ItemRowProps) => {
  const scale = useRef(new Animated.Value(1)).current;

  const handleToggle = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.95, duration: 80, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start();
    onToggle(item);
  };

  return (
    <Animated.View style={[styles.itemRow, { transform: [{ scale }] }]}>
      {/* Checkbox */}
      <TouchableOpacity
        onPress={handleToggle}
        style={styles.checkBtn}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 4 }}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.is_checked }}
        accessibilityLabel={item.name}
      >
        <View style={[styles.checkCircle, item.is_checked && styles.checkCircleActive]}>
          {item.is_checked && (
            <MaterialCommunityIcons name="check" size={13} color="#fff" />
          )}
        </View>
      </TouchableOpacity>

      {/* Content */}
      <View style={styles.itemContent}>
        <Text
          style={[styles.itemName, item.is_checked && styles.itemNameDone]}
          numberOfLines={1}
        >
          {item.name}
        </Text>
        {(item.brand || item.category) ? (
          <Text style={styles.itemMeta} numberOfLines={1}>
            {[item.brand, item.category].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </View>

      {/* AI badge */}
      {item.match_score != null && (
        <View style={styles.aiTag}>
          <Text style={styles.aiTagText}>{item.match_score}%</Text>
        </View>
      )}

      {/* Delete */}
      <TouchableOpacity
        onPress={() => onDelete(item.id)}
        style={styles.deleteBtn}
        hitSlop={{ top: 10, bottom: 10, left: 4, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${item.name}`}
      >
        <MaterialCommunityIcons name="minus-circle-outline" size={20} color="#E2E8F0" />
      </TouchableOpacity>
    </Animated.View>
  );
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ListScreen() {
  const { user } = useAuth();

  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [selectedList, setSelectedList] = useState<ShoppingList | null>(null);
  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [itemsLoading, setItemsLoading] = useState(false);

  // Modals
  const [addItemModal, setAddItemModal] = useState(false);
  const [newListModal, setNewListModal] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemBrand, setNewItemBrand] = useState('');
  const [newListName, setNewListName] = useState('');
  const [saving, setSaving] = useState(false);

  // ── Data ─────────────────────────────────────────────────────────────────────

  const fetchLists = useCallback(async (keepId?: string) => {
    if (!user) return;
    const { data, error } = await supabase
      .from('shopping_lists')
      .select('id, name, title, user_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) { console.error(error); setLoading(false); return; }

    const normalised: ShoppingList[] = (data ?? []).map((l: any) => ({
      ...l,
      name: l.name || l.title || 'Untitled',
    }));
    setLists(normalised);

    const active = keepId
      ? normalised.find(l => l.id === keepId) ?? normalised[0]
      : normalised[0];

    if (active) {
      setSelectedList(active);
      await fetchItems(active.id);
    } else {
      setSelectedList(null);
      setItems([]);
    }
    setLoading(false);
  }, [user]);

  const fetchItems = useCallback(async (listId: string) => {
    setItemsLoading(true);
    const { data, error } = await supabase
      .from('list_items')
      .select('id, list_id, name, original_ingredient, brand, category, match_score, notes, is_checked')
      .eq('list_id', listId)
      .order('created_at', { ascending: false });

    if (!error) {
      const norm: ListItem[] = (data ?? []).map((i: any) => ({
        ...i,
        name: i.name || i.original_ingredient || 'Item',
        is_checked: i.is_checked ?? false,
      }));
      norm.sort((a, b) => (a.is_checked ? 1 : 0) - (b.is_checked ? 1 : 0));
      setItems(norm);
    }
    setItemsLoading(false);
  }, []);

  const selectedListRef = useRef<string | null>(null);
  useEffect(() => {
    selectedListRef.current = selectedList?.id || null;
  }, [selectedList]);

  useEffect(() => {
    if (!user) return;

    fetchLists();

    // Subscribe to shopping_lists changes
    const listsSubscription = supabase
      .channel('shopping_lists_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shopping_lists', filter: `user_id=eq.'${user.id}'` },
        () => {
          console.log('[Realtime] Lists changed, refetching...');
          fetchLists(selectedListRef.current || undefined);
        }
      )
      .subscribe();

    return () => {
      listsSubscription.unsubscribe();
    };
  }, [user, fetchLists]);

  useEffect(() => {
    if (!selectedList) return;

    // Subscribe to list_items changes for the current list
    const itemsSubscription = supabase
      .channel(`list_items_${selectedList.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'list_items', filter: `list_id=eq.'${selectedList.id}'` },
        () => {
          console.log('[Realtime] Items changed, refetching...');
          fetchItems(selectedList.id);
        }
      )
      .subscribe();

    return () => {
      itemsSubscription.unsubscribe();
    };
  }, [selectedList, fetchItems]);

  // ── List CRUD ─────────────────────────────────────────────────────────────────

  const selectList = useCallback(async (list: ShoppingList) => {
    if (list.id === selectedList?.id) return;
    setSelectedList(list);
    setItems([]);
    await fetchItems(list.id);
  }, [selectedList, fetchItems]);

  const createList = useCallback(async () => {
    if (!newListName.trim() || !user) return;
    setSaving(true);
    const { data, error } = await supabase
      .from('shopping_lists')
      .insert({ user_id: user.id, name: newListName.trim(), title: newListName.trim() })
      .select().single();
    setSaving(false);
    if (error) { Alert.alert('Error', error.message); return; }
    const norm = { ...data, name: data.name || data.title || 'Untitled' };
    setLists(prev => [norm, ...prev]);
    setSelectedList(norm);
    setItems([]);
    setNewListName('');
    setNewListModal(false);
  }, [newListName, user]);

  const deleteList = useCallback((list: ShoppingList) => {
    Alert.alert(
      `Delete "${list.name}"?`,
      'This removes the list and all its items permanently.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            await supabase.from('list_items').delete().eq('list_id', list.id);
            await supabase.from('shopping_lists').delete().eq('id', list.id);
            const updated = lists.filter(l => l.id !== list.id);
            setLists(updated);
            const next = updated[0] ?? null;
            setSelectedList(next);
            if (next) await fetchItems(next.id);
            else setItems([]);
          },
        },
      ]
    );
  }, [lists, fetchItems]);

  // ── Item CRUD ─────────────────────────────────────────────────────────────────

  const toggleItem = useCallback(async (item: ListItem) => {
    const next = !item.is_checked;
    setItems(prev =>
      prev
        .map(i => i.id === item.id ? { ...i, is_checked: next } : i)
        .sort((a, b) => (a.is_checked ? 1 : 0) - (b.is_checked ? 1 : 0))
    );
    const { error } = await supabase
      .from('list_items').update({ is_checked: next }).eq('id', item.id);
    if (error) {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_checked: item.is_checked } : i));
    }
  }, []);

  const deleteItem = useCallback((id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
    supabase.from('list_items').delete().eq('id', id);
  }, []);

  const addItem = useCallback(async () => {
    if (!newItemName.trim() || !selectedList) return;
    setSaving(true);
    const { data, error } = await supabase
      .from('list_items')
      .insert({
        list_id: selectedList.id,
        name: newItemName.trim(),
        original_ingredient: newItemName.trim(),
        brand: newItemBrand.trim() || null,
        is_checked: false,
      })
      .select().single();
    setSaving(false);
    if (error) { Alert.alert('Error', error.message); return; }
    const norm: ListItem = { ...data, name: data.name || data.original_ingredient || 'Item', is_checked: false };
    setItems(prev => [norm, ...prev]);
    setNewItemName('');
    setNewItemBrand('');
    setAddItemModal(false);
  }, [newItemName, newItemBrand, selectedList]);

  // ── Computed ──────────────────────────────────────────────────────────────────

  const checked = items.filter(i => i.is_checked).length;
  const total = items.length;
  const progress = total > 0 ? checked / total : 0;

  // ── FlatList optimisations ────────────────────────────────────────────────────

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => (
      <ItemRow item={item} onToggle={toggleItem} onDelete={deleteItem} />
    ),
    [toggleItem, deleteItem]
  );

  const keyExtractor = useCallback((item: ListItem) => item.id, []);

  const getItemLayout = useCallback(
    (_: any, index: number) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index }),
    []
  );

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      {/* ── Nav bar ─────────────────────────────────────────────────────────── */}
      <View style={styles.navbar}>
        <Text style={styles.navTitle}>My Lists</Text>
        <TouchableOpacity
          style={styles.newBtn}
          onPress={() => setNewListModal(true)}
          accessibilityRole="button"
          accessibilityLabel="Create new list"
        >
          <MaterialCommunityIcons name="plus" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* ── Lists horizontal scroll ─────────────────────────────────────────── */}
      {lists.length > 0 ? (
        <View style={styles.tabsWrap}>
          <FlatList
            data={lists}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={l => l.id}
            contentContainerStyle={styles.tabsContent}
            renderItem={({ item: list }) => {
              const active = list.id === selectedList?.id;
              return (
                <View style={styles.tabContainer}>
                  <TouchableOpacity
                    style={[styles.tab, active && styles.tabActive]}
                    onPress={() => selectList(list)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={1}>
                      {list.name}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.tabDelete}
                    onPress={() => deleteList(list)}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${list.name}`}
                  >
                    <MaterialCommunityIcons name="close-circle" size={16} color={active ? '#94A3B8' : '#CBD5E1'} />
                  </TouchableOpacity>
                </View>
              );
            }}
          />
        </View>
      ) : null}

      {/* ── Main content ────────────────────────────────────────────────────── */}
      {selectedList ? (
        <>
          {/* Progress header */}
          {total > 0 && (
            <View style={styles.progressHeader}>
              <View style={styles.progressTrack}>
                <Animated.View style={[styles.progressFill, { width: `${progress * 100}%` as any }]} />
              </View>
              <Text style={styles.progressLabel}>
                {checked === total ? '✅ All done!' : `${checked} of ${total} done`}
              </Text>
            </View>
          )}

          {/* Items */}
          {itemsLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator color="#2563EB" />
            </View>
          ) : items.length === 0 ? (
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIcon}>
                <MaterialCommunityIcons name="format-list-checks" size={36} color="#94A3B8" />
              </View>
              <Text style={styles.emptyTitle}>Nothing here yet</Text>
              <Text style={styles.emptySub}>Tap + to add items, or use Search to find products.</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => setAddItemModal(true)}>
                <Text style={styles.emptyBtnText}>Add First Item</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={items}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              getItemLayout={getItemLayout}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              removeClippedSubviews={Platform.OS === 'android'}
            />
          )}

          {/* FAB */}
          <TouchableOpacity
            style={styles.fab}
            onPress={() => setAddItemModal(true)}
            accessibilityRole="button"
            accessibilityLabel="Add item"
          >
            <MaterialCommunityIcons name="plus" size={28} color="#fff" />
          </TouchableOpacity>
        </>
      ) : (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIcon}>
            <MaterialCommunityIcons name="clipboard-plus-outline" size={36} color="#94A3B8" />
          </View>
          <Text style={styles.emptyTitle}>No lists yet</Text>
          <Text style={styles.emptySub}>Create your first shopping list to get started.</Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={() => setNewListModal(true)}>
            <Text style={styles.emptyBtnText}>Create a List</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Add Item Modal ───────────────────────────────────────────────────── */}
      <Modal visible={addItemModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAddItemModal(false)}>
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setAddItemModal(false)} style={styles.modalCancelBtn}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Add Item</Text>
            <TouchableOpacity
              style={[styles.modalSave, (!newItemName.trim() || saving) && { opacity: 0.4 }]}
              onPress={addItem}
              disabled={!newItemName.trim() || saving}
            >
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.modalSaveText}>Add</Text>}
            </TouchableOpacity>
          </View>
          <View style={styles.modalBody}>
            <Text style={styles.fieldLabel}>Item Name *</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="e.g. Amul Butter"
              placeholderTextColor="#94A3B8"
              value={newItemName}
              onChangeText={setNewItemName}
              autoFocus
              returnKeyType="next"
            />
            <Text style={styles.fieldLabel}>Brand (optional)</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="e.g. Kerrygold"
              placeholderTextColor="#94A3B8"
              value={newItemBrand}
              onChangeText={setNewItemBrand}
              returnKeyType="done"
              onSubmitEditing={addItem}
            />
          </View>
        </SafeAreaView>
      </Modal>

      {/* ── New List Modal ───────────────────────────────────────────────────── */}
      <Modal visible={newListModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setNewListModal(false)}>
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setNewListModal(false)} style={styles.modalCancelBtn}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>New List</Text>
            <TouchableOpacity
              style={[styles.modalSave, (!newListName.trim() || saving) && { opacity: 0.4 }]}
              onPress={createList}
              disabled={!newListName.trim() || saving}
            >
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.modalSaveText}>Create</Text>}
            </TouchableOpacity>
          </View>
          <View style={styles.modalBody}>
            <Text style={styles.fieldLabel}>List Name</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="e.g. Weekly Groceries"
              placeholderTextColor="#94A3B8"
              value={newListName}
              onChangeText={setNewListName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={createList}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Navbar
  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  navTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  newBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Tabs
  tabsWrap: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  tabsContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 6 },
  tabContainer: { flexDirection: 'row', alignItems: 'center' },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    maxWidth: 140,
    minHeight: 36,
    justifyContent: 'center',
  },
  tabActive: { backgroundColor: '#0F172A' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  tabTextActive: { color: '#fff' },
  tabDelete: { marginLeft: 2, padding: 4 },

  // Progress
  progressHeader: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  progressTrack: {
    height: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: { height: 4, backgroundColor: '#2563EB', borderRadius: 2 },
  progressLabel: { fontSize: 12, color: '#64748B', fontWeight: '600' },

  // List
  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 100 },

  // Item row — fixed height for getItemLayout
  itemRow: {
    height: ITEM_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    marginVertical: 3,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  checkBtn: { marginRight: 12, padding: 2 },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkCircleActive: { backgroundColor: '#16A34A', borderColor: '#16A34A' },
  itemContent: { flex: 1 },
  itemName: { fontSize: 15, fontWeight: '600', color: '#0F172A' },
  itemNameDone: { textDecorationLine: 'line-through', color: '#94A3B8' },
  itemMeta: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  aiTag: {
    backgroundColor: '#F5F3FF',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginRight: 8,
  },
  aiTagText: { fontSize: 11, color: '#7C3AED', fontWeight: '700' },
  deleteBtn: { padding: 4 },

  // Empty
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 6 },
  emptySub: { fontSize: 14, color: '#94A3B8', textAlign: 'center', lineHeight: 20 },
  emptyBtn: {
    marginTop: 20,
    backgroundColor: '#0F172A',
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 13,
    minHeight: 48,
    justifyContent: 'center',
  },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 28,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },

  // Modals
  modal: { flex: 1, backgroundColor: '#F8FAFC' },
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
  modalCancelBtn: { minWidth: 60, minHeight: 44, justifyContent: 'center' },
  modalCancel: { fontSize: 16, color: '#64748B' },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  modalSave: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 60,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSaveText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  modalBody: { padding: 20 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 16,
  },
  fieldInput: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#0F172A',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    minHeight: 52,
  },
});
