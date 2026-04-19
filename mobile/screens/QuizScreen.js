import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, SafeAreaView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { C } from '../constants/colors';
import { API_URL, FATMA_USER_ID } from '../constants/config';

// ─── helpers ────────────────────────────────────────────────────────────────

async function apiPost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function QuizScreen({ navigation }) {
  // screen state: 'loading' | 'active' | 'results' | 'error'
  const [phase, setPhase] = useState('loading');
  const [errorMsg, setErrorMsg] = useState('');

  // quiz data
  const [quizId, setQuizId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentLevel, setCurrentLevel] = useState(1);
  const [currentXp, setCurrentXp] = useState(0);

  // per-question state
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null); // option id e.g. 'A'
  const [feedback, setFeedback] = useState(null);            // QuizFeedback object
  const [submitting, setSubmitting] = useState(false);

  // results
  const [results, setResults] = useState(null);

  // ── Generate quiz on mount ─────────────────────────────────────────────────
  const generateQuiz = useCallback(async () => {
    setPhase('loading');
    setErrorMsg('');
    setQuestionIndex(0);
    setSelectedOption(null);
    setFeedback(null);
    setResults(null);
    try {
      const data = await apiPost(
        `${API_URL}/api/quiz/generate?user_id=${FATMA_USER_ID}`,
      );
      setQuizId(data.quiz_id);
      setQuestions(data.questions);
      setCurrentLevel(data.current_level);
      setCurrentXp(data.current_xp);
      setPhase('active');
    } catch (e) {
      setErrorMsg(e.message || 'تعذّر إنشاء الاختبار.');
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    generateQuiz();
  }, [generateQuiz]);

  // ── Submit selected answer ─────────────────────────────────────────────────
  const handleValidate = async () => {
    if (!selectedOption || submitting || feedback) return;
    setSubmitting(true);
    try {
      const q = questions[questionIndex];
      const fb = await apiPost(`${API_URL}/api/quiz/submit-answer`, {
        quiz_id: quizId,
        question_id: q.question_id,
        selected_answer: selectedOption,
      });
      setFeedback(fb);
    } catch (e) {
      setErrorMsg(e.message || 'خطأ أثناء التحقق.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Advance to next question or complete ───────────────────────────────────
  const handleNext = async () => {
    const nextIndex = questionIndex + 1;
    if (nextIndex < questions.length) {
      setQuestionIndex(nextIndex);
      setSelectedOption(null);
      setFeedback(null);
    } else {
      // complete quiz
      setPhase('loading');
      try {
        const data = await apiPost(
          `${API_URL}/api/quiz/complete?quiz_id=${quizId}`,
        );
        setResults(data);
        setPhase('results');
      } catch (e) {
        setErrorMsg(e.message || 'خطأ أثناء إنهاء الاختبار.');
        setPhase('error');
      }
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.centered}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={s.loadingText}>جار إنشاء اختبارك الشخصي...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'error') {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.centered}>
          <MaterialIcons name="close" size={48} color={C.error} />
          <Text style={s.errorTitle}>حدث خطأ</Text>
          <Text style={s.errorMsg}>{errorMsg}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={generateQuiz}>
            <Text style={s.retryBtnText}>إعادة المحاولة</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 12 }}>
            <Text style={s.backLink}>رجوع</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'results' && results) {
    return <ResultsView results={results} navigation={navigation} />;
  }

  // Active quiz
  const q = questions[questionIndex];
  const total = questions.length;
  const progressPct = ((questionIndex) / total) * 100;

  return (
    <SafeAreaView style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={C.onSurface} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>اختبار سريع</Text>
        <Text style={s.headerCounter}>{questionIndex + 1}/{total}</Text>
      </View>

      {/* Progress bar */}
      <View style={s.progressTrack}>
        <View style={[s.progressFill, { width: `${progressPct}%` }]} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Topic chip */}
        <View style={s.topicChip}>
          <Text style={s.topicText}>{q.topic.replace(/_/g, ' ')}</Text>
        </View>

        {/* Question */}
        <Text style={s.questionText}>{q.question_text}</Text>

        {/* Options */}
        <View style={s.optionsContainer}>
          {q.options.map((opt) => {
            const isSelected = selectedOption === opt.id;
            const hasFeedback = !!feedback;
            const isCorrect = hasFeedback && opt.id === feedback.correct_answer;
            const isWrong = hasFeedback && isSelected && !feedback.is_correct;

            let optStyle = [s.optionBtn];
            let optTextStyle = [s.optionText];
            let iconName = null;

            if (isCorrect) {
              optStyle.push(s.optionCorrect);
              optTextStyle.push(s.optionTextCorrect);
              iconName = 'check-circle';
            } else if (isWrong) {
              optStyle.push(s.optionWrong);
              optTextStyle.push(s.optionTextWrong);
              iconName = 'close';
            } else if (isSelected) {
              optStyle.push(s.optionSelected);
              optTextStyle.push(s.optionTextSelected);
            }

            return (
              <TouchableOpacity
                key={opt.id}
                style={optStyle}
                onPress={() => !hasFeedback && setSelectedOption(opt.id)}
                activeOpacity={hasFeedback ? 1 : 0.7}
              >
                <View style={s.optionIdBadge}>
                  <Text style={s.optionIdText}>{opt.id}</Text>
                </View>
                <Text style={[optTextStyle, { flex: 1 }]}>{opt.text}</Text>
                {iconName && (
                  <MaterialIcons
                    name={iconName}
                    size={20}
                    color={isCorrect ? C.primary : C.error}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Feedback */}
        {feedback && (
          <View style={[s.feedbackCard, feedback.is_correct ? s.feedbackCorrect : s.feedbackWrong]}>
            <Text style={s.feedbackTitle}>
              {feedback.is_correct ? 'إجابة صحيحة! +10 XP' : 'ليس تماماً...'}
            </Text>
            <Text style={s.feedbackExplanation}>{feedback.explanation}</Text>
            {feedback.learning_tip ? (
              <View style={s.tipRow}>
                <MaterialIcons name="emoji-events" size={16} color={C.secondary} />
                <Text style={s.tipText}>{feedback.learning_tip}</Text>
              </View>
            ) : null}
          </View>
        )}

        {/* Validate / Next buttons */}
        <View style={s.actionRow}>
          {!feedback ? (
            <TouchableOpacity
              style={[s.primaryBtn, (!selectedOption || submitting) && s.primaryBtnDisabled]}
              onPress={handleValidate}
              disabled={!selectedOption || submitting}
            >
              {submitting
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={s.primaryBtnText}>تأكيد</Text>}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.primaryBtn} onPress={handleNext}>
              <Text style={s.primaryBtnText}>
                {questionIndex + 1 < total ? 'السؤال التالي' : 'إنهاء الاختبار'}
              </Text>
              <MaterialIcons name="arrow-forward" size={18} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Results view ────────────────────────────────────────────────────────────

function ResultsView({ results, navigation }) {
  const {
    score_percentage,
    total_xp_earned,
    new_level,
    new_xp,
    level_up,
    correct_answers,
    total_questions,
  } = results;

  const LEVEL_LABELS = {
    1: 'رائد أعمال مبتدئ',
    2: 'رائد أعمال متمرس',
    3: 'رائد أعمال خبير',
    4: 'خبير',
  };

  const isPerfect = correct_answers === total_questions;
  const isGood = score_percentage >= 50;

  return (
    <SafeAreaView style={s.root}>
      <ScrollView contentContainerStyle={[s.scroll, s.resultsScroll]} showsVerticalScrollIndicator={false}>
        {/* Trophy */}
        <View style={s.trophyWrap}>
          <MaterialIcons
            name="emoji-events"
            size={72}
            color={isPerfect ? C.secondaryContainer : isGood ? C.primary : C.onSurfaceVariant}
          />
        </View>

        <Text style={s.resultsTitle}>
          {isPerfect ? 'مثالي!' : isGood ? 'أحسنت!' : 'واصل جهودك!'}
        </Text>

        {/* Score card */}
        <View style={s.scoreCard}>
          <Text style={s.scoreBig}>{correct_answers}/{total_questions}</Text>
          <Text style={s.scoreLabel}>إجابات صحيحة</Text>
          <View style={s.scoreDivider} />
          <Text style={s.scorePct}>{score_percentage}%</Text>
        </View>

        {/* XP badge */}
        <View style={s.xpRow}>
          <View style={s.xpBadge}>
            <Text style={s.xpBadgeText}>+{total_xp_earned} XP</Text>
          </View>
          {level_up && (
            <View style={s.levelUpBadge}>
              <MaterialIcons name="arrow-upward" size={14} color={C.primary} />
              <Text style={s.levelUpText}>المستوى {new_level}!</Text>
            </View>
          )}
        </View>

        {/* Level info */}
        <View style={s.levelCard}>
          <Text style={s.levelCardLabel}>مستواك</Text>
          <Text style={s.levelCardName}>{LEVEL_LABELS[new_level] || `المستوى ${new_level}`}</Text>
          <Text style={s.levelCardXp}>{new_xp} XP إجمالي</Text>
        </View>

        {/* Done button */}
        <TouchableOpacity style={s.primaryBtn} onPress={() => navigation.goBack()}>
          <Text style={s.primaryBtnText}>إنهاء</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.surface },

  // loading / error
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingText: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 15,
    color: C.onSurfaceVariant,
    marginTop: 16,
    textAlign: 'center',
  },
  errorTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 20,
    color: C.onSurface,
    marginTop: 16,
    marginBottom: 8,
  },
  errorMsg: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
    color: C.onSurfaceVariant,
    textAlign: 'center',
    marginBottom: 24,
  },
  retryBtn: {
    backgroundColor: C.primary,
    borderRadius: 99,
    paddingVertical: 14,
    paddingHorizontal: 40,
  },
  retryBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
    color: '#fff',
  },
  backLink: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 14,
    color: C.primary,
  },

  // header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 18,
    color: C.onSurface,
    flex: 1,
  },
  headerCounter: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 14,
    color: C.onSurfaceVariant,
  },

  // progress bar
  progressTrack: {
    height: 6,
    backgroundColor: C.surfaceContainerHigh,
    marginHorizontal: 16,
    borderRadius: 99,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: C.primary,
    borderRadius: 99,
  },

  scroll: { padding: 24, paddingBottom: 48 },

  // topic chip
  topicChip: {
    alignSelf: 'flex-start',
    backgroundColor: C.primaryFixed,
    borderRadius: 99,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 16,
  },
  topicText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
    color: C.onPrimaryFixedVariant,
    textTransform: 'capitalize',
  },

  // question
  questionText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 18,
    color: C.onSurface,
    lineHeight: 26,
    marginBottom: 24,
  },

  // options
  optionsContainer: { gap: 12, marginBottom: 24 },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.surfaceContainerLowest,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: C.outlineVariant,
  },
  optionSelected: {
    borderColor: C.primary,
    backgroundColor: C.primaryFixed,
  },
  optionCorrect: {
    borderColor: C.primary,
    backgroundColor: C.primaryFixed,
  },
  optionWrong: {
    borderColor: C.error,
    backgroundColor: C.errorContainer,
  },
  optionIdBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionIdText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: C.onSurface,
  },
  optionText: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
    color: C.onSurface,
    lineHeight: 20,
  },
  optionTextSelected: { fontFamily: 'Manrope_600SemiBold', color: C.onPrimaryFixed },
  optionTextCorrect: { fontFamily: 'Manrope_600SemiBold', color: C.onPrimaryFixed },
  optionTextWrong: { fontFamily: 'Manrope_600SemiBold', color: C.onErrorContainer },

  // feedback
  feedbackCard: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
    gap: 8,
  },
  feedbackCorrect: { backgroundColor: C.primaryFixed },
  feedbackWrong: { backgroundColor: C.errorContainer },
  feedbackTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
    color: C.onSurface,
  },
  feedbackExplanation: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 13,
    color: C.onSurface,
    lineHeight: 19,
  },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 4 },
  tipText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    color: C.secondary,
    flex: 1,
    lineHeight: 18,
  },

  // action buttons
  actionRow: { marginTop: 8 },
  primaryBtn: {
    backgroundColor: C.primary,
    borderRadius: 99,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
    color: '#fff',
  },

  // results
  resultsScroll: { alignItems: 'center' },
  trophyWrap: { marginTop: 24, marginBottom: 8 },
  resultsTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 26,
    color: C.onSurface,
    marginBottom: 24,
    textAlign: 'center',
  },
  scoreCard: {
    backgroundColor: C.surfaceContainerLowest,
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 40,
    alignItems: 'center',
    marginBottom: 20,
    width: '100%',
    shadowColor: '#1b1c19',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 24,
    elevation: 2,
  },
  scoreBig: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 52,
    color: C.primary,
    lineHeight: 60,
  },
  scoreLabel: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
    color: C.onSurfaceVariant,
    marginBottom: 12,
  },
  scoreDivider: {
    height: 1,
    width: 60,
    backgroundColor: C.outlineVariant,
    marginBottom: 12,
  },
  scorePct: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 22,
    color: C.onSurface,
  },
  xpRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  xpBadge: {
    backgroundColor: C.secondaryFixed,
    borderRadius: 99,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  xpBadgeText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
    color: C.onSecondaryFixed,
  },
  levelUpBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.primaryFixed,
    borderRadius: 99,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  levelUpText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: C.primary,
  },
  levelCard: {
    backgroundColor: C.surfaceContainerLow,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    width: '100%',
    marginBottom: 28,
  },
  levelCardLabel: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    color: C.onSurfaceVariant,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  levelCardName: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 18,
    color: C.primary,
    marginBottom: 4,
  },
  levelCardXp: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 14,
    color: C.onSurfaceVariant,
  },
});
