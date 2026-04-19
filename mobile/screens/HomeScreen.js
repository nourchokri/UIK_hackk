import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, Image,
  TouchableOpacity, Dimensions, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { C } from '../constants/colors';
import { API_URL, FATMA_USER_ID } from '../constants/config';

const { width } = Dimensions.get('window');

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

function formatTime(isoStr) {
  const d = new Date(isoStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const txDay = new Date(d);
  txDay.setHours(0, 0, 0, 0);
  const diff = today.getTime() - txDay.getTime();
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (diff === 0) return `اليوم، ${time}`;
  if (diff === 86400000) return `أمس، ${time}`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + `، ${time}`;
}

function categoryLabel(category) {
  const map = {
    supplies: 'توريدات',
    revenue: 'إيرادات',
    food: 'طعام',
    transport: 'نقل',
    utilities: 'خدمات',
    salary: 'رواتب',
    equipment: 'معدات',
    rent: 'إيجار',
    marketing: 'تسويق',
    other: 'أخرى',
  };
  return (map[category] || category || 'أخرى').toUpperCase();
}

export default function HomeScreen({ navigation }) {
  const [summary, setSummary] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);

  async function fetchSummary() {
    try {
      const res = await fetch(`${API_URL}/api/transactions/summary?user_id=${FATMA_USER_ID}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSummary(await res.json());
    } catch (e) {
      console.warn('[Home] fetch error:', e.message);
    }
  }

  React.useEffect(() => {
    setLoading(true);
    fetchSummary().finally(() => setLoading(false));
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    await fetchSummary();
    setRefreshing(false);
  }

  const businessBalance = summary?.business_balance ?? 0;
  const personalBalance = summary?.personal_balance ?? 0;
  const monthlyIn = summary?.monthly_in ?? 0;
  const monthlyOut = summary?.monthly_out ?? 0;
  const monthlyProfit = summary?.monthly_profit ?? 0;
  const recentTx = summary?.recent_transactions ?? [];

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.primary]} />}
      >

        {/* AppBar */}
        <View style={s.appBar}>
          <View style={s.appBarLeft}>
            <Image
              source={{ uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBAr4WJAVIqoRZL63W7RuasTkco_FlaQfECDHgvZY4WA0tRkzv2SVaZQDSHdQMCZSjPrOUviX9X0li5fVS1DJFy6R4Bkz2fAgR4I8ucWvkLHhv3QpJihuDdZngDyT2b9pOtWXPujLqJ7mtny5xfgKgLZReFicOgo4b01eT37klPh8m4DNSVCl3PiXOEkxBrc2RjKs_PEGjNTL1pKR4lD29CHlIFmykMzfQ3HAw-0XbMgCkcGjUHfeYBC0x6UA0pXmU63kMwJfGubFU' }}
              style={s.avatar}
            />
            <Text style={s.logo}>Walleta</Text>
          </View>
          <TouchableOpacity style={s.iconBtn}>
            <MaterialIcons name="notifications" size={24} color={C.primaryContainer} />
          </TouchableOpacity>
        </View>

        {/* Greeting */}
        <View style={s.section}>
          <Text style={s.greeting}>مرحباً، فاطمة 👋</Text>
          <Text style={s.greetingSub}>نشاطك التجاري في تطوّر مستمر.</Text>
        </View>

        {/* Business Wallet Card */}
        <View style={s.businessCard}>
          <View style={s.businessDecor} />
          <View style={{ zIndex: 1 }}>
            <Text style={s.walletLabel}>محفظة الأعمال</Text>
            {loading ? (
              <ActivityIndicator color="#fff" style={{ marginTop: 12 }} />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginTop: 4 }}>
                <Text style={s.walletAmount}>{businessBalance.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</Text>
                <Text style={s.walletCurrency}>TND</Text>
              </View>
            )}
          </View>
          <View style={s.businessCardFooter}>
            <View style={{ flexDirection: 'row' }}>
              <View style={[s.avatarChip, { backgroundColor: C.surfaceContainerHigh }]}>
                <Text style={s.avatarChipText}>ET</Text>
              </View>
              <View style={[s.avatarChip, { backgroundColor: C.primaryFixed, marginLeft: -8 }]}>
                <Text style={[s.avatarChipText, { color: C.primary }]}>FT</Text>
              </View>
            </View>
            <Text style={s.updatedAt}>في الوقت الحقيقي</Text>
          </View>
        </View>

        {/* Personal Wallet Card */}
        <View style={s.personalCard}>
          <View style={s.personalCardLeft}>
            <View style={s.personalIcon}>
              <MaterialIcons name="person" size={24} color={C.primary} />
            </View>
            <View>
              <Text style={s.personalLabel}>المحفظة الشخصية</Text>
              {loading ? (
                <ActivityIndicator color={C.primary} />
              ) : (
                <Text style={s.personalAmount}>
                  {personalBalance.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                  {' '}<Text style={s.personalCurrency}>TND</Text>
                </Text>
              )}
            </View>
          </View>
          <TouchableOpacity style={s.chevronBtn}>
            <MaterialIcons name="chevron-right" size={22} color={C.onSurfaceVariant} />
          </TouchableOpacity>
        </View>

        {/* Santé Financière Card */}
        <TouchableOpacity style={s.scoreCard} onPress={() => navigation.navigate('Score')} activeOpacity={0.85}>
          <View style={[s.scoreIconWrap]}>
            <MaterialIcons name="favorite" size={22} color={C.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.scoreCardLabel}>الصحة المالية</Text>
            <Text style={s.scoreCardSub}>اطّلع على نقاطك ونصائحك</Text>
          </View>
          <View style={s.scoreBadge}>
            <Text style={s.scoreBadgeText}>74</Text>
          </View>
          <MaterialIcons name="chevron-right" size={22} color={C.onSurfaceVariant} />
        </TouchableOpacity>

        {/* Quick Actions */}
        <View style={s.quickActions}>
          <TouchableOpacity style={s.actionBtn}>
            <MaterialIcons name="arrow-downward" size={20} color={C.onSecondaryContainer} />
            <Text style={s.actionBtnText}>استقبال</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.actionBtn}>
            <MaterialIcons name="arrow-upward" size={20} color={C.onSecondaryContainer} />
            <Text style={s.actionBtnText}>دفع</Text>
          </TouchableOpacity>
        </View>

        {/* Monthly Insight Cards */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>ملخص الشهر</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.insightScroll} contentContainerStyle={{ paddingRight: 24 }}>
          <View style={s.insightCard}>
            <Text style={s.insightLabel}>إيرادات هذا الشهر</Text>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <MaterialIcons name="trending-up" size={14} color={C.primaryFixedDim} />
                <Text style={[s.insightBadge, { color: C.primaryFixedDim }]}>دخل</Text>
              </View>
              <Text style={s.insightAmount}>
                {loading ? '…' : monthlyIn.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                {' '}<Text style={s.insightUnit}>TND</Text>
              </Text>
            </View>
          </View>
          <View style={s.insightCard}>
            <Text style={s.insightLabel}>مصاريف</Text>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <MaterialIcons name="shopping-bag" size={14} color={C.error} />
                <Text style={[s.insightBadge, { color: C.error }]}>خروج</Text>
              </View>
              <Text style={s.insightAmount}>
                {loading ? '…' : monthlyOut.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                {' '}<Text style={s.insightUnit}>TND</Text>
              </Text>
            </View>
          </View>
          <View style={s.insightCard}>
            <Text style={s.insightLabel}>صافي الربح</Text>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <MaterialIcons name="analytics" size={14} color={C.secondary} />
                <Text style={[s.insightBadge, { color: C.secondary }]}>{monthlyProfit >= 0 ? 'إيجابي' : 'سلبي'}</Text>
              </View>
              <Text style={[s.insightAmount, { color: monthlyProfit >= 0 ? C.primary : C.error }]}>
                {loading ? '…' : monthlyProfit.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                {' '}<Text style={s.insightUnit}>TND</Text>
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* Recent Transactions */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>المعاملات الأخيرة</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Activités')}>
            <Text style={s.sectionLink}>عرض الكل</Text>
          </TouchableOpacity>
        </View>

        {loading && (
          <View style={{ alignItems: 'center', paddingVertical: 24 }}>
            <ActivityIndicator color={C.primary} />
          </View>
        )}

        {!loading && recentTx.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 24 }}>
            <Text style={{ fontFamily: 'Manrope_400Regular', color: C.onSurfaceVariant, fontSize: 14 }}>
              لا توجد معاملات حديثة
            </Text>
          </View>
        )}

        {!loading && recentTx.map((tx, i) => (
          <View key={tx.id} style={[s.txRow, i === recentTx.length - 1 && { marginBottom: 100 }]}>
            <View style={[s.txIcon, {
              backgroundColor: tx.direction === 'in' ? C.primaryFixed : C.surfaceContainerLow,
            }]}>
              <MaterialIcons
                name={categoryIcon(tx.category, tx.direction)}
                size={22}
                color={tx.direction === 'in' ? C.primary : C.onSurfaceVariant}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.txName} numberOfLines={1}>{tx.merchant || 'معاملة'}</Text>
              <View style={[s.txBadge, tx.direction === 'in' && { backgroundColor: C.primaryFixed }]}>
                <Text style={[s.txBadgeText, tx.direction === 'in' && { color: C.onPrimaryFixedVariant }]}>
                  {categoryLabel(tx.category)}
                </Text>
              </View>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[s.txAmount, { color: tx.direction === 'in' ? C.primary : C.error }]}>
                {tx.direction === 'in' ? '+' : '-'}{Number(tx.amount).toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
              </Text>
              <Text style={s.txTime}>{formatTime(tx.created_at)}</Text>
            </View>
          </View>
        ))}

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  scroll: { paddingHorizontal: 24 },
  appBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 64 },
  appBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  logo: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 20, color: C.primaryContainer },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  section: { marginBottom: 24 },
  greeting: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 24, color: C.onSurface, letterSpacing: -0.5 },
  greetingSub: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: C.onSurfaceVariant, marginTop: 4 },
  businessCard: {
    backgroundColor: C.primaryContainer, borderRadius: 24, padding: 32,
    minHeight: 220, justifyContent: 'space-between', marginBottom: 16, overflow: 'hidden',
  },
  businessDecor: {
    position: 'absolute', top: -40, right: -40, width: 192, height: 192,
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 96,
  },
  walletLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 12, color: C.primaryFixedDim, letterSpacing: 1.2, textTransform: 'uppercase' },
  walletAmount: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 44, color: '#ffffff' },
  walletCurrency: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 20, color: C.primaryFixedDim, textTransform: 'uppercase', marginBottom: 6 },
  businessCardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  avatarChip: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.primaryContainer },
  avatarChipText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 10, color: C.onSurface },
  updatedAt: { fontFamily: 'Manrope_500Medium', fontSize: 11, color: 'rgba(255,255,255,0.6)' },
  personalCard: {
    backgroundColor: C.surfaceContainerLow, borderRadius: 16, padding: 20,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24,
  },
  personalCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  personalIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.surfaceContainerHighest, alignItems: 'center', justifyContent: 'center' },
  personalLabel: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: C.onSurfaceVariant },
  personalAmount: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18, color: C.onSurface, marginTop: 2 },
  personalCurrency: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, opacity: 0.6 },
  chevronBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surfaceContainerHighest, alignItems: 'center', justifyContent: 'center' },
  scoreCard: {
    backgroundColor: C.surfaceContainerLowest, borderRadius: 16, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 24,
  },
  scoreIconWrap: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.primaryFixed, alignItems: 'center', justifyContent: 'center' },
  scoreCardLabel: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: C.onSurface },
  scoreCardSub: { fontFamily: 'Manrope_400Regular', fontSize: 12, color: C.onSurfaceVariant, marginTop: 2 },
  scoreBadge: { backgroundColor: C.primaryFixed, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
  scoreBadgeText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, color: C.primary },
  quickActions: { flexDirection: 'row', gap: 16, marginBottom: 32 },
  actionBtn: {
    flex: 1, backgroundColor: C.secondaryContainer, height: 56, borderRadius: 28,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  actionBtnText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, color: C.onSecondaryContainer },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18, color: C.onSurface },
  sectionLink: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: C.primary },
  insightScroll: { marginHorizontal: -24, paddingLeft: 24, marginBottom: 32 },
  insightCard: {
    width: 180, backgroundColor: C.surfaceContainerLowest, borderRadius: 16,
    padding: 20, marginRight: 16, height: 144, justifyContent: 'space-between',
  },
  insightLabel: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: C.onSurfaceVariant },
  insightBadge: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12 },
  insightAmount: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18, color: C.onSurface, marginTop: 4 },
  insightUnit: { fontFamily: 'Manrope_400Regular', fontSize: 11, color: C.onSurface, opacity: 0.4 },
  txRow: {
    backgroundColor: C.surfaceContainerLowest, borderRadius: 16, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 12,
  },
  txIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  txName: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: C.onSurface },
  txBadge: { alignSelf: 'flex-start', backgroundColor: C.surfaceContainerHigh, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  txBadgeText: { fontFamily: 'Manrope_700Bold', fontSize: 10, color: C.onSurfaceVariant, letterSpacing: 0.8 },
  txAmount: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15 },
  txTime: { fontFamily: 'Manrope_500Medium', fontSize: 10, color: C.onSurfaceVariant, marginTop: 2 },
});
