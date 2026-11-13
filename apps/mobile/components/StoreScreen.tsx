import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ActivityIndicator,Alert,BackHandler,Linking,Platform,Pressable,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {WebView} from 'react-native-webview';
import * as WebBrowser from 'expo-web-browser';

import {useRouter} from 'expo-router';
import {ROOT} from '../lib/site';
const pages={home:'/',shop:'/shop',contact:'/contact'} as const;
type Section=keyof typeof pages;
async function openExternal(url:string){try{if(url.startsWith('https://'))await WebBrowser.openBrowserAsync(url,{toolbarColor:'#111210',controlsColor:'#f04b2c'});else if(/^(mailto|tel):/.test(url))await Linking.openURL(url);}catch{Alert.alert('Could not open the link','Please try again.');}}

export function StoreScreen(){
 const router=useRouter(),browser=useRef<WebView<object>>(null),[uri,setUri]=useState(ROOT+'/'),[section,setSection]=useState<Section>('home'),[canGoBack,setCanGoBack]=useState(false),[error,setError]=useState(false);
 const source=useMemo(()=>({uri}),[uri]);
 useEffect(()=>{const listener=BackHandler.addEventListener('hardwareBackPress',()=>{if(canGoBack){browser.current?.goBack();return true;}return false;});return ()=>listener.remove();},[canGoBack]);
 const navigate=useCallback((next:Section)=>{setError(false);setSection(next);const target=ROOT+pages[next];if(target===uri)browser.current?.injectJavaScript('window.location.assign('+JSON.stringify(target)+');true;');else setUri(target);},[uri]);
 if(Platform.OS==='web')return <SafeAreaView style={styles.screen}><View style={styles.webFallback}><Text style={styles.wordmark}>PERVERSE <Text style={styles.accent}>WORLD</Text></Text><Text style={styles.copy}>Independent streetwear. Original artwork.</Text><Pressable accessibilityRole="link" onPress={()=>void Linking.openURL(ROOT)} style={styles.retry}><Text style={styles.retryText}>OPEN PERVERSE WORLD</Text></Pressable></View></SafeAreaView>;
 return <SafeAreaView style={styles.screen} edges={['top','bottom']}>
  <View style={styles.top}><Text style={styles.wordmark}>PERVERSE <Text style={styles.accent}>WORLD</Text></Text></View>
  <View style={styles.web}>
   <WebView<object> ref={browser} source={source} style={styles.web} javaScriptEnabled domStorageEnabled sharedCookiesEnabled startInLoadingState setSupportMultipleWindows={false} allowsBackForwardNavigationGestures
    originWhitelist={['https://*',...(__DEV__?['http://localhost:*','http://127.0.0.1:*']:[]),'mailto:*','tel:*']}
    onNavigationStateChange={state=>{setCanGoBack(state.canGoBack);try{const path=new URL(state.url).pathname;setSection(path.startsWith('/shop')?'shop':path==='/contact'?'contact':'home');}catch{}}}
    onShouldStartLoadWithRequest={request=>{
     if(request.url==='about:blank')return true;
     try{const url=new URL(request.url);if(request.isTopFrame===false)return url.protocol==='https:'&&(url.hostname===new URL(ROOT).hostname||url.hostname==='challenges.cloudflare.com');
      if(url.origin===ROOT&&!url.pathname.startsWith('/admin')&&!url.pathname.startsWith('/cdn-cgi/access/'))return true;
      if(url.protocol==='https:'||['mailto:','tel:'].includes(url.protocol))void openExternal(request.url);
     }catch{}return false;
    }}
    onLoadStart={()=>setError(false)} onError={()=>setError(true)} onHttpError={event=>{if(event.nativeEvent.statusCode>=500)setError(true);}}
    renderLoading={()=><View style={styles.loading}><ActivityIndicator color="#f04b2c" accessibilityLabel="Loading Perverse World"/></View>}/>
   {error&&<View style={styles.failure}><Text style={styles.wordmark}>A MOMENT OUTSIDE THE WORLD.</Text><Text style={styles.copy}>Check your connection and try again. Your bag stays in this browser.</Text><Pressable accessibilityRole="button" style={styles.retry} onPress={()=>{setError(false);browser.current?.reload();}}><Text style={styles.retryText}>TRY AGAIN</Text></Pressable></View>}
  </View>
  <View style={styles.tabs} accessibilityRole="tablist">{(Object.keys(pages) as Section[]).map(tab=><Pressable key={tab} accessibilityRole="tab" accessibilityState={{selected:section===tab}} onPress={()=>navigate(tab)} style={[styles.tab,section===tab&&styles.selected]}><Text style={[styles.tabText,section===tab&&styles.active]}>{tab.toUpperCase()}</Text></Pressable>)}<Pressable accessibilityRole="button" accessibilityLabel="Open admin" onPress={()=>router.push('/admin')} style={styles.tab}><Text style={styles.tabText}>ADMIN</Text></Pressable></View>
 </SafeAreaView>;
}
const styles=StyleSheet.create({screen:{flex:1,backgroundColor:'#111210'},top:{height:48,justifyContent:'center',alignItems:'center',borderBottomWidth:1,borderColor:'#34362f'},wordmark:{color:'#f2eee3',fontSize:19,fontWeight:'900',letterSpacing:1.5,textAlign:'center'},accent:{color:'#f04b2c'},web:{flex:1,backgroundColor:'#111210'},tabs:{minHeight:56,flexDirection:'row',borderTopWidth:1,borderColor:'#34362f'},tab:{flex:1,alignItems:'center',justifyContent:'center',minHeight:52},selected:{borderTopWidth:2,borderColor:'#f04b2c'},tabText:{color:'#aaa',fontSize:11,fontWeight:'800',letterSpacing:1},active:{color:'#f04b2c'},loading:{...StyleSheet.absoluteFill,alignItems:'center',justifyContent:'center',backgroundColor:'#111210'},failure:{...StyleSheet.absoluteFill,backgroundColor:'#111210',alignItems:'center',justifyContent:'center',padding:28,gap:22},copy:{color:'#c6c5ba',textAlign:'center',lineHeight:24},retry:{backgroundColor:'#f04b2c',padding:16},retryText:{color:'#111210',fontWeight:'800'},webFallback:{flex:1,justifyContent:'center',alignItems:'center',padding:28,gap:24}});
