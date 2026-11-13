import {useRef,useState} from 'react';
import {ActivityIndicator,Alert,Linking,Pressable,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useRouter} from 'expo-router';
import {WebView} from 'react-native-webview';
import {ROOT} from '../lib/site';

// Native bottom navigation for the admin; each tab clicks the matching button in the web admin.
const tabs=[{key:'overview',label:'HOME'},{key:'products',label:'INVENTORY'},{key:'mailbox',label:'MAILBOX'},{key:'submissions',label:'REVIEW'},{key:'more',label:'MORE'}] as const;
type Tab=typeof tabs[number]['key'];
const select=(key:Tab)=>key==='more'
 ?"document.getElementById('adminMenu')?.click();true;"
 :"document.querySelector('#adminDrawer [data-page="+JSON.stringify(key)+"]')?.click();true;";
// Cloudflare Access sign-in lives on the team domain; everything else stays on the store origin.
const allowed=(url:URL)=>url.protocol==='https:'&&(url.origin===ROOT&&(url.pathname.startsWith('/admin')||url.pathname.startsWith('/api/admin')||url.pathname.startsWith('/cdn-cgi/access/')||url.pathname.startsWith('/assets/')||url.pathname.startsWith('/media/'))||url.hostname.endsWith('.cloudflareaccess.com'));

export function AdminScreen(){
 const router=useRouter(),browser=useRef<WebView<object>>(null),[tab,setTab]=useState<Tab>('overview'),[ready,setReady]=useState(false),[error,setError]=useState(false);
 const choose=(key:Tab)=>{if(!ready)return;if(key!=='more')setTab(key);browser.current?.injectJavaScript(select(key));};
 return <SafeAreaView style={styles.screen} edges={['top','bottom']}>
  <View style={styles.top}><Pressable accessibilityRole="button" accessibilityLabel="Back to store" onPress={()=>router.back()} style={styles.back}><Text style={styles.backText}>‹ STORE</Text></Pressable><Text style={styles.wordmark}>ADMIN</Text><View style={styles.back}/></View>
  <View style={styles.web}>
   <WebView<object> ref={browser} source={{uri:ROOT+'/admin/'}} style={styles.web} javaScriptEnabled domStorageEnabled sharedCookiesEnabled startInLoadingState setSupportMultipleWindows={false}
    originWhitelist={['https://*']}
    onShouldStartLoadWithRequest={request=>{if(request.url==='about:blank')return true;try{if(allowed(new URL(request.url)))return true;if(/^(https|mailto|tel):/.test(request.url))void Linking.openURL(request.url).catch(()=>Alert.alert('Could not open the link'));}catch{}return false;}}
    onLoadStart={()=>setError(false)} onLoadEnd={()=>setReady(true)} onError={()=>setError(true)} onHttpError={event=>{if(event.nativeEvent.statusCode>=500)setError(true);}}
    renderLoading={()=><View style={styles.loading}><ActivityIndicator color="#f04b2c" accessibilityLabel="Loading admin"/></View>}/>
   {error&&<View style={styles.loading}><Text style={styles.copy}>Admin could not load. Check your connection and try again.</Text><Pressable accessibilityRole="button" style={styles.retry} onPress={()=>{setError(false);browser.current?.reload();}}><Text style={styles.retryText}>TRY AGAIN</Text></Pressable></View>}
  </View>
  <View style={styles.tabs} accessibilityRole="tablist">{tabs.map(t=><Pressable key={t.key} accessibilityRole="tab" accessibilityState={{selected:tab===t.key}} onPress={()=>choose(t.key)} style={[styles.tab,tab===t.key&&styles.selected]}><Text style={[styles.tabText,tab===t.key&&styles.active]}>{t.label}</Text></Pressable>)}</View>
 </SafeAreaView>;
}
const styles=StyleSheet.create({screen:{flex:1,backgroundColor:'#111210'},top:{height:48,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:8,borderBottomWidth:1,borderColor:'#34362f'},back:{width:84,minHeight:44,justifyContent:'center'},backText:{color:'#aaa',fontSize:12,fontWeight:'800',letterSpacing:1},wordmark:{color:'#f2eee3',fontSize:17,fontWeight:'900',letterSpacing:2},web:{flex:1,backgroundColor:'#111210'},tabs:{minHeight:56,flexDirection:'row',borderTopWidth:1,borderColor:'#34362f'},tab:{flex:1,alignItems:'center',justifyContent:'center',minHeight:52},selected:{borderTopWidth:2,borderColor:'#f04b2c'},tabText:{color:'#aaa',fontSize:10,fontWeight:'800',letterSpacing:.8},active:{color:'#f04b2c'},loading:{...StyleSheet.absoluteFill,alignItems:'center',justifyContent:'center',backgroundColor:'#111210',padding:28,gap:22},copy:{color:'#c6c5ba',textAlign:'center',lineHeight:24},retry:{backgroundColor:'#f04b2c',padding:16},retryText:{color:'#111210',fontWeight:'800'}});
