import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { C } from '../constants/colors';
import { API_URL, FATMA_USER_ID } from '../constants/config';

// Parse invoice details from note field
function parseNote(note) {
  if (!note) return {};
  const result = {};
  const lines = note.split('\n');
  lines.forEach(line => {
    if (line.startsWith('Date facture:')) result.date = line.replace('Date facture:', '').trim();
    if (line.startsWith('Facture:')) result.facture = line.replace('Facture:', '').trim();
    if (line.startsWith('MF:')) result.mf = line.replace('MF:', '').trim();
    if (line.startsWith('Adresse:')) result.adresse = line.replace('Adresse:', '').trim();
    if (line.startsWith('Devise:')) result.devise = line.replace('Devise:', '').trim();
    const artMatch = line.match(/--- Articles \((\d+)\) ---/);
    if (artMatch) result.articles = parseInt(artMatch[1]);
  });
  return result;
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return isoStr; }
}

export default function FacturesScreen({ navigation }) {
  const [factures, setFactures] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);

  async function fetchFactures() {
    try {
      const res = await fetch(`${API_URL}/api/transactions/list?user_id=${FATMA_USER_ID}&limit=100`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // Only show transactions that have invoice notes
      const invoices = (data.transactions || []).filter(
        tx => tx.note && tx.note.includes('Date facture:')
      );
      setFactures(invoices);
    } catch (e) {
      console.warn('[Factures] error:', e.message);
    }
  }

  React.useEffect(() => {
    setLoading(true);
    fetchFactures().finally(() => setLoading(false));
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    await fetchFactures();
    setRefreshing(false);
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={22} color={C.onSurface} />
        </TouchableOpacity>
        <View>
          <Text style={s.title}>Historique des factures</Text>
          <Text style={s.subtitle}>{factures.length} facture{factures.length > 1 ? 's' : ''} scannée{factures.length > 1 ? 's' : ''}</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.primary]} />}
      >
        {loading && (
          <View style={s.centered}>
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={s.loadingText}>Chargement…</Text>
          </View>
        )}

        {!loading && factures.length === 0 && (
          <View style={s.centered}>
            <MaterialIcons name="receipt-long" size={56} color={C.outline} />
            <Text style={s.emptyTitle}>Aucune facture scannée</Text>
            <Text style={s.emptySub}>Scannez votre première facture depuis l'onglet Activités</Text>
            <TouchableOpacity style={s.scanBtn} onPress={() => navigation.goBack()}>
              <MaterialIcons name="photo-camera" size={18} color="#fff" />
              <Text style={s.scanBtnText}>Scanner une facture</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && factures.map((tx) => {
          const info = parseNote(tx.note);
          return (
            <View key={tx.id} style={s.card}>
              {/* Card header */}
              <View style={s.cardTop}>
                <View style={s.cardIcon}>
                  <MaterialIcons name="receipt-long" size={22} color={C.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.merchant} numberOfLines={1}>{tx.merchant || 'Facture'}</Text>
                  <Text style={s.dateText}>{formatDate(tx.created_at)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.amount}>{Number(tx.amount).toLocaleString('fr-FR', { minimumFractionDigits: 3 })} TND</Text>
                  <View style={s.categoryChip}>
                    <Text style={s.categoryText}>{tx.category || 'autre'}</Text>
                  </View>
                </View>
              </View>

              {/* Invoice details */}
              <View style={s.divider} />
              <View style={s.details}>
                {info.date && (
                  <View style={s.detailRow}>
                    <MaterialIcons name="event" size={13} color={C.onSurfaceVariant} />
                    <Text style={s.detailLabel}>Date facture</Text>
                    <Text style={s.detailValue}>{info.date}</Text>
                  </View>
                )}
                {info.facture && (
                  <View style={s.detailRow}>
                    <MaterialIcons name="tag" size={13} color={C.onSurfaceVariant} />
                    <Text style={s.detailLabel}>N° Facture</Text>
                    <Text style={s.detailValue}>{info.facture}</Text>
                  </View>
                )}
                {info.mf && (
                  <View style={s.detailRow}>
                    <MaterialIcons name="business" size={13} color={C.onSurfaceVariant} />
                    <Text style={s.detailLabel}>MF</Text>
                    <Text style={s.detailValue}>{info.mf}</Text>
                  </View>
                )}
                {info.adresse && (
                  <View style={s.detailRow}>
                    <MaterialIcons name="location-on" size={13} color={C.onSurfaceVariant} />
                    <Text style={s.detailLabel}>Adresse</Text>
                    <Text style={[s.detailValue, { flex: 1 }]} numberOfLines={1}>{info.adresse}</Text>
                  </View>
                )}
                {info.articles !== undefined && (
                  <View style={s.detailRow}>
                    <MaterialIcons name="inventory" size={13} color={C.onSurfaceVariant} />
                    <Text style={s.detailLabel}>Articles</Text>
                    <Text style={s.detailValue}>{info.articles} article{info.articles > 1 ? 's' : ''}</Text>
                  </View>
                )}
              </View>
            </View>
          );
        })}

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.surface },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 1,
    borderBottomColor: C.surfaceContainerHigh,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surfaceContainerLow, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 20, color: C.onSurface },
  subtitle: { fontFamily: 'Manrope_400Regular', fontSize: 12, color: C.onSurfaceVariant, marginTop: 2 },
  scroll: { paddingHorizontal: 24, paddingTop: 20 },
  centered: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  loadingText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: C.onSurfaceVariant },
  emptyTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18, color: C.onSurface, marginTop: 8 },
  emptySub: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: C.onSurfaceVariant, textAlign: 'center', paddingHorizontal: 32 },
  scanBtn: {
    marginTop: 16, backgroundColor: C.primary, borderRadius: 99,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 24, paddingVertical: 12,
  },
  scanBtnText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14, color: '#fff' },
  card: {
    backgroundColor: C.surfaceContainerLowest, borderRadius: 16,
    marginBottom: 16, overflow: 'hidden',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  cardIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.primaryFixed, alignItems: 'center', justifyContent: 'center' },
  merchant: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: C.onSurface },
  dateText: { fontFamily: 'Manrope_400Regular', fontSize: 12, color: C.onSurfaceVariant, marginTop: 2 },
  amount: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, color: C.error },
  categoryChip: { backgroundColor: C.surfaceContainerHigh, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  categoryText: { fontFamily: 'Manrope_700Bold', fontSize: 10, color: C.onSurfaceVariant, textTransform: 'uppercase' },
  divider: { height: 1, backgroundColor: C.surfaceContainerHigh, marginHorizontal: 16 },
  details: { padding: 16, gap: 8 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailLabel: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: C.onSurfaceVariant, width: 80 },
  detailValue: { fontFamily: 'Manrope_600SemiBold', fontSize: 12, color: C.onSurface },
});
