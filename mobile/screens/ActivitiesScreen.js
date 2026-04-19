import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, Image,
  TouchableOpacity, TextInput, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { C } from '../constants/colors';
import { API_URL, FATMA_USER_ID } from '../constants/config';

// Map category → icon name
function categoryIcon(category, direction) {
  if (direction === 'in') return 'payments';
  const map = {
    supplies: 'inventory',
    food: 'restaurant',
    transport: 'directions-car',
    utilities: 'bolt',
    salary: 'people',
    equipment: 'build',
    rent: 'home',
    marketing: 'campaign',
    other: 'receipt-long',
  };
  return map[category] || 'receipt-long';
}

// Map category → background color
function categoryBg(category, direction) {
  if (direction === 'in') return C.primaryFixed;
  return C.secondaryFixed;
}

function categoryIconColor(category, direction) {
  if (direction === 'in') return C.onPrimaryFixedVariant;
  return C.onSecondaryFixedVariant;
}

// Format amount with TND
function formatAmount(amount, direction) {
  const sign = direction === 'in' ? '+' : '-';
  return `${sign}${Number(amount).toFixed(3)} TND`;
}

// Group transactions by date label
function groupByDate(transactions) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groups = {};
  transactions.forEach((tx) => {
    const d = new Date(tx.created_at);
    d.setHours(0, 0, 0, 0);
    let label;
    if (d.getTime() === today.getTime()) label = 'اليوم';
    else if (d.getTime() === yesterday.getTime()) label = 'أمس';
    else {
      label = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    }
    if (!groups[label]) groups[label] = [];
    groups[label].push(tx);
  });
  return groups;
}

