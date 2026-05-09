import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, SafeAreaView, Dimensions, ActivityIndicator } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

const { width } = Dimensions.get('window');

export default function HomeScreen({ navigation }: any) {
  const { user, profile } = useAuth();
  const [activeList, setActiveList] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchActiveList = useCallback(async () => {
    if (!user) return;
    
    // Fetch the most recent list
    const { data: lists, error: listError } = await supabase
      .from('shopping_lists')
      .select('id, name, title')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (listError || !lists || lists.length === 0) {
      setActiveList(null);
      setLoading(false);
      return;
    }

    const list = lists[0];
    
    // Fetch item counts
    const { data: items, error: itemsError } = await supabase
      .from('list_items')
      .select('is_checked')
      .eq('list_id', list.id);

    if (!itemsError) {
      setActiveList({
        id: list.id,
        title: list.name || list.title || 'Weekly Groceries',
        total: items?.length || 0,
        completed: items?.filter(i => i.is_checked).length || 0,
        store: "Recommended Store" // Placeholder until we have store data
      });
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchActiveList();

    if (!user) return;

    // Realtime for lists
    const listsSub = supabase
      .channel('home_lists')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_lists', filter: `user_id=eq.${user.id}` }, fetchActiveList)
      .subscribe();

    return () => {
      listsSub.unsubscribe();
    };
  }, [user, fetchActiveList]);

  // Secondary listener for items of the active list
  useEffect(() => {
    if (!activeList?.id) return;

    const itemsSub = supabase
      .channel(`home_items_${activeList.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'list_items', filter: `list_id=eq.${activeList.id}` }, fetchActiveList)
      .subscribe();

    return () => {
      itemsSub.unsubscribe();
    };
  }, [activeList?.id, fetchActiveList]);

  const QUICK_ACTIONS = [
    { id: 'scan', name: 'Scan Label', icon: 'camera-scan', color: '#3B82F6', screen: 'MagicLens' },
    { id: 'list', name: 'New List', icon: 'playlist-plus', color: '#10B981', screen: 'Lists' },
    { id: 'diet', name: 'Dietary Check', icon: 'leaf', color: '#F59E0B', screen: 'Profile' },
    { id: 'history', name: 'History', icon: 'history', color: '#8B5CF6', screen: 'Lists' },
  ];

  const DAILY_TIP = {
    title: "Shopping for Milk? 🥛",
    tip: "In the US, milk caps are color-coded: Red is Whole Milk, Blue is 2%, and Green is usually Organic or 1%.",
    icon: "lightbulb-on-outline"
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hi, {user?.user_metadata?.full_name || 'Traveler'}! 👋</Text>
            <Text style={styles.location}>Explore groceries in {profile?.home_country || 'your region'}</Text>
          </View>
          <TouchableOpacity style={styles.profileButton} onPress={() => navigation.navigate('Profile')}>
            <View style={styles.profileImagePlaceholder}>
              <Text style={styles.profileInitial}>
                {(user?.user_metadata?.full_name || 'T')[0]}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Search Bar Placeholder */}
        <TouchableOpacity 
          style={styles.searchBar}
          onPress={() => navigation.navigate('Search')}
        >
          <MaterialCommunityIcons name="magnify" size={24} color="#94A3B8" />
          <Text style={styles.searchText}>Search for products or brands...</Text>
        </TouchableOpacity>

        {/* Daily Tip Widget */}
        <View style={styles.tipCard}>
          <View style={styles.tipIconContainer}>
            <MaterialCommunityIcons name={DAILY_TIP.icon as any} size={24} color="#F59E0B" />
          </View>
          <View style={styles.tipTextContainer}>
            <Text style={styles.tipTitle}>{DAILY_TIP.title}</Text>
            <Text style={styles.tipBody}>{DAILY_TIP.tip}</Text>
          </View>
        </View>

        {/* Active List Widget */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Active List</Text>
          {loading ? (
            <ActivityIndicator color="#3B82F6" />
          ) : activeList ? (
            <TouchableOpacity 
              style={styles.listWidget}
              onPress={() => navigation.navigate('Lists')}
            >
              <View style={styles.listInfo}>
                <View style={styles.listHeaderRow}>
                  <Text style={styles.listName}>{activeList.title}</Text>
                  <View style={styles.storeBadge}>
                    <Text style={styles.storeText}>{activeList.store}</Text>
                  </View>
                </View>
                <View style={styles.progressRow}>
                  <View style={styles.progressBarContainer}>
                    <View style={[styles.progressBarFill, { width: `${activeList.total > 0 ? (activeList.completed / activeList.total) * 100 : 0}%` }]} />
                  </View>
                  <Text style={styles.progressText}>{activeList.completed}/{activeList.total} items</Text>
                </View>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={24} color="#94A3B8" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              style={styles.listWidget}
              onPress={() => navigation.navigate('Lists')}
            >
              <View style={styles.listInfo}>
                <Text style={styles.listName}>No active lists</Text>
                <Text style={styles.progressText}>Create a list to get started</Text>
              </View>
              <MaterialCommunityIcons name="plus" size={24} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionGrid}>
            {QUICK_ACTIONS.map(action => (
              <TouchableOpacity 
                key={action.id} 
                style={styles.actionCard}
                onPress={() => navigation.navigate(action.screen as any)}
              >
                <View style={[styles.iconContainer, { backgroundColor: action.color + '15' }]}>
                  <MaterialCommunityIcons name={action.icon as any} size={28} color={action.color} />
                </View>
                <Text style={styles.actionName}>{action.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Local Favorites / Categories */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Local Essentials</Text>
            <TouchableOpacity>
              <Text style={styles.seeAll}>See All</Text>
            </TouchableOpacity>
          </View>
          
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
            {[1, 2, 3].map(i => (
              <TouchableOpacity key={i} style={styles.featuredCard}>
                <View style={styles.cardImagePlaceholder}>
                   <MaterialCommunityIcons name="food-apple" size={40} color="#CBD5E1" />
                </View>
                <View style={styles.cardContent}>
                  <Text style={styles.cardTitle}>Local Brand {i}</Text>
                  <Text style={styles.cardSubtitle}>Fresh & Local</Text>
                  <View style={styles.tagContainer}>
                    <Text style={styles.tag}>Localized</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 12,
  },
  greeting: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  location: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 4,
  },
  profileButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  profileImagePlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInitial: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 32,
  },
  searchText: {
    marginLeft: 12,
    color: '#94A3B8',
    fontSize: 16,
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 16,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 16,
  },
  actionCard: {
    width: (width - 56) / 2,
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 20,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  actionName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },
  horizontalScroll: {
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  featuredCard: {
    width: 240,
    backgroundColor: '#fff',
    borderRadius: 20,
    marginRight: 16,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  cardImagePlaceholder: {
    height: 120,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContent: {
    padding: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
  },
  tagContainer: {
    marginTop: 12,
    flexDirection: 'row',
  },
  tag: {
    fontSize: 10,
    fontWeight: '700',
    color: '#3B82F6',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  seeAll: {
    fontSize: 14,
    color: '#3B82F6',
    fontWeight: '600',
  },

  tipCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFBEB',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FEF3C7',
    marginBottom: 32,
  },
  tipIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  tipTextContainer: {
    flex: 1,
  },
  tipTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 2,
  },
  tipBody: {
    fontSize: 13,
    color: '#B45309',
    lineHeight: 18,
  },
  listWidget: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  listInfo: {
    flex: 1,
  },
  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  listName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginRight: 8,
  },
  storeBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  storeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressBarContainer: {
    flex: 1,
    height: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    marginRight: 12,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#10B981',
  },
  progressText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
});
