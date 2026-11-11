import React, { useRef, useState } from 'react';
import { BackHandler, Platform, SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
const ROOT = process.env.EXPO_PUBLIC_SITE_URL || 'https://perverseworld.com';
export default function App() {
  const [section,setSection] = useState('shop');
  const [canGoBack,setCanGoBack] = useState(false);
  const webRef = useRef(null);
  const pages = { shop: ROOT, admin: `${ROOT}/admin/` };
  React.useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack) { webRef.current?.goBack(); return true; }
      if (section === 'admin') { setSection('shop'); return true; }
      return false;
    });
    return () => sub.remove();
  },[section, canGoBack]);
  return <SafeAreaView style={styles.screen}>
    <StatusBar barStyle="light-content" />
    <View style={styles.top}><Text style={styles.wordmark}>PERVERSE <Text style={styles.accent}>WORLD</Text>_</Text></View>
    <WebView key={section} ref={webRef} source={{uri: pages[section]}} style={styles.web}
      onNavigationStateChange={s => setCanGoBack(s.canGoBack)}
      startInLoadingState={true} javaScriptEnabled domStorageEnabled sharedCookiesEnabled
      thirdPartyCookiesEnabled={Platform.OS==='android'}
      onShouldStartLoadWithRequest={r => /^https:\/\//i.test(r.url) || r.url==='about:blank'} />
    <View style={styles.tabs}>
      {['shop','admin'].map(tab => <TouchableOpacity accessibilityRole="tab" accessibilityState={{selected:section===tab}}
        key={tab} style={[styles.tab,section===tab&&styles.selected]} onPress={() => setSection(tab)}><Text style={[styles.tabText,section===tab&&styles.active]}>{tab==='shop'?'SHOP':'ADMIN'}</Text></TouchableOpacity>)}
    </View>
  </SafeAreaView>;
}
const styles=StyleSheet.create({screen:{flex:1,backgroundColor:'#111210'},top:{height:48,justifyContent:'center',alignItems:'center',borderBottomWidth:1,borderColor:'#34362f'},wordmark:{color:'#f2eee3',fontSize:19,fontWeight:'900',letterSpacing:1.5},accent:{color:'#f04b2c'},web:{flex:1,backgroundColor:'#111210'},tabs:{height:56,flexDirection:'row',borderTopWidth:1,borderColor:'#34362f'},tab:{flex:1,alignItems:'center',justifyContent:'center'},selected:{borderTopWidth:2,borderColor:'#f04b2c'},tabText:{color:'#aaa',fontWeight:'800',letterSpacing:2},active:{color:'#f04b2c'}});