function formatTime(isoStr) {
  const d = new Date(isoStr);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export default function ActivitiesScreen({ navigation }) {
  const [transactions, setTransactions] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [error, setError] = React.useState(null);

  async function fetchTransactions() {
    try {
      const res = await fetch(`${API_URL}/api/transactions/list?user_id=${FATMA_USER_ID}&limit=100`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTransactions(data.transactions || []);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }

  React.useEffect(() => {
    setLoading(true);
    fetchTransactions().finally(() => setLoading(false));
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    await fetchTransactions();
    setRefreshing(false);
  }

  // Filter by search
  const filtered = transactions.filter((tx) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (tx.merchant || '').toLowerCase().includes(q) ||
      (tx.category || '').toLowerCase().includes(q) ||
      (tx.note || '').toLowerCase().includes(q)
    );
  });

  const groups = groupByDate(filtered);
  const groupKeys = Object.keys(groups);

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.primary]} />}
      >

        {/* AppBar */}
        <View style={s.appBar}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Image
              source={{ uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDEheHY8NaPB3mHjA_OBjXQwPman7mw-94fKZMevbuX1Gz5gNfcXXWKssF3E7Xf0RSWF61RR7zUnqNJO772Owhb6WeJcrK7T6ma0jbiaqYlvkjLHpUtqOd5GKoeRmsbeJqmvbJNv8_0rRhuJ_Udp1O-YieXMco0Ivb_Xsk8kBAUhM0jpvvBE1XcjkLZ2Td1tGZ7sYKW865XDKwyh3i5BYXWaKU9p3B5vZctzvt-6j3iBpaY0xXSqXKmLEjomUyWcNhm1w_eVA_C0S0' }}
              style={s.avatar}
            />
            <Text style={s.logo}>Walleta</Text>
          </View>
          <TouchableOpacity style={s.iconBtn}>
            <MaterialIcons name="notifications" size={24} color={C.primaryContainer} />
          </TouchableOpacity>
        </View>

        {/* Header */}
        <View style={s.header}>
          <Text style={s.title}>الأنشطة</Text>
          <Text style={s.subtitle}>أدِر تدفقاتك النقدية في الوقت الحقيقي</Text>
        </View>

        {/* Historique des factures */}
        <TouchableOpacity style={s.facturesBtn} onPress={() => navigation.navigate('Factures')}>
          <MaterialIcons name="receipt-long" size={20} color={C.primary} />
          <Text style={s.facturesBtnText}>سجل الفواتير الممسوحة</Text>
          <MaterialIcons name="arrow-forward" size={18} color={C.primary} />
        </TouchableOpacity>

        {/* Search & Filter */}
        <View style={s.searchBar}>
          <View style={s.searchInput}>
            <MaterialIcons name="search" size={20} color={C.outline} />
            <TextInput
              style={s.searchText}
              placeholder="البحث عن معاملة..."
              placeholderTextColor={C.outline}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <MaterialIcons name="close" size={18} color={C.outline} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity style={s.filterBtn}>
            <MaterialIcons name="tune" size={22} color={C.onSurface} />
          </TouchableOpacity>
        </View>

        {/* Loading state */}
        {loading && (
          <View style={s.centered}>
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={s.loadingText}>جار التحميل…</Text>
          </View>
        )}

        {/* Error state */}
        {!loading && error && (
          <View style={s.centered}>
            <MaterialIcons name="wifi-off" size={40} color={C.outline} />

            <Text style={s.errorText}>تعذّر تحميل المعاملات</Text>
            <Text style={s.errorSub}>{error}</Text>
            <TouchableOpacity style={s.retryBtn} onPress={() => { setLoading(true); fetchTransactions().finally(() => setLoading(false)); }}>
              <Text style={s.retryText}>إعادة المحاولة</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Empty state */}
        {!loading && !error && filtered.length === 0 && (
          <View style={s.centered}>
            <MaterialIcons name="receipt-long" size={48} color={C.outline} />
            <Text style={s.errorText}>
              {search ? 'لا توجد نتائج' : 'لا توجد معاملات'}
            </Text>
            <Text style={s.errorSub}>
              {search ? 'جرّب كلمة أخرى' : 'امسح فاتورتك الأولى!'}
            </Text>
          </View>
        )}

        {/* Transaction groups */}
        {!loading && !error && groupKeys.map((label) => (
          <View key={label}>
            <View style={s.groupHeader}>
              <Text style={s.groupTitle}>{label}</Text>
              <Text style={s.groupCount}>{groups[label].length} معاملة</Text>
            </View>

            {groups[label].map((tx) => (
              <View key={tx.id} style={s.txRow}>
                <View style={[s.txIcon, { backgroundColor: categoryBg(tx.category, tx.direction) }]}>
                  <MaterialIcons
                    name={categoryIcon(tx.category, tx.direction)}
                    size={22}
                    color={categoryIconColor(tx.category, tx.direction)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.txName} numberOfLines={1}>{tx.merchant || 'معاملة'}</Text>
                  <Text style={s.txSub} numberOfLines={1}>
                    {tx.category || 'autre'} • {formatTime(tx.created_at)}
                  </Text>
                </View>
                <Text style={[s.txAmount, { color: tx.direction === 'in' ? C.primary : C.error }]}>
                  {formatAmount(tx.amount, tx.direction)}
                </Text>
              </View>
            ))}
          </View>
        ))}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={s.fab}
        onPress={() => navigation.navigate('Scanner')}
      >
        <MaterialIcons name="photo-camera" size={28} color={C.onSecondaryContainer} />
      </TouchableOpacity>

    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.surface },
  scroll: { paddingHorizontal: 24 },
  appBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 64 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surfaceContainerHigh },
  logo: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 20, color: C.primaryContainer },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  header: { marginBottom: 24 },
  title: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 24, color: C.onSurface, letterSpacing: -0.5 },
  subtitle: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: C.onSurfaceVariant, marginTop: 4 },
  searchBar: {
    backgroundColor: C.surfaceContainerLow, borderRadius: 16, padding: 8,
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 32,
  },
  searchInput: {
    flex: 1, backgroundColor: C.surfaceContainerLowest, borderRadius: 12,
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 8,
  },
  searchText: { flex: 1, fontFamily: 'Manrope_400Regular', fontSize: 14, color: C.onSurface },
  filterBtn: { backgroundColor: C.surfaceContainerHighest, padding: 10, borderRadius: 12 },
  facturesBtn: {
    backgroundColor: C.surfaceContainerLowest, borderRadius: 14,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 14, marginBottom: 16,
    borderWidth: 1, borderColor: C.surfaceContainerHigh,
  },
  facturesBtnText: { flex: 1, fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: C.onSurface },
  centered: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  loadingText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: C.onSurfaceVariant, marginTop: 8 },
  errorText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16, color: C.onSurface, marginTop: 8 },
  errorSub: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: C.onSurfaceVariant },
  retryBtn: {
    marginTop: 12, backgroundColor: C.primary, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 99,
  },
  retryText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14, color: '#fff' },
  groupHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 16, paddingHorizontal: 4, marginTop: 8,
  },
  groupTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18, color: C.onSurface },
  groupCount: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: C.onSurfaceVariant },
  txRow: {
    backgroundColor: C.surfaceContainerLowest, borderRadius: 16, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 12,
  },
  txIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  txName: { fontFamily: 'Manrope_600SemiBold', fontSize: 15, color: C.onSurface },
  txSub: { fontFamily: 'Manrope_400Regular', fontSize: 12, color: C.onSurfaceVariant, marginTop: 2 },
  txAmount: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14 },
  fab: {
    position: 'absolute', bottom: 100, right: 24, width: 64, height: 64,
    backgroundColor: C.secondaryContainer, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#1b1c19', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.12, shadowRadius: 32, elevation: 8,
  },
});
