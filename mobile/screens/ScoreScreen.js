import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, Image, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { C } from '../constants/colors';
import { API_URL, FATMA_USER_ID } from '../constants/config';

// ── Gauge ──────────────────────────────────────────────────────────────────
function ScoreGauge({ score }) {
  const r = 42;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;
  return (
    <View style={s.gaugeWrap}>
      <View style={s.gaugeTrack} />
      <Svg width="100%" height="100%" viewBox="0 0 100 100" style={StyleSheet.absoluteFill} transform={[{ rotate: '-90deg' }]}>
        <Defs>
          <SvgLinearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#F5A623" />
            <Stop offset="100%" stopColor="#226a4d" />
          </SvgLinearGradient>
        </Defs>
        <Circle cx="50" cy="50" r={r} fill="none" stroke="url(#grad)" strokeWidth="8"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
      </Svg>
      <View style={s.gaugeCenter}>
        <Text style={s.gaugeScore}>{score}</Text>
        <Text style={s.gaugeLabel}>الصحة المالية</Text>
      </View>
    </View>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────
function scoreLabel(score) {
  if (score >= 85) return 'ممتاز';
  if (score >= 70) return 'جيد';
  if (score >= 50) return 'متوسط';
  if (score >= 30) return 'ضعيف';
  return 'حرج';
}

function scoreLabelColor(score) {
  if (score >= 85) return C.primary;
  if (score >= 70) return '#22c55e';
  if (score >= 50) return '#f59e0b';
  return C.error;
}

function riskLabel(level) {
  return { low: 'منخفض', medium: 'معتدل', high: 'مرتفع', critical: 'حرج' }[level] || level;
}

function trendIcon(trend) {
  return { increasing: 'trending-up', declining: 'trending-down', stable: 'trending-flat' }[trend] || 'trending-flat';
}

function trendColor(trend) {
  return { increasing: C.primary, declining: C.error, stable: C.onSurfaceVariant }[trend] || C.onSurfaceVariant;
}

function trendLabel(trend) {
  return { increasing: 'في ارتفاع', declining: 'في انخفاض', stable: 'مستقر' }[trend] || 'مستقر';
}

function anomalySeverityColor(severity) {
  return { low: '#22c55e', medium: '#f59e0b', high: '#f97316', critical: C.error }[severity] || C.outline;
}

function runwayLabel(days) {
  if (days === null || days === undefined) return 'Positif ✓';
  if (days > 90) return `${Math.round(days)} jours`;
  return `${Math.round(days)} jours`;
}

// ── Screen ──────────────────────────────────────────────────────────────────
export default function ScoreScreen({ navigation }) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState(null);

  async function fetchScore() {
    try {
      const res = await fetch(`${API_URL}/api/score/health?user_id=${FATMA_USER_ID}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }

  React.useEffect(() => {
    setLoading(true);
    fetchScore().finally(() => setLoading(false));
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    await fetchScore();
    setRefreshing(false);
  }

  const score = data?.health_score ?? 0;
  const breakdown = data?.breakdown ?? { regularite: 0, epargne: 0, remboursement: 0 };
  const anomalies = data?.anomalies ?? [];

  // Dynamic tips based on score data
  const tips = [];
  if (data) {
    if (data.cash_runway_days !== null && data.cash_runway_days < 30) {
      tips.push({
        icon: 'account-balance-wallet',
        name: 'سيولة محدودة',
        desc: `لديك حوالي ${Math.round(data.cash_runway_days)} يوماً من السيولة النقدية. تجنّب النفقات غير الضرورية.`,
        color: C.error,
      });
    }
    if (data.income_trend === 'declining') {
      tips.push({
        icon: 'trending-down',
        name: 'إيرادات في انخفاض',
        desc: 'إيراداتك هذا الشهر أقل من الشهر الماضي. ابحث عن فرص بيع جديدة.',
        color: '#f59e0b',
      });
    }
    if (breakdown.epargne < 50) {
      tips.push({
        icon: 'savings',
        name: 'حسّن ادخارك',
        desc: 'ادّخر 10% من إيراداتك شهرياً لتعزيز صمودك المالي.',
        color: C.primary,
      });
    }
    if (anomalies.some(a => a.anomaly_type === 'unusual_spending')) {
      tips.push({
        icon: 'warning',
        name: 'إنفاق غير معتاد مكتشف',
        desc: 'تم رصد نفقة أو أكثر تفوق معدّلك المعتاد. راجع مصاريفك.',
        color: '#f97316',
      });
    }
    // Always add a positive tip
    if (score >= 70) {
      tips.push({
        icon: 'check-circle',
        name: 'سداد مبكّر',
        desc: 'دفع مستحقاتك قبل يومين يرفع درجة ثقتك +5 نقاط شهرياً.',
        color: C.primary,
      });
    }
    if (tips.length === 0) {
      tips.push({
        icon: 'check-circle',
        name: 'إدارة جيدة',
        desc: 'نشاطك مُدار بشكل جيد. واصل تسجيل معاملاتك بانتظام.',
        color: C.primary,
      });
    }
  }

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
              source={{ uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAOAwGJ01IF7WCkC1YLxmzJ4nscDe4VlieplCo7h0RkOf1LRFpGinECgJO3Zb69Up1gZ7qAnKrnHVNIfyedDHAiKvxYC-tBocd_z_ZY9zlHAN2U5BuUSTQ61czjvoW6X94un66-WGeHYUDcSO8jpDzvQzVKaUDErSk-5tV072KxcwP-ZoKrdAD5u-ekHEtSdOcdudydR7Y6JS3lJT-Uu-kbJGd-YVzzNbJ1xsYT057T_CrNHh_dv3RWXm0Q3O4lBg41y10_KsV1ABc' }}
              style={s.avatar}
            />
            <Text style={s.logo}>Walleta</Text>
          </View>
          <TouchableOpacity style={s.iconBtn} onPress={() => navigation?.goBack?.()}>
            <MaterialIcons name="arrow-back" size={24} color={C.onSurface} />
          </TouchableOpacity>
        </View>

        {/* Loading */}
        {loading && (
          <View style={s.centered}>
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={s.loadingText}>جار التحليل...</Text>
          </View>
        )}

        {/* Error */}
        {!loading && error && (
          <View style={s.centered}>
            <MaterialIcons name="wifi-off" size={40} color={C.outline} />
            <Text style={s.errorText}>تعذّر تحميل الدرجة</Text>
            <Text style={s.errorSub}>{error}</Text>
            <TouchableOpacity style={s.retryBtn} onPress={() => { setLoading(true); fetchScore().finally(() => setLoading(false)); }}>
              <Text style={s.retryText}>إعادة المحاولة</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Content */}
        {!loading && !error && data && (
          <>
            {/* Hero */}
            <View style={s.heroSection}>
              <Text style={s.heroTitle}>صحّتك المالية</Text>
              <ScoreGauge score={score} />
              <Text style={s.heroDesc}>
                درجتك تُعدّ{' '}
                <Text style={{ color: scoreLabelColor(score), fontFamily: 'Manrope_700Bold' }}>{scoreLabel(score)}</Text>
                .{score >= 70 ? ' لديك إدارة صارمة ومنظّمة.' : ' هناك مجال للتحسين.'}
              </Text>
            </View>

            {/* KPI summary row */}
            <View style={s.kpiRow}>
              <View style={s.kpiCard}>
                <MaterialIcons name={trendIcon(data.income_trend)} size={20} color={trendColor(data.income_trend)} />
                <Text style={s.kpiValue}>{trendLabel(data.income_trend)}</Text>
                <Text style={s.kpiLabel}>اتجاه الإيرادات</Text>
              </View>
              <View style={s.kpiCard}>
                <MaterialIcons name="timer" size={20} color={data.cash_runway_days !== null && data.cash_runway_days < 14 ? C.error : C.primary} />
                <Text style={s.kpiValue}>{runwayLabel(data.cash_runway_days)}</Text>
                <Text style={s.kpiLabel}>استقلالية الخزينة</Text>
              </View>
              <View style={s.kpiCard}>
                <MaterialIcons name="shield" size={20} color={data.risk_level === 'low' ? C.primary : data.risk_level === 'critical' ? C.error : '#f59e0b'} />
                <Text style={s.kpiValue}>{riskLabel(data.risk_level)}</Text>
                <Text style={s.kpiLabel}>مستوى المخاطرة</Text>
              </View>
            </View>

            {/* Monthly summary */}
            <View style={s.monthlySummary}>
              <View style={s.monthlyItem}>
                <Text style={s.monthlyLabel}>إيرادات هذا الشهر</Text>
                <Text style={[s.monthlyValue, { color: C.primary }]}>+{data.monthly_income.toFixed(3)} TND</Text>
              </View>
              <View style={s.monthlySep} />
              <View style={s.monthlyItem}>
                <Text style={s.monthlyLabel}>مصاريف هذا الشهر</Text>
                <Text style={[s.monthlyValue, { color: C.error }]}>-{data.monthly_expenses.toFixed(3)} TND</Text>
              </View>
              <View style={s.monthlySep} />
              <View style={s.monthlyItem}>
                <Text style={s.monthlyLabel}>صافي الربح</Text>
                <Text style={[s.monthlyValue, { color: data.net_profit >= 0 ? C.primary : C.error }]}>
                  {data.net_profit >= 0 ? '+' : ''}{data.net_profit.toFixed(3)} TND
                </Text>
              </View>
            </View>

            {/* Breakdown */}
            <View style={s.breakdownRow}>
              {[
                { label: 'الانتظام', value: breakdown.regularite, color: C.primary },
                { label: 'الادخار', value: breakdown.epargne, color: C.secondary },
                { label: 'قدرة السداد', value: breakdown.remboursement, color: C.primary },
              ].map(item => (
                <View key={item.label} style={s.breakdownCard}>
                  <Text style={s.breakdownLabel}>{item.label}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
                    <Text style={[s.breakdownScore, { color: item.color }]}>{item.value}</Text>
                    <Text style={s.breakdownMax}>/100</Text>
                  </View>
                  <View style={s.breakdownTrack}>
                    <View style={[s.breakdownFill, { width: `${item.value}%`, backgroundColor: item.color }]} />
                  </View>
                </View>
              ))}
            </View>

            {/* Anomalies */}
            {anomalies.length > 0 && (
              <>
                <Text style={s.tipsTitle}>تنبيهات مكتشفة</Text>
                {anomalies.map((a, i) => (
                  <View key={i} style={[s.tipCard, { borderLeftWidth: 3, borderLeftColor: anomalySeverityColor(a.severity) }]}>
                    <View style={[s.tipIcon, { backgroundColor: anomalySeverityColor(a.severity) + '22' }]}>
                      <MaterialIcons name="warning" size={22} color={anomalySeverityColor(a.severity)} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.tipName, { color: anomalySeverityColor(a.severity) }]}>
                        {a.anomaly_type === 'income_drop' ? 'انخفاض الإيرادات' : 'إنفاق غير معتاد'}
                      </Text>
                      <Text style={s.tipDesc}>{a.description}</Text>
                    </View>
                  </View>
                ))}
              </>
            )}

            {/* Tips */}
            <Text style={[s.tipsTitle, anomalies.length > 0 && { marginTop: 8 }]}>
              {anomalies.length > 0 ? 'توصيات' : 'ما يحسّن درجتك'}
            </Text>
            {tips.map((tip, i) => (
              <View key={i} style={s.tipCard}>
                <View style={[s.tipIcon, { backgroundColor: tip.color + '18' }]}>
                  <MaterialIcons name={tip.icon} size={24} color={tip.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.tipName, { color: tip.color }]}>{tip.name}</Text>
                  <Text style={s.tipDesc}>{tip.desc}</Text>
                </View>
              </View>
            ))}

            {/* Balance */}
            <View style={s.balanceCard}>
              <MaterialIcons name="account-balance-wallet" size={20} color={C.onPrimaryFixedVariant} />
              <Text style={s.balanceLabel}>رصيد الحساب المهني</Text>
              <Text style={s.balanceValue}>{data.balance.toFixed(3)} TND</Text>
            </View>

            {/* Share */}
            <TouchableOpacity style={s.shareBtn}>
              <MaterialIcons name="share" size={22} color={C.onSecondaryContainer} />
              <Text style={s.shareBtnText}>مشاركة درجتي مع إندا</Text>
            </TouchableOpacity>
            <Text style={s.shareNote}>مشاركة درجتك تسهّل الحصول على قروض صغيرة بشروط أفضل.</Text>
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.surface },
  scroll: { paddingHorizontal: 24 },
  appBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 64 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surfaceContainerHigh, borderWidth: 2, borderColor: 'rgba(0,67,44,0.1)' },
  logo: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 20, color: C.primaryContainer },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surfaceContainerLow, alignItems: 'center', justifyContent: 'center' },
  centered: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  loadingText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: C.onSurfaceVariant, marginTop: 8 },
  errorText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16, color: C.onSurface, marginTop: 8 },
  errorSub: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: C.onSurfaceVariant },
  retryBtn: { marginTop: 12, backgroundColor: C.primary, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 99 },
  retryText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14, color: '#fff' },
  heroSection: { alignItems: 'center', marginBottom: 32 },
  heroTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 24, color: C.onSurface, marginBottom: 32 },
  gaugeWrap: { width: 256, height: 256, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  gaugeTrack: { position: 'absolute', top: 16, left: 16, right: 16, bottom: 16, borderRadius: 999, borderWidth: 16, borderColor: C.surfaceContainerHigh },
  gaugeCenter: { alignItems: 'center' },
  gaugeScore: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 60, color: C.primary, letterSpacing: -2 },
  gaugeLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 12, color: 'rgba(0,67,44,0.6)', textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4 },
  heroDesc: { fontFamily: 'Manrope_400Regular', fontSize: 14, color: C.onSurfaceVariant, textAlign: 'center', maxWidth: 280, marginTop: 24, lineHeight: 20 },
  kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  kpiCard: { flex: 1, backgroundColor: C.surfaceContainerLowest, borderRadius: 14, padding: 14, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: C.surfaceContainerHigh },
  kpiValue: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12, color: C.onSurface, textAlign: 'center' },
  kpiLabel: { fontFamily: 'Manrope_400Regular', fontSize: 10, color: C.onSurfaceVariant, textAlign: 'center' },
  monthlySummary: { backgroundColor: C.surfaceContainerLowest, borderRadius: 16, padding: 20, flexDirection: 'row', alignItems: 'center', marginBottom: 24, borderWidth: 1, borderColor: C.surfaceContainerHigh },
  monthlyItem: { flex: 1, alignItems: 'center', gap: 4 },
  monthlyLabel: { fontFamily: 'Manrope_400Regular', fontSize: 11, color: C.onSurfaceVariant, textAlign: 'center' },
  monthlyValue: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, textAlign: 'center' },
  monthlySep: { width: 1, height: 40, backgroundColor: C.surfaceContainerHigh },
  breakdownRow: { flexDirection: 'row', gap: 10, marginBottom: 32 },
  breakdownCard: { flex: 1, backgroundColor: C.surfaceContainerLowest, borderRadius: 16, padding: 16, gap: 10 },
  breakdownLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 11, color: C.onSurfaceVariant },
  breakdownScore: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 22 },
  breakdownMax: { fontFamily: 'Manrope_700Bold', fontSize: 10, color: 'rgba(63,73,67,0.5)', marginBottom: 3 },
  breakdownTrack: { height: 6, backgroundColor: C.surfaceContainerLow, borderRadius: 99, overflow: 'hidden' },
  breakdownFill: { height: '100%', borderRadius: 99 },
  tipsTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18, color: C.onSurface, marginBottom: 16 },
  tipCard: { backgroundColor: C.surfaceContainerLowest, borderRadius: 16, padding: 20, flexDirection: 'row', alignItems: 'flex-start', gap: 16, marginBottom: 12 },
  tipIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tipName: { fontFamily: 'Manrope_700Bold', fontSize: 14, marginBottom: 4 },
  tipDesc: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: C.onSurfaceVariant, lineHeight: 18 },
  balanceCard: { backgroundColor: C.primaryFixed, borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  balanceLabel: { flex: 1, fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: C.onPrimaryFixedVariant },
  balanceValue: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, color: C.onPrimaryFixed },
  shareBtn: { backgroundColor: C.secondaryContainer, borderRadius: 16, paddingVertical: 20, paddingHorizontal: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 16, shadowColor: '#1b1c19', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.06, shadowRadius: 32 },
  shareBtnText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 17, color: C.onSecondaryContainer },
  shareNote: { fontFamily: 'Manrope_400Regular', fontSize: 11, color: 'rgba(63,73,67,0.6)', textAlign: 'center', paddingHorizontal: 40, lineHeight: 16 },
});
