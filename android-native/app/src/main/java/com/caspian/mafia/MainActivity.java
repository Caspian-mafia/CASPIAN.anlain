// Online-only Android shell: all gameplay and persistence are served by the central HTTPS backend.
package com.caspian.mafia;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
public final class MainActivity extends Activity {
 private WebView web; private String serverHost;
 @Override public void onCreate(Bundle state) {
  super.onCreate(state); requestWindowFeature(Window.FEATURE_NO_TITLE);
  getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN,WindowManager.LayoutParams.FLAG_FULLSCREEN);
  Uri server=Uri.parse(BuildConfig.CASPIAN_SERVER_URL); serverHost=server.getHost();
  web=new WebView(this); web.setBackgroundColor(0xFF10091E); web.setOverScrollMode(View.OVER_SCROLL_NEVER);
  WebSettings s=web.getSettings(); s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setDatabaseEnabled(true);
  s.setAllowFileAccess(false); s.setAllowContentAccess(false); s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
  s.setSupportZoom(false); s.setMediaPlaybackRequiresUserGesture(true);
  CookieManager c=CookieManager.getInstance(); c.setAcceptCookie(true); c.setAcceptThirdPartyCookies(web,false);
  web.setWebChromeClient(new WebChromeClient());
  web.setWebViewClient(new WebViewClient(){
   @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){
    Uri u=r.getUrl(); if("https".equalsIgnoreCase(u.getScheme())&&serverHost.equalsIgnoreCase(u.getHost())) return false;
    if("https".equalsIgnoreCase(u.getScheme())||"mailto".equalsIgnoreCase(u.getScheme())) try{startActivity(new Intent(Intent.ACTION_VIEW,u));}catch(Exception ignored){}
    return true;
   }
   @Override public void onReceivedError(WebView v,WebResourceRequest r,android.webkit.WebResourceError e){super.onReceivedError(v,r,e);if(r.isForMainFrame())showConnectionError();}
  });
  setContentView(web); if(state!=null)web.restoreState(state);else web.loadUrl(BuildConfig.CASPIAN_SERVER_URL);
 }
 private void showConnectionError(){
  String h="<!doctype html><html lang='fa' dir='rtl'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><body style='margin:0;background:#10091e;color:#f4e7ff;font:16px Tahoma;padding:32px;line-height:2;text-align:center'><h2 style='color:#f3c96d'>CASPIAN</h2><h3>اتصال به سرور برقرار نشد</h3><p>این نسخه فقط آنلاین است. اینترنت را بررسی کنید و دوباره تلاش کنید.</p><a href='/' style='display:inline-block;padding:14px 24px;border-radius:12px;background:#f3c96d;color:#24152f;font-weight:bold;text-decoration:none'>تلاش دوباره</a></body></html>";
  web.loadDataWithBaseURL(BuildConfig.CASPIAN_SERVER_URL,h,"text/html","UTF-8",null);
 }
 @Override protected void onSaveInstanceState(Bundle b){if(web!=null)web.saveState(b);super.onSaveInstanceState(b);}
 @Override public void onBackPressed(){if(web!=null&&web.canGoBack())web.goBack();else super.onBackPressed();}
 @Override protected void onDestroy(){if(web!=null){web.stopLoading();web.destroy();web=null;}super.onDestroy();}
}
