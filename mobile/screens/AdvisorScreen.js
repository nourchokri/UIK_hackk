import { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Image,
  TouchableOpacity, TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform, Animated, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import * as Speech from 'expo-speech';
import { C } from '../constants/colors';
import { API_URL, FATMA_USER_ID } from '../constants/config';

const NOUR_AVATAR = require('../assets/nour.png');
const GREETING = 'مرحباً! أنا زيزيا، مستشارتك المالية. كيف يمكنني مساعدتك اليوم؟';

// Hidden WebView HTML — uses the browser's Web Speech API (works on Android Chrome WebView)
const SPEECH_HTML = `<!DOCTYPE html>
<html>
<head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body>
<script>
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var recognition = null;

  function post(obj) {
    window.ReactNativeWebView.postMessage(JSON.stringify(obj));
  }

  if (SR) {
    recognition = new SR();
    recognition.lang = 'ar-SA';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = function(e) {
      var last = e.results[e.results.length - 1];
      post({ type: 'result', transcript: last[0].transcript, isFinal: last.isFinal });
    };
    recognition.onend = function() { post({ type: 'end' }); };
    recognition.onerror = function(e) { post({ type: 'error', error: e.error }); };
    recognition.onstart = function() { post({ type: 'start' }); };
    post({ type: 'ready' });
  } else {
    post({ type: 'error', error: 'not_supported' });
  }

  window.startSTT = function() {
    try { if (recognition) recognition.start(); } catch(e) {}
  };
  window.stopSTT = function() {
    try { if (recognition) recognition.stop(); } catch(e) {}
  };
<\/script>
</body>
</html>`;

export default function AdvisorScreen() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [sttReady, setSttReady] = useState(false); // eslint-disable-line
  const [lastNourMsg, setLastNourMsg] = useState(GREETING);

  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const scrollRef = useRef(null);
  const webViewRef = useRef(null);

  // Detect keyboard open/close
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardVisible(true);
      setTimeout(() => { if (messages.length > 0) scrollRef.current?.scrollToEnd({ animated: true }); }, 80);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // ── Pulse rings animation ─────────────────────────────────────────────────
  const pulse1 = useRef(new Animated.Value(1)).current;
  const pulse2 = useRef(new Animated.Value(1)).current;
  const pulse1Opacity = useRef(new Animated.Value(0)).current;
  const pulse2Opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const active = isSpeaking || isListening;
    if (active) {
      const r1 = Animated.loop(Animated.sequence([
        Animated.parallel([
          Animated.timing(pulse1, { toValue: 1.38, duration: 850, useNativeDriver: true }),
          Animated.timing(pulse1Opacity, { toValue: 0, duration: 850, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(pulse1, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(pulse1Opacity, { toValue: 0.55, duration: 0, useNativeDriver: true }),
        ]),
      ]));
      const r2 = Animated.loop(Animated.sequence([
        Animated.delay(380),
        Animated.parallel([
          Animated.timing(pulse2, { toValue: 1.38, duration: 850, useNativeDriver: true }),
          Animated.timing(pulse2Opacity, { toValue: 0, duration: 850, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(pulse2, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(pulse2Opacity, { toValue: 0.38, duration: 0, useNativeDriver: true }),
        ]),
      ]));
      r1.start(); r2.start();
      return () => { r1.stop(); r2.stop(); };
    } else {
      Animated.parallel([
        Animated.timing(pulse1Opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(pulse2Opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start(() => { pulse1.setValue(1); pulse2.setValue(1); });
    }
  }, [isSpeaking, isListening]);

  // ── WebView message handler (STT events) ─────────────────────────────────
  function handleWebViewMessage(event) {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'ready') {
        setSttReady(true);
      } else if (data.type === 'start') {
        setIsListening(true);
        Speech.stop();
        setIsSpeaking(false);
      } else if (data.type === 'result') {
        setInput(data.transcript);
        if (data.isFinal && data.transcript.trim()) {
          setInput('');
          setIsListening(false);
          sendMessageText(data.transcript.trim());
        }
      } else if (data.type === 'end') {
        setIsListening(false);
      } else if (data.type === 'error') {
        console.log('[STT]', data.error);
        setIsListening(false);
        if (data.error === 'not_supported') setSttReady(false);
      }
    } catch (e) {
      console.log('[STT] parse error', e);
    }
  }

  // ── TTS ───────────────────────────────────────────────────────────────────
  function speakText(text) {
    if (!voiceEnabled) return;
    Speech.stop();
    setIsSpeaking(true);
    Speech.speak(text, {
      language: 'ar',
      onStart: () => setIsSpeaking(true),
      onDone: () => setIsSpeaking(false),
      onStopped: () => setIsSpeaking(false),
      onError: () => {
        Speech.speak(text, {
          onDone: () => setIsSpeaking(false),
          onStopped: () => setIsSpeaking(false),
          onError: () => setIsSpeaking(false),
        });
      },
    });
  }

  useEffect(() => {
    const t = setTimeout(() => speakText(GREETING), 1000);
    return () => { clearTimeout(t); Speech.stop(); };
  }, []);

  // ── Mic toggle ────────────────────────────────────────────────────────────
  function toggleListening() {
    if (isListening) {
      webViewRef.current?.injectJavaScript('window.stopSTT(); true;');
      setIsListening(false);
    } else {
      Speech.stop();
      setIsSpeaking(false);
      setInput('');
      webViewRef.current?.injectJavaScript('window.startSTT(); true;');
    }
  }

  // ── Send message ──────────────────────────────────────────────────────────
  async function sendMessageText(text) {
    if (!text || loading) return;
    const history = messages.map(m => ({ role: m.role, content: m.content }));
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setLoading(true);
    Speech.stop();
    setIsSpeaking(false);
    try {
      const res = await fetch(`${API_URL}/advisor/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: FATMA_USER_ID, message: text, conversation_history: history }),
      });
      const data = await res.json();
      const reply = data.reply || 'لم أستطع الرد.';
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
      setLastNourMsg(reply);
      speakText(reply);
    } catch {
      const err = 'عذراً، تعذّر الاتصال. تحقق من الشبكة.';
      setMessages(prev => [...prev, { role: 'assistant', content: err }]);
      setLastNourMsg(err);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }

  function sendMessage() {
    const text = input.trim();
    if (!text) return;
    setInput('');
    sendMessageText(text);
  }

  function toggleVoice() { Speech.stop(); setIsSpeaking(false); setVoiceEnabled(v => !v); }

  const active = isSpeaking || isListening;
  const ringColor = isListening ? C.secondary : C.primary;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={0}
      >

        {/* Hidden WebView for speech recognition */}
        <WebView
          ref={webViewRef}
          source={{ html: SPEECH_HTML }}
          onMessage={handleWebViewMessage}
          style={s.hiddenWebView}
          javaScriptEnabled
          originWhitelist={['*']}
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback
        />

        {/* Top bar */}
        <View style={s.topBar}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={[s.statusDot, { backgroundColor: active ? '#22c55e' : '#a8a29e' }]} />
            <Text style={s.statusText}>
              {isListening ? 'أستمع إليك...' : isSpeaking ? 'زيزيا تتحدث...' : 'زيزيا · مستشارة مالية'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <TouchableOpacity style={s.iconBtn} onPress={() => speakText(lastNourMsg)}>
              <MaterialIcons name="replay" size={20} color={C.onSurfaceVariant} />
            </TouchableOpacity>
            <TouchableOpacity style={[s.iconBtn, !voiceEnabled && s.iconBtnOff]} onPress={toggleVoice}>
              <MaterialIcons name={voiceEnabled ? 'volume-up' : 'volume-off'} size={20} color={voiceEnabled ? C.primary : C.outline} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Compact header — always visible */}
        <View style={s.heroCompact}>
          <View style={s.avatarWrapSm}>
            <Animated.View style={[s.pulseRingSm, { backgroundColor: ringColor + '35', transform: [{ scale: pulse1 }], opacity: pulse1Opacity }]} />
            <Image source={NOUR_AVATAR} style={s.avatarSm} />
            <View style={[s.sparkBadgeSm, isListening && { backgroundColor: C.secondary }]}>
              <MaterialIcons name={isListening ? 'mic' : 'auto-awesome'} size={8} color={C.onSecondaryContainer} />
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.nourNameSm}>Zezia</Text>
            <Text style={s.nourRoleSm}>مستشارة مالية</Text>
          </View>
          {(isSpeaking || isListening) && (
            <View style={s.waveWrap}>
              {[0,1,2,3].map(i => <WaveBar key={i} delay={i*110} color={isListening ? C.secondary : C.primary} />)}
            </View>
          )}
          {loading && <ActivityIndicator size="small" color={C.primary} />}
        </View>

        {/* Chat history — takes all remaining space */}
        <ScrollView
          ref={scrollRef}
          style={s.chatScroll}
          contentContainerStyle={s.chatContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => { if (messages.length > 0) scrollRef.current?.scrollToEnd({ animated: false }); }}
        >
          {/* Greeting bubble always shown at top */}
          <View style={s.nourRow}>
            <Image source={NOUR_AVATAR} style={s.smallAvatar} />
            <View style={s.nourBubble}>
              <Text style={s.nourText}>{GREETING}</Text>
            </View>
          </View>

          {messages.map((msg, i) => (
            <View key={i} style={msg.role === 'user' ? s.userRow : s.nourRow}>
              {msg.role === 'assistant' && <Image source={NOUR_AVATAR} style={s.smallAvatar} />}
              <View style={msg.role === 'user' ? s.userBubble : s.nourBubble}>
                <Text style={msg.role === 'user' ? s.userText : s.nourText}>{msg.content}</Text>
              </View>
            </View>
          ))}
          <View style={{ height: 8 }} />
        </ScrollView>

        {/* Input bar */}
        <View style={[s.inputWrap, { paddingBottom: keyboardVisible ? 10 : 92 }]}>
          <View style={s.inputBar}>
            <TouchableOpacity
              style={[s.micBtn, isListening && s.micBtnActive]}
              onPress={toggleListening}
              activeOpacity={0.8}
            >
              <MaterialIcons name={isListening ? 'stop' : 'mic'} size={22} color={isListening ? '#fff' : C.onSurface} />
            </TouchableOpacity>
            <TextInput
              style={s.input}
              placeholder={isListening ? 'أستمع إليك...' : 'اطرح سؤالاً...'}
              placeholderTextColor={isListening ? C.secondary : C.outline}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={sendMessage}
              returnKeyType="send"
              multiline
              editable={!isListening}
            />
            <TouchableOpacity
              style={[s.sendBtn, (!input.trim() || loading || isListening) && s.sendBtnOff]}
              onPress={sendMessage}
              disabled={!input.trim() || loading || isListening}
            >
              <MaterialIcons name="send" size={19} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function WaveBar({ delay, color }) {
  const anim = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(anim, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0.3, duration: 280, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);
  return <Animated.View style={[s.waveBar, { backgroundColor: color, transform: [{ scaleY: anim }] }]} />;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.surface },
  hiddenWebView: { width: 0, height: 0, position: 'absolute' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: C.onSurfaceVariant },
  iconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.surfaceContainerLow, alignItems: 'center', justifyContent: 'center' },
  iconBtnOff: { backgroundColor: C.surfaceContainerHigh },
  heroCompact: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: C.surfaceContainerHigh,
    backgroundColor: C.surface,
  },
  avatarWrapSm: { width: 44, height: 44, borderRadius: 22, overflow: 'visible', alignItems: 'center', justifyContent: 'center' },
  pulseRingSm: { position: 'absolute', width: 56, height: 56, borderRadius: 28 },
  avatarSm: { width: 44, height: 44, borderRadius: 22 },
  sparkBadgeSm: { position: 'absolute', bottom: 0, right: 0, backgroundColor: C.secondaryContainer, borderRadius: 99, padding: 2, borderWidth: 1, borderColor: C.surface },
  nourNameSm: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, color: C.onSurface },
  nourRoleSm: { fontFamily: 'Manrope_600SemiBold', fontSize: 10, color: C.onSurfaceVariant, letterSpacing: 0.6, marginTop: 1 },
  waveWrap: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 16 },
  waveBar: { width: 3, height: 14, borderRadius: 2 },
  chatScroll: { flex: 1 },
  chatContent: { paddingHorizontal: 20, paddingTop: 14, gap: 12 },
  userRow: { flexDirection: 'row', justifyContent: 'flex-end', marginLeft: 48 },
  nourRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginRight: 24 },
  smallAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.primaryFixed },
  userBubble: { backgroundColor: C.primaryContainer, borderRadius: 18, borderBottomRightRadius: 4, paddingHorizontal: 16, paddingVertical: 10 },
  nourBubble: { flex: 1, backgroundColor: C.surfaceContainerLowest, borderRadius: 18, borderBottomLeftRadius: 4, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: C.surfaceContainerHigh },
  userText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: C.onPrimary, lineHeight: 20 },
  nourText: { fontFamily: 'Manrope_400Regular', fontSize: 14, color: C.onSurface, lineHeight: 20 },
  inputWrap: { paddingHorizontal: 16, paddingBottom: 10, paddingTop: 8, backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.surfaceContainerHigh },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, backgroundColor: C.surfaceContainerLow, borderRadius: 18, paddingHorizontal: 10, paddingVertical: 8 },
  micBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center' },
  micBtnActive: { backgroundColor: C.secondary },
  input: { flex: 1, fontFamily: 'Manrope_400Regular', fontSize: 15, color: C.onSurface, maxHeight: 100, paddingVertical: 4 },
  sendBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.primaryContainer, alignItems: 'center', justifyContent: 'center' },
  sendBtnOff: { backgroundColor: C.surfaceContainerHigh },
});
