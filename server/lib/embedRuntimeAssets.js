export function buildEmbedRuntimeAssetInterceptor(encodedToken) {
  return `<script>
(function(){
  var token=${JSON.stringify(encodedToken)};
  var addToken=function(u){
    if(typeof u!=='string')return u;
    try{
      var url=new URL(u, window.location.origin);
      if(url.origin===window.location.origin && /^\\/embed\\/(?:fonts|assets)\\//.test(url.pathname) && !url.searchParams.has('_t')){
        url.searchParams.set('_t', token);
        return url.pathname + url.search + url.hash;
      }
    }catch(e){}
    return u;
  };
  var remapOne=function(u){
    if(typeof u!=='string')return u;
    var next=u
      .replace(/^(?:\\.?\\/)?(?=fonts\\/|assets\\/)/,'/embed/')
      .replace(/^\\/(?=fonts\\/|assets\\/)/,'/embed/');
    return addToken(next);
  };
  var remap=function(u){
    if(typeof u!=='string')return u;
    if(/url\\(/.test(u)){
      return u.replace(/url\\(\\s*(['"]?)([^'")]+)\\1\\s*\\)/g,function(match,quote,url){
        return 'url(' + quote + remapOne(url) + quote + ')';
      });
    }
    return remapOne(u);
  };
  var _f=window.fetch;
  window.fetch=function(u,o){return _f.call(this,typeof u==='string'?remap(u):u,o);};
  if(window.FontFace){var _FF=window.FontFace;window.FontFace=function(f,s,d){return new _FF(f,remap(s),d);};window.FontFace.prototype=_FF.prototype;}
})();
</script>`;
}
