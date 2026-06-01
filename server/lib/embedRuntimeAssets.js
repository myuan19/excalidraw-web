/** Remap runtime font/asset loads to /embed/* (hashed /embed/assets are public; API stays token-gated). */
export function buildEmbedRuntimeAssetInterceptor() {
  return `<script>
(function(){
  var remapOne=function(u){
    if(typeof u!=='string')return u;
    return u
      .replace(/^(?:\\.?\\/)?(?=fonts\\/|assets\\/)/,'/embed/')
      .replace(/^\\/(?=fonts\\/|assets\\/)/,'/embed/');
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