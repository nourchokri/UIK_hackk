import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, Image, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../constants/colors';
import { API_URL, FATMA_USER_ID } from '../constants/config';

const CATEGORIES = [
  { key: 'supplies',  label: 'Matières',   icon: 'inventory' },
  { key: 'equipment', label: 'Équipement', icon: 'build' },
  { key: 'utilities', label: 'Services',   icon: 'receipt' },
  { key: 'transport', label: 'Transport',  icon: 'local-shipping' },
  { key: 'other',     label: 'Autre',      icon: 'more-horiz' },
];

// ── Helper ─────────────────────────────────────────────────────────────────────
function fmt(num, decimals = 3) {
  if (num == null || isNaN(num)) return '—';
  return Number(num).toFixed(decimals);
}
function isoToDisplay(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  } catch { return ''; }
}
function displayToIso(str) {
  if (!str) return new Date().toISOString();
  const p = str.split('/');
  if (p.length === 3) return new Date(`${p[2]}-${p[1]}-${p[0]}`).toISOString();
  return new Date().toISOString();
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function SectionTitle({ title, icon }) {
  return (
    <View style={s.sectionRow}>
      <MaterialIcons name={icon} size={15} color={C.primaryContainer} />
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  );
}
function FieldLabel({ label, required }) {
  return <Text style={s.fieldLabel}>{label}{required ? ' *' : ''}</Text>;
}
function ReadonlyRow({ label, value, highlight }) {
  return (
    <View style={s.roRow}>
      <Text style={s.roLabel}>{label}</Text>
      <Text style={[s.roValue, highlight && { color: C.primary, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15 }]}>
        {value}
      </Text>
    </View>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function ScannerScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef(null);
  const pollRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();

  const [stage, setStage] = useState('camera');
  const [photoUri, setPhotoUri] = useState(null);
  const [torch, setTorch] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // ── Form fields (all extracted) ──────────────────────────────────────────
  const [entreprise, setEntreprise] = useState('');
  const [adresse, setAdresse] = useState('');
  const [mf, setMf] = useState('');
  const [factureNum, setFactureNum] = useState('');
  const [dateVal, setDateVal] = useState('');
  const [devise, setDevise] = useState('TND');
  const [category, setCategory] = useState('supplies');
  // Articles — array of editable objects
  const [articles, setArticles] = useState([]);
  // Totaux — read-only display + editable total_ttc
  const [totaux, setTotaux] = useState({});
  const [totalTTC, setTotalTTC] = useState('');

  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current); }, []);

  // ── Permission ─────────────────────────────────────────────────────────────
  if (!permission) return <View style={s.root} />;
  if (!permission.granted) return (
    <View style={[s.root, s.centered, { backgroundColor: C.background }]}>
      <MaterialIcons name="camera-alt" size={64} color={C.outline} />
      <Text style={s.permTitle}>Accès caméra requis</Text>
      <Text style={s.permSub}>Pour scanner vos factures</Text>
      <TouchableOpacity style={s.bigBtn} onPress={requestPermission}>
        <Text style={s.bigBtnText}>Autoriser</Text>
      </TouchableOpacity>
    </View>
  );

  // ── Actions ────────────────────────────────────────────────────────────────
  const takePhoto = async () => {
    try {
      const p = await cameraRef.current.takePictureAsync({ quality: 0.85, skipProcessing: true });
      setPhotoUri(p.uri); setStage('preview');
    } catch { Alert.alert('Erreur', 'Impossible de prendre la photo.'); }
  };

  const pickGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission refusée', 'Accès galerie requis.'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ 
      mediaTypes: ImagePicker.MediaTypeOptions.Images, 
      quality: 1.0,
    });
    if (!r.canceled && r.assets[0]) { setPhotoUri(r.assets[0].uri); setStage('preview'); }
  };

  const uploadAndAnalyze = async () => {
    setStage('loading');
    try {
      const form = new FormData();
      form.append('receipt', { uri: photoUri, type: 'image/jpeg', name: 'receipt.jpg' });
      form.append('merchantId', 'demo-merchant-001');
      const res = await fetch(`${API_URL}/api/receipts/upload`, {
        method: 'POST', body: form, headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (!res.ok) throw new Error(`Serveur: ${res.status}`);
      const { receiptId } = await res.json();
      pollStatus(receiptId);
    } catch (e) {
      setErrorMsg(e.message || 'Connexion impossible'); setStage('error');
    }
  };

  const pollStatus = (id) => {
    const check = async () => {
      try {
        const r = await fetch(`${API_URL}/api/receipts/${id}/status`);
        const data = await r.json();
        if (data.status === 'complete' || data.status === 'analyzing') {
          const full = await (await fetch(`${API_URL}/api/receipts/${id}`)).json();
          populateForm(full.parsedData);
          setStage('form');
        } else if (data.status === 'failed') {
          setErrorMsg(data.error || 'Analyse échouée'); setStage('error');
        } else {
          pollRef.current = setTimeout(check, 2000);
        }
      } catch { setErrorMsg('Connexion perdue'); setStage('error'); }
    };
    check();
  };

  const populateForm = (pd) => {
    if (!pd) return;
    setEntreprise(pd.entreprise || pd.merchant?.name || '');
    setAdresse(pd.adresse || pd.merchant?.address || '');
    setMf(pd.mf || '');
    setFactureNum(pd.facture_numero || pd.invoiceNumber || '');
    setDevise(pd.devise || pd.currency || 'TND');
    setDateVal(isoToDisplay(pd.date));
    const arts = (pd.articles || pd.items || []).map(a => ({
      designation: a.designation || a.name || '',
      quantite: String(a.quantite ?? a.quantity ?? ''),
      prix_unitaire: String(a.prix_unitaire ?? a.unitPrice ?? ''),
      tva: String(a.tva ?? a.tvaPct ?? ''),
      remise: String(a.remise ?? a.remisePct ?? ''),
      prix_total: String(a.prix_total ?? a.totalPrice ?? ''),
    }));
    setArticles(arts);
    const t = pd.totaux || {};
    setTotaux(t);
    const ttc = t.total_ttc ?? pd.total ?? 0;
    setTotalTTC(fmt(ttc));
  };

  const updateArticle = (idx, field, val) => {
    setArticles(prev => prev.map((a, i) => i === idx ? { ...a, [field]: val } : a));
  };

  const confirmSave = async () => {
    const amount = parseFloat(totalTTC.replace(',', '.'));
    if (!entreprise.trim()) { Alert.alert('Champ requis', 'Saisissez le fournisseur.'); return; }
    if (isNaN(amount) || amount <= 0) { Alert.alert('Montant invalide', 'Vérifiez le Total TTC.'); return; }
    setStage('saving');
    try {
      const res = await fetch(`${API_URL}/api/transactions/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: FATMA_USER_ID,
          entreprise: entreprise.trim(),
          adresse: adresse.trim() || null,
          mf: mf.trim() || null,
          facture_numero: factureNum.trim() || null,
          date: displayToIso(dateVal),
          total_ttc: amount,
          category,
          devise,
          articles: articles.map(a => ({
            designation: a.designation,
            quantite: parseFloat(a.quantite) || null,
            prix_unitaire: parseFloat(a.prix_unitaire) || null,
            tva: parseFloat(a.tva) || null,
            remise: parseFloat(a.remise) || null,
            prix_total: parseFloat(a.prix_total) || null,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Erreur ${res.status}`);
      setStage('success');
    } catch (e) {
      Alert.alert('Erreur de confirmation', e.message);
      setStage('form');
    }
  };

  const reset = () => {
    if (pollRef.current) clearTimeout(pollRef.current);
    setStage('camera'); setPhotoUri(null); setErrorMsg('');
    setEntreprise(''); setAdresse(''); setMf(''); setFactureNum('');
    setDateVal(''); setDevise('TND'); setArticles([]); setTotaux({}); setTotalTTC('');
    setCategory('supplies');
  };

  // ── CAMERA ─────────────────────────────────────────────────────────────────
  if (stage === 'camera') return (
    <View style={s.root}>
      <CameraView ref={cameraRef} style={s.camera} facing="back" enableTorch={torch}>
        <LinearGradient colors={['rgba(0,0,0,0.55)','transparent']}
          style={[s.topBar,{paddingTop:insets.top+8}]}>
          <TouchableOpacity style={s.topBarBtn} onPress={()=>navigation.goBack()}>
            <MaterialIcons name="arrow-back" size={22} color="#fff"/>
          </TouchableOpacity>
          <Text style={s.topBarTitle}>Scanner une facture</Text>
          <TouchableOpacity style={s.topBarBtn} onPress={()=>setTorch(t=>!t)}>
            <MaterialIcons name={torch?'flash-on':'flash-off'} size={22} color="#fff"/>
          </TouchableOpacity>
        </LinearGradient>
        <View style={s.guideWrap}>
          <View style={s.guideFrame}>
            <View style={[s.corner,s.cTL]}/><View style={[s.corner,s.cTR]}/>
            <View style={[s.corner,s.cBL]}/><View style={[s.corner,s.cBR]}/>
          </View>
          <Text style={s.guideHint}>Centrez la facture dans le cadre</Text>
        </View>
        <LinearGradient colors={['transparent','rgba(0,0,0,0.7)']}
          style={[s.bottomBar,{paddingBottom:insets.bottom+24}]}>
          <TouchableOpacity style={s.galleryBtn} onPress={pickGallery}>
            <MaterialIcons name="photo-library" size={28} color="#fff"/>
            <Text style={s.galleryLabel}>Galerie</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.captureBtn} onPress={takePhoto}>
            <View style={s.captureBtnInner}/>
          </TouchableOpacity>
          <View style={{width:64}}/>
        </LinearGradient>
      </CameraView>
    </View>
  );

  // ── PREVIEW ────────────────────────────────────────────────────────────────
  if (stage === 'preview') return (
    <View style={s.root}>
      <Image source={{uri:photoUri}} style={s.previewImg} resizeMode="contain"/>
      <LinearGradient colors={['rgba(0,0,0,0.5)','transparent']}
        style={[s.topBar,{paddingTop:insets.top+8}]}>
        <TouchableOpacity style={s.topBarBtn} onPress={reset}>
          <MaterialIcons name="close" size={22} color="#fff"/>
        </TouchableOpacity>
        <Text style={s.topBarTitle}>Aperçu</Text>
        <View style={{width:40}}/>
      </LinearGradient>
      <View style={[s.sheet,{paddingBottom:insets.bottom+16}]}>
        <Text style={s.sheetTitle}>Photo prête</Text>
        <Text style={s.sheetSub}>La facture est-elle bien lisible ?</Text>
        <View style={{flexDirection:'row',gap:12,marginTop:20}}>
          <TouchableOpacity style={s.outlineBtn} onPress={reset}>
            <MaterialIcons name="refresh" size={18} color={C.primary}/>
            <Text style={s.outlineBtnText}>Reprendre</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.primaryBtn} onPress={uploadAndAnalyze}>
            <MaterialIcons name="auto-awesome" size={18} color="#fff"/>
            <Text style={s.primaryBtnText}>Analyser</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  // ── LOADING ────────────────────────────────────────────────────────────────
  if (stage === 'loading') return (
    <View style={[s.root,s.centered,{backgroundColor:C.background}]}>
      <View style={s.centerCard}>
        <ActivityIndicator size="large" color={C.primary}/>
        <Text style={s.centerTitle}>Analyse de la facture...</Text>
        <Text style={s.centerSub}>Extraction et structuration des données</Text>
      </View>
    </View>
  );

  // ── SAVING ─────────────────────────────────────────────────────────────────
  if (stage === 'saving') return (
    <View style={[s.root,s.centered,{backgroundColor:C.background}]}>
      <View style={s.centerCard}>
        <ActivityIndicator size="large" color={C.primary}/>
        <Text style={s.centerTitle}>Enregistrement...</Text>
      </View>
    </View>
  );

  // ── ERROR ──────────────────────────────────────────────────────────────────
  if (stage === 'error') return (
    <View style={[s.root,s.centered,{backgroundColor:C.background}]}>
      <View style={s.centerCard}>
        <MaterialIcons name="error-outline" size={56} color={C.error}/>
        <Text style={[s.centerTitle,{color:C.onSurface}]}>Erreur</Text>
        <Text style={s.centerSub}>{errorMsg}</Text>
        <TouchableOpacity style={[s.primaryBtn,{marginTop:20,alignSelf:'stretch'}]} onPress={reset}>
          <Text style={s.primaryBtnText}>Réessayer</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ── SUCCESS ────────────────────────────────────────────────────────────────
  if (stage === 'success') return (
    <View style={[s.root,s.centered,{backgroundColor:C.background}]}>
      <View style={s.centerCard}>
        <View style={s.successRing}>
          <MaterialIcons name="check-circle" size={64} color={C.primary}/>
        </View>
        <Text style={s.centerTitle}>Transaction enregistrée !</Text>
        <Text style={s.centerSub}>{entreprise}</Text>
        <Text style={[s.centerSub,{fontFamily:'PlusJakartaSans_700Bold',color:C.primary,fontSize:20,marginTop:4}]}>
          {totalTTC} {devise}
        </Text>
        <TouchableOpacity style={[s.primaryBtn,{marginTop:24,alignSelf:'stretch'}]} onPress={()=>navigation.navigate('Activities')}>
          <MaterialIcons name="swap-horiz" size={18} color="#fff"/>
          <Text style={s.primaryBtnText}>Voir mes activités</Text>
          <MaterialIcons name="arrow-forward" size={18} color="#fff"/>
        </TouchableOpacity>
        <TouchableOpacity style={[s.outlineBtn,{marginTop:10,alignSelf:'stretch'}]} onPress={reset}>
          <MaterialIcons name="camera-alt" size={16} color={C.primary}/>
          <Text style={s.outlineBtnText}>Nouvelle facture</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ── FORM ────────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView style={[s.root,{backgroundColor:C.background}]}
      behavior={Platform.OS==='ios'?'padding':undefined}>

      {/* Header */}
      <LinearGradient colors={[C.primary,C.primaryContainer]}
        style={[s.formHeader,{paddingTop:insets.top+10}]}>
        <TouchableOpacity onPress={reset}>
          <MaterialIcons name="arrow-back" size={22} color="#fff"/>
        </TouchableOpacity>
        <Text style={s.formHeaderTitle}>Vérifier la facture</Text>
        <View style={s.aiChip}>
          <MaterialIcons name="auto-awesome" size={12} color={C.secondaryContainer}/>
          <Text style={s.aiChipText}>IA</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">

        {/* Tip */}
        <View style={s.tipBox}>
          <MaterialIcons name="edit" size={15} color={C.primaryContainer}/>
          <Text style={s.tipText}>Corrigez les champs si nécessaire puis confirmez.</Text>
        </View>

        {/* ── Section: Fournisseur ─────────────────────────────────────── */}
        <SectionTitle title="Informations fournisseur" icon="business"/>

        <FieldLabel label="Fournisseur" required/>
        <TextInput style={s.input} value={entreprise} onChangeText={setEntreprise}
          placeholder="Nom du fournisseur" placeholderTextColor={C.outline}/>

        <FieldLabel label="Adresse"/>
        <TextInput style={[s.input,{height:56}]} value={adresse} onChangeText={setAdresse}
          placeholder="Adresse complète" placeholderTextColor={C.outline} multiline/>

        <View style={{flexDirection:'row',gap:12}}>
          <View style={{flex:1}}>
            <FieldLabel label="Matricule Fiscal"/>
            <TextInput style={s.input} value={mf} onChangeText={setMf}
              placeholder="MF / Matricule" placeholderTextColor={C.outline} autoCapitalize="characters"/>
          </View>
          <View style={{flex:1}}>
            <FieldLabel label="N° Facture"/>
            <TextInput style={s.input} value={factureNum} onChangeText={setFactureNum}
              placeholder="Ex: FAC-001" placeholderTextColor={C.outline}/>
          </View>
        </View>

        <View style={{flexDirection:'row',gap:12}}>
          <View style={{flex:1}}>
            <FieldLabel label="Date"/>
            <TextInput style={s.input} value={dateVal} onChangeText={setDateVal}
              placeholder="JJ/MM/AAAA" placeholderTextColor={C.outline} keyboardType="numeric"/>
          </View>
          <View style={{flex:1}}>
            <FieldLabel label="Devise"/>
            <TextInput style={s.input} value={devise} onChangeText={setDevise}
              placeholder="TND" placeholderTextColor={C.outline} autoCapitalize="characters"/>
          </View>
        </View>

        {/* ── Section: Catégorie ───────────────────────────────────────── */}
        <SectionTitle title="Catégorie de dépense" icon="category"/>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:16}}>
          {CATEGORIES.map(cat=>(
            <TouchableOpacity key={cat.key}
              style={[s.catChip,category===cat.key&&s.catChipActive]}
              onPress={()=>setCategory(cat.key)}>
              <MaterialIcons name={cat.icon} size={15}
                color={category===cat.key?'#fff':C.outline}/>
              <Text style={[s.catChipText,category===cat.key&&{color:'#fff'}]}>{cat.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── Section: Articles ────────────────────────────────────────── */}
        {articles.length > 0 && (
          <>
            <SectionTitle title={`Articles (${articles.length})`} icon="list-alt"/>
            {articles.map((art, idx) => (
              <View key={idx} style={s.articleCard}>
                {/* Désignation */}
                <TextInput
                  style={[s.input,{marginBottom:8,backgroundColor:C.surfaceContainerLow}]}
                  value={art.designation}
                  onChangeText={v=>updateArticle(idx,'designation',v)}
                  placeholder="Désignation"
                  placeholderTextColor={C.outline}
                />
                {/* Row: Qté + PU */}
                <View style={{flexDirection:'row',gap:8,marginBottom:8}}>
                  <View style={{flex:1}}>
                    <Text style={s.miniLabel}>Quantité</Text>
                    <TextInput style={s.miniInput} value={art.quantite}
                      onChangeText={v=>updateArticle(idx,'quantite',v)}
                      placeholder="1" placeholderTextColor={C.outline} keyboardType="decimal-pad"/>
                  </View>
                  <View style={{flex:1}}>
                    <Text style={s.miniLabel}>Prix unitaire</Text>
                    <TextInput style={s.miniInput} value={art.prix_unitaire}
                      onChangeText={v=>updateArticle(idx,'prix_unitaire',v)}
                      placeholder="0.000" placeholderTextColor={C.outline} keyboardType="decimal-pad"/>
                  </View>
                </View>
                {/* Row: TVA + Remise */}
                <View style={{flexDirection:'row',gap:8,marginBottom:8}}>
                  <View style={{flex:1}}>
                    <Text style={s.miniLabel}>TVA %</Text>
                    <TextInput style={s.miniInput} value={art.tva}
                      onChangeText={v=>updateArticle(idx,'tva',v)}
                      placeholder="7" placeholderTextColor={C.outline} keyboardType="decimal-pad"/>
                  </View>
                  <View style={{flex:1}}>
                    <Text style={s.miniLabel}>Remise %</Text>
                    <TextInput style={s.miniInput} value={art.remise}
                      onChangeText={v=>updateArticle(idx,'remise',v)}
                      placeholder="0" placeholderTextColor={C.outline} keyboardType="decimal-pad"/>
                  </View>
                  <View style={{flex:1.2}}>
                    <Text style={s.miniLabel}>Prix total</Text>
                    <TextInput style={[s.miniInput,{borderColor:C.primary}]} value={art.prix_total}
                      onChangeText={v=>updateArticle(idx,'prix_total',v)}
                      placeholder="0.000" placeholderTextColor={C.outline} keyboardType="decimal-pad"/>
                  </View>
                </View>
              </View>
            ))}
          </>
        )}

        {/* ── Section: Totaux ──────────────────────────────────────────── */}
        <SectionTitle title="Totaux" icon="calculate"/>
        <View style={s.totauxCard}>
          {totaux.sous_total_ht != null &&
            <ReadonlyRow label="Sous-total HT" value={`${fmt(totaux.sous_total_ht)} ${devise}`}/>}
          {totaux.remise > 0 &&
            <ReadonlyRow label="Remise" value={`-${fmt(totaux.remise)} ${devise}`}/>}
          {totaux.total_ht != null &&
            <ReadonlyRow label="Total HT" value={`${fmt(totaux.total_ht)} ${devise}`}/>}
          {totaux.tva > 0 &&
            <ReadonlyRow label="TVA" value={`${fmt(totaux.tva)} ${devise}`}/>}
          {totaux.timbre_fiscal > 0 &&
            <ReadonlyRow label="Timbre fiscal" value={`${fmt(totaux.timbre_fiscal)} ${devise}`}/>}
          <View style={s.divider}/>
          <View style={{paddingTop:4}}>
            <FieldLabel label="Total TTC" required/>
            <View style={s.totalWrap}>
              <TextInput
                style={s.totalInput}
                value={totalTTC}
                onChangeText={setTotalTTC}
                keyboardType="decimal-pad"
                placeholder="0.000"
                placeholderTextColor={C.outline}
              />
              <View style={s.totalDevise}>
                <Text style={s.totalDeviseText}>{devise}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Confirm ──────────────────────────────────────────────────── */}
        <TouchableOpacity onPress={confirmSave} activeOpacity={0.85} style={{marginTop:8}}>
          <LinearGradient colors={[C.primary,C.primaryContainer]}
            start={{x:0,y:0}} end={{x:1,y:1}} style={s.confirmBtn}>
            <MaterialIcons name="check-circle" size={22} color="#fff"/>
            <Text style={s.confirmBtnText}>Confirmer le paiement</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity style={s.cancelLink} onPress={reset}>
          <Text style={s.cancelText}>Annuler</Text>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:{ flex:1, backgroundColor:'#000' },
  centered:{ justifyContent:'center', alignItems:'center' },

  // Camera
  camera:{ flex:1 },
  topBar:{ position:'absolute', top:0, left:0, right:0, flexDirection:'row',
    justifyContent:'space-between', alignItems:'center', paddingHorizontal:20,
    paddingBottom:20, zIndex:10 },
  topBarBtn:{ width:40, height:40, borderRadius:20,
    backgroundColor:'rgba(255,255,255,0.2)', alignItems:'center', justifyContent:'center' },
  topBarTitle:{ fontFamily:'PlusJakartaSans_700Bold', fontSize:17, color:'#fff' },
  guideWrap:{ flex:1, alignItems:'center', justifyContent:'center' },
  guideFrame:{ width:'78%', aspectRatio:0.72, borderWidth:2,
    borderColor:C.secondaryContainer, borderRadius:10 },
  corner:{ position:'absolute', width:22, height:22, borderColor:C.secondaryContainer },
  cTL:{ top:-2, left:-2, borderTopWidth:4, borderLeftWidth:4, borderTopLeftRadius:6 },
  cTR:{ top:-2, right:-2, borderTopWidth:4, borderRightWidth:4, borderTopRightRadius:6 },
  cBL:{ bottom:-2, left:-2, borderBottomWidth:4, borderLeftWidth:4, borderBottomLeftRadius:6 },
  cBR:{ bottom:-2, right:-2, borderBottomWidth:4, borderRightWidth:4, borderBottomRightRadius:6 },
  guideHint:{ color:'rgba(255,255,255,0.75)', fontFamily:'Manrope_500Medium', fontSize:13, marginTop:16 },
  bottomBar:{ position:'absolute', bottom:0, left:0, right:0, flexDirection:'row',
    alignItems:'center', justifyContent:'space-between', paddingHorizontal:40, paddingTop:20 },
  galleryBtn:{ width:64, alignItems:'center', gap:4 },
  galleryLabel:{ color:'#fff', fontFamily:'Manrope_600SemiBold', fontSize:11 },
  captureBtn:{ width:72, height:72, borderRadius:36, borderWidth:4,
    borderColor:'#fff', alignItems:'center', justifyContent:'center' },
  captureBtnInner:{ width:56, height:56, borderRadius:28, backgroundColor:'#fff' },

  // Preview
  previewImg:{ flex:1, backgroundColor:'#000' },
  sheet:{ backgroundColor:C.surfaceContainerLowest, borderTopLeftRadius:24,
    borderTopRightRadius:24, padding:24 },
  sheetTitle:{ fontFamily:'PlusJakartaSans_700Bold', fontSize:20, color:C.onSurface },
  sheetSub:{ fontFamily:'Manrope_400Regular', fontSize:14, color:C.outline, marginTop:4 },

  // Buttons
  primaryBtn:{ flex:1, height:52, borderRadius:12, backgroundColor:C.primary,
    flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8 },
  primaryBtnText:{ fontFamily:'PlusJakartaSans_700Bold', fontSize:15, color:'#fff' },
  outlineBtn:{ flex:1, height:52, borderRadius:12, borderWidth:1.5,
    borderColor:C.primary, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8 },
  outlineBtnText:{ fontFamily:'Manrope_700Bold', fontSize:15, color:C.primary },
  bigBtn:{ backgroundColor:C.primary, borderRadius:12, paddingHorizontal:32, paddingVertical:14, marginTop:24 },
  bigBtnText:{ fontFamily:'PlusJakartaSans_700Bold', fontSize:15, color:'#fff' },

  // Center cards (loading/error/success)
  centerCard:{ backgroundColor:C.surfaceContainerLowest, borderRadius:24, padding:32,
    alignItems:'center', margin:32, width:'85%',
    shadowColor:'#000', shadowOffset:{width:0,height:8}, shadowOpacity:0.06, shadowRadius:24 },
  centerTitle:{ fontFamily:'PlusJakartaSans_700Bold', fontSize:20, color:C.primary, marginTop:20, marginBottom:8 },
  centerSub:{ fontFamily:'Manrope_400Regular', fontSize:14, color:C.outline, textAlign:'center', lineHeight:20 },
  successRing:{ width:96, height:96, borderRadius:48, backgroundColor:C.primaryFixed,
    alignItems:'center', justifyContent:'center' },

  // Permission
  permTitle:{ fontFamily:'PlusJakartaSans_700Bold', fontSize:22, color:C.onSurface, marginTop:20 },
  permSub:{ fontFamily:'Manrope_400Regular', fontSize:14, color:C.outline, marginTop:8, marginBottom:8 },

  // Form header
  formHeader:{ flexDirection:'row', alignItems:'center', gap:12,
    paddingHorizontal:20, paddingBottom:16 },
  formHeaderTitle:{ flex:1, fontFamily:'PlusJakartaSans_700Bold', fontSize:18, color:'#fff' },
  aiChip:{ flexDirection:'row', alignItems:'center', gap:4,
    backgroundColor:'rgba(255,255,255,0.15)', borderRadius:99, paddingHorizontal:10, paddingVertical:4 },
  aiChipText:{ fontFamily:'Manrope_700Bold', fontSize:11, color:C.secondaryContainer },

  // Form content
  scroll:{ padding:20, paddingBottom:48 },
  tipBox:{ flexDirection:'row', alignItems:'center', gap:8,
    backgroundColor:C.primaryFixed, borderRadius:12, padding:12, marginBottom:20 },
  tipText:{ flex:1, fontFamily:'Manrope_500Medium', fontSize:13, color:C.onPrimaryFixed },
  sectionRow:{ flexDirection:'row', alignItems:'center', gap:6, marginTop:8, marginBottom:10 },
  sectionTitle:{ fontFamily:'Manrope_700Bold', fontSize:12, color:C.primaryContainer,
    letterSpacing:0.8, textTransform:'uppercase' },
  fieldLabel:{ fontFamily:'Manrope_700Bold', fontSize:11, color:C.outline,
    letterSpacing:0.8, textTransform:'uppercase', marginBottom:5 },
  input:{ backgroundColor:C.surfaceContainerLowest, borderRadius:12, height:50,
    paddingHorizontal:16, fontFamily:'Manrope_500Medium', fontSize:15, color:C.onSurface,
    marginBottom:14, borderWidth:1, borderColor:C.surfaceContainerHigh },

  // Category chips
  catChip:{ flexDirection:'row', alignItems:'center', gap:6, backgroundColor:C.surfaceContainerLow,
    borderRadius:99, paddingHorizontal:14, paddingVertical:8, marginRight:8 },
  catChipActive:{ backgroundColor:C.primaryContainer },
  catChipText:{ fontFamily:'Manrope_600SemiBold', fontSize:13, color:C.outline },

  // Articles
  articleCard:{ backgroundColor:C.surfaceContainerLowest, borderRadius:14, padding:14,
    marginBottom:12, borderWidth:1, borderColor:C.surfaceContainerHigh },
  miniLabel:{ fontFamily:'Manrope_700Bold', fontSize:10, color:C.outline,
    letterSpacing:0.5, marginBottom:4 },
  miniInput:{ backgroundColor:C.surfaceContainer, borderRadius:8, height:40,
    paddingHorizontal:10, fontFamily:'Manrope_500Medium', fontSize:13, color:C.onSurface,
    borderWidth:1, borderColor:C.surfaceContainerHigh },

  // Totaux card
  totauxCard:{ backgroundColor:C.surfaceContainerLowest, borderRadius:16,
    padding:16, marginBottom:20, borderWidth:1, borderColor:C.surfaceContainerHigh },
  roRow:{ flexDirection:'row', justifyContent:'space-between', alignItems:'center',
    paddingVertical:8, borderBottomWidth:1, borderBottomColor:C.surfaceContainerHigh },
  roLabel:{ fontFamily:'Manrope_500Medium', fontSize:13, color:C.outline },
  roValue:{ fontFamily:'Manrope_600SemiBold', fontSize:13, color:C.onSurface },
  divider:{ height:1, backgroundColor:C.primaryFixed, marginVertical:12 },
  totalWrap:{ flexDirection:'row', alignItems:'center', backgroundColor:C.surfaceContainerLowest,
    borderRadius:12, borderWidth:2, borderColor:C.primary, overflow:'hidden', marginBottom:4 },
  totalInput:{ flex:1, height:56, paddingHorizontal:16,
    fontFamily:'PlusJakartaSans_800ExtraBold', fontSize:22, color:C.primary },
  totalDevise:{ backgroundColor:C.primaryFixed, paddingHorizontal:14, height:56, justifyContent:'center' },
  totalDeviseText:{ fontFamily:'Manrope_700Bold', fontSize:14, color:C.onPrimaryFixed },

  // Confirm
  confirmBtn:{ borderRadius:14, flexDirection:'row', alignItems:'center',
    justifyContent:'center', gap:10, paddingVertical:16 },
  confirmBtnText:{ fontFamily:'PlusJakartaSans_700Bold', fontSize:17, color:'#fff' },
  cancelLink:{ alignItems:'center', paddingVertical:16 },
  cancelText:{ fontFamily:'Manrope_600SemiBold', fontSize:14, color:C.outline },
});
