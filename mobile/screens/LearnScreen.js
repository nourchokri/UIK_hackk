import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Image,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { C } from '../constants/colors';
import { API_URL, FATMA_USER_ID } from '../constants/config';

// ─── helpers ─────────────────────────────────────────────────────────────────

async function apiFetch(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LearnScreen({ navigation }) {
  // progress
  const [progress, setProgress] = useState(null);
  const [progressLoading, setProgressLoading] = useState(true);

  // lesson of the day
  const [lesson, setLesson] = useState(null);
  const [lessonLoading, setLessonLoading] = useState(true);

  const fetchProgress = useCallback(async () => {
    setProgressLoading(true);
    try {
      const data = await apiFetch(
        `${API_URL}/learn/progress?user_id=${FATMA_USER_ID}`,
      );
      setProgress(data);
    } catch {
      setProgress(null);
    } finally {
      setProgressLoading(false);
    }
  }, []);

  const fetchLesson = useCallback(async () => {
    setLessonLoading(true);
    try {
      const data = await apiFetch(
        `${API_URL}/learn/generate?user_id=${FATMA_USER_ID}`,
      );
      setLesson(data);
    } catch {
      setLesson(null);
    } finally {
      setLessonLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProgress();
    fetchLesson();
  }, [fetchProgress, fetchLesson]);

  // Refresh progress when returning from QuizScreen
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', fetchProgress);
    return unsubscribe;
  }, [navigation, fetchProgress]);

  // ── Derived progress values ───────────────────────────────────────────────
  const xp = progress?.xp ?? 0;
  const levelLabel = progress?.level_label ?? 'Entrepreneur Débutant';
  const level = progress?.level ?? 1;
  const progressPct = progress?.progress_percent ?? 0;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* AppBar */}
        <View style={s.appBar}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Image
              source={{ uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAcqT0eljnwJ3H9DYLFiLsh6wkkn-jSXPknIOt0Vp8R3WBANvxzZkQVpkrO5HJ37oWBpLdu2iXooAn8EYhiQu8Yiw-sntzBSXuSDP0DZV70va7V5M0Ql86G-oiibxRKgL1sREv_oZLsVzoo9qWjyK4LMF44gmAkZfdZjWFC8Wvxi4rJN7bzf6_FINgxiAz4gbWlHe3FJEgutQoy7WkN4pnjJtE4IAplxIe18DaHMeEKvpZum5ABHYr92vGjFhWRvmMtQmVACRKJbRo' }}
              style={s.avatar}
            />
            <Text style={s.logo}>Walleta</Text>
          </View>
          <TouchableOpacity style={s.iconBtn}>
            <MaterialIcons name="notifications" size={24} color={C.primaryContainer} />
          </TouchableOpacity>
        </View>

        {/* Progression */}
        <View style={s.progressSection}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
            <View>
              <Text style={s.progressLabel}>تقدّمك</Text>
              {progressLoading ? (
                <ActivityIndicator size="small" color={C.primary} style={{ marginTop: 6 }} />
              ) : (
                <Text style={s.progressLevel}>المستوى {level} — {levelLabel}</Text>
              )}
            </View>
            <Text style={s.progressPct}>
              {progressLoading ? '—' : `${Math.round(progressPct)}%`}
            </Text>
          </View>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: progressLoading ? '0%' : `${Math.min(progressPct, 100)}%` }]} />
          </View>
          {!progressLoading && (
            <Text style={s.xpLabel}>{xp} XP</Text>
          )}
        </View>

        {/* Leçon du jour */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>درس اليوم</Text>
        </View>
        <View style={s.lessonCard}>
          <View style={s.lessonImageWrap}>
            <Image
              source={{ uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBwkYEMw3hEzDGyS9TEfNvMF223aNzzUkT_IPxE7v2nH6Y9nJfCCD8STTXzkkL2aOFoE0X5-_Cp4bUY4Iya5BJfMWo5XyAEeaC-zFOD5EFmyPwNlONXEa3rYvZOE2HTe24U4QWlCD0g1lmZgxKOfF1zfa4pmYBxDFFP_widGAnDqVko8FKy-U-fCpXXEHPwfNGMtD6pprMjfWRIXyfutQQDnhEf6CdoEQ0PeLB91xws-o0IzuRdDPToDu8pBkXI0dlLYBr499aAFIo' }}
              style={s.lessonImage}
            />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.4)']}
              style={StyleSheet.absoluteFill}
            />
            <View style={s.lessonBadgeWrap}>
              <View style={s.lessonBadge}>
                <Text style={s.lessonBadgeText}>
                  {lesson?.difficulty ?? 'Débutant'}
                </Text>
              </View>
            </View>
          </View>

          {lessonLoading ? (
            <View style={{ paddingVertical: 12, alignItems: 'center' }}>
              <ActivityIndicator size="small" color={C.primary} />
              <Text style={s.lessonMeta}>جار تحميل الدرس...</Text>
            </View>
          ) : (
            <>
              <Text style={s.lessonTitle}>
                {lesson?.title ?? 'Comprendre votre marge bénéficiaire'}
              </Text>
              <View style={{ flexDirection: 'row', gap: 20, marginTop: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <MaterialIcons name="schedule" size={14} color={C.onSurfaceVariant} />
                  <Text style={s.lessonMeta}>{lesson?.duration ?? '3 min'}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <MaterialIcons name="book" size={14} color={C.onSurfaceVariant} />
                  <Text style={s.lessonMeta}>{lesson?.topic ?? 'Finance de base'}</Text>
                </View>
              </View>
            </>
          )}

          <LinearGradient
            colors={[C.primary, C.primaryContainer]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={s.startBtn}
          >
            <TouchableOpacity
              style={s.startBtnInner}
              onPress={() => {/* lesson detail navigation placeholder */}}
              disabled={lessonLoading}
            >
              <Text style={s.startBtnText}>بدء الدرس</Text>
              <MaterialIcons name="play-arrow" size={20} color="#ffffff" />
            </TouchableOpacity>
          </LinearGradient>
        </View>

        {/* Continuer */}
        <View style={[s.sectionHeader, { marginTop: 8 }]}>
          <Text style={s.sectionTitle}>استمرار</Text>
          <TouchableOpacity><Text style={s.sectionLink}>عرض الكل</Text></TouchableOpacity>
        </View>

        {/* Course Card 1 */}
        <View style={s.courseCard}>
          <View style={s.courseIcon}>
            <MaterialIcons name="account-balance" size={28} color={C.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.courseName}>إدارة التدفق النقدي</Text>
            <Text style={s.courseSub}>حسّن تدفقاتك المالية</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <View style={s.courseTrack}>
                <View style={[s.courseFill, { width: '40%' }]} />
              </View>
              <Text style={s.courseProgress}>2/5 modules</Text>
            </View>
          </View>
          <MaterialIcons name="play-circle-outline" size={32} color={C.primary} />
        </View>

        {/* Course Card 2 */}
        <View style={s.courseCard}>
          <View style={s.courseIcon}>
            <MaterialIcons name="storefront" size={28} color={C.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.courseName}>التسويق الرقمي المحلي</Text>
            <Text style={s.courseSub}>اجذب المزيد من العملاء</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <View style={s.courseTrack}>
                <View style={[s.courseFill, { width: '80%' }]} />
              </View>
              <Text style={s.courseProgress}>4/5 modules</Text>
            </View>
          </View>
          <MaterialIcons name="play-circle-outline" size={32} color={C.primary} />
        </View>

        {/* Quiz Rapide */}
        <View style={[s.quizCard, { marginBottom: 120 }]}>
          <View style={s.quizDecor} />
          <View style={{ position: 'relative', zIndex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <MaterialIcons name="quiz" size={20} color={C.onSecondaryFixedVariant} />
              <Text style={s.quizTitle}>اختبار سريع</Text>
            </View>
            <Text style={s.quizSub}>اختبر معرفتك — 4 أسئلة · دقيقتان</Text>
            <TouchableOpacity
              style={s.quizBtn}
              onPress={() => navigation.navigate('Quiz')}
            >
              <Text style={s.quizBtnText}>ابدأ</Text>
              <MaterialIcons name="arrow-forward" size={14} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.surface },
  scroll: { paddingHorizontal: 24 },
  appBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 64 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surfaceContainerHighest },
  logo: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 20, color: C.primaryContainer },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  progressSection: { marginBottom: 40 },
  progressLabel: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: C.onSurfaceVariant },
  progressLevel: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18, color: C.primary, marginTop: 4 },
  progressPct: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16, color: C.primary },
  progressTrack: { height: 12, backgroundColor: C.surfaceContainerHigh, borderRadius: 99, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: C.secondaryContainer, borderRadius: 99 },
  xpLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 12, color: C.onSurfaceVariant, marginTop: 6 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingHorizontal: 4 },
  sectionTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18, color: C.onSurface },
  sectionLink: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: C.primary },
  lessonCard: { backgroundColor: C.surfaceContainerLowest, borderRadius: 16, padding: 20, marginBottom: 32, shadowColor: '#1b1c19', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.04, shadowRadius: 32 },
  lessonImageWrap: { aspectRatio: 16 / 9, borderRadius: 12, overflow: 'hidden', marginBottom: 16 },
  lessonImage: { width: '100%', height: '100%' },
  lessonBadgeWrap: { position: 'absolute', bottom: 12, left: 12, flexDirection: 'row', gap: 8 },
  lessonBadge: { backgroundColor: C.primaryFixed, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
  lessonBadgeText: { fontFamily: 'Manrope_700Bold', fontSize: 10, color: C.onPrimaryFixedVariant, textTransform: 'uppercase', letterSpacing: 0.8 },
  lessonTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 20, color: C.onSurface, lineHeight: 26 },
  lessonMeta: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: C.onSurfaceVariant },
  startBtn: { marginTop: 24, borderRadius: 99 },
  startBtnInner: { paddingVertical: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  startBtnText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16, color: '#ffffff' },
  courseCard: { backgroundColor: C.surfaceContainerLow, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 },
  courseIcon: { width: 64, height: 64, borderRadius: 12, backgroundColor: C.surfaceContainerHighest, alignItems: 'center', justifyContent: 'center' },
  courseName: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16, color: C.onSurface },
  courseSub: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: C.onSurfaceVariant, marginTop: 2 },
  courseTrack: { flex: 1, height: 6, backgroundColor: C.surfaceContainerHighest, borderRadius: 99, overflow: 'hidden' },
  courseFill: { height: '100%', backgroundColor: C.primary, borderRadius: 99 },
  courseProgress: { fontFamily: 'Manrope_700Bold', fontSize: 10, color: C.primary },
  quizCard: { backgroundColor: C.secondaryFixed, borderRadius: 16, padding: 24, overflow: 'hidden', position: 'relative' },
  quizDecor: { position: 'absolute', top: -32, right: -32, width: 128, height: 128, backgroundColor: 'rgba(254,174,44,0.2)', borderRadius: 64 },
  quizTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16, color: C.onSecondaryFixed, textTransform: 'uppercase', letterSpacing: 0.5 },
  quizSub: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: C.onSecondaryFixedVariant, marginBottom: 20 },
  quizBtn: { backgroundColor: C.onSecondaryFixed, borderRadius: 99, paddingVertical: 12, paddingHorizontal: 32, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
  quizBtnText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, color: '#ffffff' },
});
