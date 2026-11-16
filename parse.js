// Stateless CommonMark and GFM renderer. Blocks are recognized from lines;
// inline syntax is handled in a separate pass after references are collected.
const ENTITIES = {
  amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:'\u00a0',copy:'©',reg:'®',trade:'™',
  mdash:'—',ndash:'–',hellip:'…',lsquo:'‘',rsquo:'’',ldquo:'“',rdquo:'”',
  bull:'•',middot:'·',times:'×',divide:'÷',euro:'€',pound:'£',yen:'¥',cent:'¢',
  laquo:'«',raquo:'»',para:'¶',sect:'§',deg:'°',plusmn:'±',ne:'≠',le:'≤',ge:'≥',
  rarr:'→',larr:'←',harr:'↔',there4:'∴',infin:'∞',alpha:'α',beta:'β',pi:'π',
  nbsp:'\u00a0',ensp:'\u2002',emsp:'\u2003',thinsp:'\u2009',ndash:'–',mdash:'—'
};
const ESCAPABLE = /^[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]$/;
const textEscape = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const attrEscape = s => textEscape(s).replace(/"/g,'&quot;');
function decodeEntity(s) {
  const m = /^&(#(?:[xX][\da-fA-F]+|\d+)|[A-Za-z][A-Za-z0-9]+);/.exec(s);
  if (!m) return null;
  const name = m[1];
  if (name[0] !== '#') return Object.prototype.hasOwnProperty.call(ENTITIES,name) ? ENTITIES[name] : null;
  let n = name[1].toLowerCase()==='x' ? parseInt(name.slice(2),16) : Number(name.slice(1));
  if (n > 0x10ffff) return null;
  if (!n || (n >= 0xd800 && n <= 0xdfff)) n=0xfffd;
  const replacements = {128:8364,130:8218,131:402,132:8222,133:8230,134:8224,135:8225,136:710,137:8240,138:352,139:8249,140:338,142:381,145:8216,146:8217,147:8220,148:8221,149:8226,150:8211,151:8212,152:732,153:8482,154:353,155:8250,156:339,158:382,159:376};
  if (replacements[n]) n=replacements[n];
  return String.fromCodePoint(n);
}
const unescapePunct = s => s.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g,'$1');
const normalizeLabel = s => s.replace(/&(?:#(?:[xX][\da-fA-F]+|\d+)|[A-Za-z][A-Za-z0-9]+);/g,x=>decodeEntity(x)??x).trim().replace(/[\t\n\r ]+/g,' ').toLowerCase().replace(/ß/g,'ss').replace(/ς/g,'σ');
function tightBlocks(html){let out='',pos=0,depth=0;const re=/<\/?(?:ul|ol|blockquote|pre|table|thead|tbody|tr|td|th|div)\b[^>]*>|<p>|<\/p>\n/gi;let m;while((m=re.exec(html))){out+=html.slice(pos,m.index);const t=m[0];if(t==='<p>'&&depth===0){}else if(t==='</p>\n'&&depth===0){}else if(/^<(?:ul|ol|blockquote|pre|table|thead|tbody|tr|td|th|div)\b/i.test(t)){depth++;out+=t;}else if(/^<\//.test(t)){depth=Math.max(0,depth-1);out+=t;}else out+=t;pos=re.lastIndex;}return out+html.slice(pos);}

function inline(source, refs, depth=0) {
  if (depth > 12) return textEscape(source);
  let out='', i=0, plain='', protectedValues=[];
  const protect=value=>'\uE000'+(protectedValues.push(value)-1)+'\uE001';
  const flush=()=>{ if(plain){out+=textEscape(plain);plain='';} };
  while(i<source.length) {
    const ch=source[i];
    if (ch==='\\' && i+1<source.length) {
      if(source[i+1]==='\n'){flush();out+='<br>';i+=2;while(source[i]===' ')i++;continue;}
      if(ESCAPABLE.test(source[i+1])){flush();out+=protect(textEscape(source[i+1]));i+=2;continue;}
    }
    if(ch==='`') {
      let end=i+1;while(source[end]==='`')end++;const run=source.slice(i,end);let at=end,close=-1;
      while((at=source.indexOf('`',at))>=0){let z=at+1;while(source[z]==='`')z++;if(source.slice(at,z)===run){close=at;break;}at=z;}
      if(close>=0){flush();let value=source.slice(end,close).replace(/\n/g,' ');if(/^ .* $/.test(value)&&/[^ ]/.test(value))value=value.slice(1,-1);out+=protect('<code>'+textEscape(value)+'</code>');i=close+run.length;continue;}plain+=run;i=end;continue;
    }
    if(ch==='&') {const em=/^&(#(?:[xX][\da-fA-F]+|\d+)|[A-Za-z][A-Za-z0-9]*);/.exec(source.slice(i));if(em){flush();if(em[1].startsWith('#')){const decoded=decodeEntity(em[0]);out+=protect(decoded===null?'&amp;'+em[1]+';':textEscape(decoded));}else out+=protect(em[0]);i+=em[0].length;continue;}}
    if(ch==='<' ) {
      const rest=source.slice(i);let m;
      if((m=/^<!-->|^<!--->/.exec(rest))){flush();out+=m[0];i+=m[0].length;continue;}
      if((m=/^<([A-Za-z][A-Za-z0-9+.-]{1,31}:[^ <>]*)>/.exec(rest))){flush();const display=m[1],u=display.replace(/\\/g,'%5C').replace(/`/g,'%60').replace(/\[/g,'%5B').replace(/\]/g,'%5D').replace(/ /g,'%20');out+='<a href="'+attrEscape(u)+'">'+textEscape(display)+'</a>';i+=m[0].length;continue;}
      if((m=/^<(https?:\/\/[^\s<>]+)(?=\s)/i.exec(rest))){flush();out+='&lt;<a href="'+attrEscape(m[1])+'">'+textEscape(m[1])+'</a>';i+=m[0].length;continue;}
      if((m=/^<([A-Za-z0-9.!#$%&'*+\/?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+)>/.exec(rest))){flush();out+='<a href="mailto:'+attrEscape(m[1])+'">'+textEscape(m[1])+'</a>';i+=m[0].length;continue;}
      if((m=/^<(?:[A-Za-z][A-Za-z0-9-]*(?:[\s]+[A-Za-z_:][A-Za-z0-9_.:-]*(?:[\s]*=[\s]*(?:[^\s"'=<>`]+|'[^']*'|"[^"]*"))?)*[\s]*\/?>|\/[A-Za-z][A-Za-z0-9-]*[\s]*>)|^<!--(?:[\s\S]*?-->|$)|^<\?[\s\S]*?\?>|^<![A-Z][^>]*>|^<!\[CDATA\[[\s\S]*?\]\]>/.exec(rest))){flush();out+=m[0];i+=m[0].length;continue;}
    }
    if(ch==='[' || (ch==='!'&&source[i+1]==='[')) {
      const image=ch==='!', open=i+(image?1:0);let j=open+1, nest=0;
      for(;j<source.length;j++){if(source[j]==='\\'){j++;continue;}if(source[j]==='`'){let z=j+1;while(source[z]==='`')z++;const run=source.slice(j,z);let at=z,found=-1;while((at=source.indexOf('`',at))>=0){let end=at+1;while(source[end]==='`')end++;if(source.slice(at,end)===run){found=at;break;}at=end;}if(found>=0){j=found+run.length-1;continue;}}if(source[j]==='[')nest++;else if(source[j]===']'){if(!nest)break;nest--;}}
      if(j<source.length){const label=source.slice(open+1,j), after=j+1;let url=null,title=null,consumed=after;
        if(source[after]==='('){let p=after+1;while(/[ \t\n]/.test(source[p]||'')&&p<source.length)p++;let dest='';
          if(source[p]==='<'){p++;while(p<source.length&&source[p]!=='>'){if(source[p]==='\\'&&p+1<source.length){dest+=source[p]+source[p+1];p+=2;}else if(source[p]==='\n')break;else dest+=source[p++];}if(source[p]==='>')p++;else dest=null;}
          else {let level=0;while(p<source.length&&!/[ \t\n]/.test(source[p])){if(source[p]==='\\'&&p+1<source.length){dest+=source[p]+source[p+1];p+=2;continue;}if(source[p]==='(')level++;if(source[p]===')'){if(!level)break;level--;}dest+=source[p++];}if(level)dest=null;}
          while(/[ \t\n]/.test(source[p]||'')&&p<source.length)p++;
          if(dest!==null&&/["'(]/.test(source[p]||'')){const opener=source[p++],closer=opener==='('?')':opener;let t='';while(p<source.length&&source[p]!==closer){if(source[p]==='\\'&&p+1<source.length){t+=source[p]+source[p+1];p+=2;}else t+=source[p++];}if(source[p]===closer){p++;title=t;while(/[ \t\n]/.test(source[p]||'')&&p<source.length)p++;}else dest=null;}
          if(dest!==null&&source[p]===')'){url=unescapePunct(dest);consumed=p+1;}
        }
        if(url===null){let k=after, refLabel=label, explicit=false;if(source[k]==='['){let q=source.indexOf(']',k+1);if(q>=0){explicit=true;if(q===k+1)refLabel=label;else refLabel=source.slice(k+1,q);k=q+1;}}
          const entry=refs.get(normalizeLabel(refLabel))||(!explicit&&refs.get(normalizeLabel(label)));if(entry){url=entry.url;title=entry.title;consumed=k;}
        }
        if(url!==null&&!( !image&&/(?<!!)(?<!\\)\[[^\]]*\]\(/.test(label))&&!( !image&&/(?<!!)(?<!\\)\[[^\]]+\](?:\([^)]*\)|\[[^\]]*\])/.test(label))&&!/<[A-Za-z][^>]*$/.test(label)){flush();const encoded=url.replace(/\\/g,'%5C').replace(/ /g,'%20').replace(/"/g,'%22').replace(/`/g,'%60').replace(/</g,'%3C').replace(/>/g,'%3E').replace(/[^\x00-\x7F]/g,c=>encodeURIComponent(c));const clean=attrEscape(encoded).replace(/&amp;(#[xX][\da-fA-F]+|#\d+|[A-Za-z][A-Za-z0-9]*);/g,'&$1;');const titleValue=title===null?'':unescapePunct(title).replace(/&(?:#(?:[xX][\da-fA-F]+|\d+)|[A-Za-z][A-Za-z0-9]*);/g,e=>decodeEntity(e)??e);const ti=title===null?'':' title="'+attrEscape(titleValue).replace(/&amp;(#[xX][\da-fA-F]+|#\d+|[A-Za-z][A-Za-z0-9]*);/g,'&$1;')+'"';
          if(image){const alt=inline(label,refs,depth+1).replace(/<img\b[^>]*\balt="([^"]*)"[^>]*>/g,'$1').replace(/<[^>]*>/g,'');out+='<img src="'+clean+'" alt="'+alt+'"'+ti+'>';}
          else out+='<a href="'+clean+'"'+ti+'>'+inline(label,refs,depth+1)+'</a>';
          i=consumed;continue;
        }
      }
    }
    if(depth===0&&(ch==='h'||ch==='w')&&/^(?:https?:\/\/|www\.)/i.test(source.slice(i))&& (i===0||/[\s([{<'"]/.test(source[i-1]))) {
      let j=i;while(j<source.length&&!/[\s<>]/.test(source[j]))j++;let u=source.slice(i,j),tail='';const entityTail=/&[A-Za-z]+;$/.exec(u);if(entityTail){tail=entityTail[0];u=u.slice(0,-entityTail[0].length);}while(/[.,!?;:*_~)]$/.test(u)){const c=u.at(-1);if(c===')'&&(u.match(/\(/g)||[]).length>=(u.match(/\)/g)||[]).length)break;tail=c+tail;u=u.slice(0,-1);}if(u.length>0){flush();const href=u.startsWith('www.')?'http://'+u:u;out+='<a href="'+attrEscape(href)+'">'+textEscape(u)+'</a>'+tail;i=j;continue;}
    }
    if(/[A-Za-z]/.test(ch)&&(i===0||/[\s([{<'"]/.test(source[i-1]))){const scheme=/^(?:https?:\/\/|ftp:\/\/|mailto:[^\s<>]+|xmpp:[^\s<>]+)/i.exec(source.slice(i));if(scheme){let u=scheme[0],tail='',badEnd=/[-_]$/.test(u);if(/^mailto:/i.test(u)&&u.endsWith('/')){u=u.slice(0,-1);tail='/';}if(/^xmpp:/i.test(u)){const slash=u.indexOf('/',5),second=slash<0?-1:u.indexOf('/',slash+1);if(second>=0){tail=u.slice(second)+tail;u=u.slice(0,second);}}while(/[.,!?;:*_~)-]$/.test(u)){const c=u.at(-1);if(c===')'&&(u.match(/\(/g)||[]).length>=(u.match(/\)/g)||[]).length)break;tail=c+tail;u=u.slice(0,-1);}if(!badEnd&&u.length>u.indexOf(':')+1){flush();out+='<a href="'+attrEscape(u)+'">'+textEscape(u)+'</a>'+tail;i+=scheme[0].length;continue;}}}
    if((ch==='.'||/[A-Za-z0-9]/.test(ch))&&(i===0||/[\s([{<'"]/.test(source[i-1]))){const mail=/^[A-Za-z0-9.!#$%&'*+\/?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+/.exec(source.slice(i));const following=mail&&source[i+mail[0].length];if(mail&&!/[-_]$/.test(mail[0])&&following!=='-'&&following!=='_'){flush();out+='<a href="mailto:'+attrEscape(mail[0])+'">'+textEscape(mail[0])+'</a>';i+=mail[0].length;continue;}}
    if(ch==='\n'){const trailing=/ *$/.exec(plain)[0].length;if(trailing>=2)plain=plain.replace(/ *$/,'');flush();out+=trailing>=2?'<br>':'\n';i++;if(trailing>=2)while(source[i]===' ')i++;continue;}
    plain+=ch;i++;
  }
  flush();
  let resolved=resolveDelimiters(out, refs, depth);
  return resolved.replace(/\uE000(\d+)\uE001/g,(_,n)=>protectedValues[Number(n)]);
}

// Pair delimiter runs after the other inline constructs have been protected.
function resolveDelimiters(html, refs, depth) {
  const chars=[];let i=0;
  while(i<html.length){
    const marker=html.slice(i).match(/^\uE000\d+\uE001/);
    if(marker){chars.push({v:marker[0],opaque:true});i+=marker[0].length;continue;}
    const tag=html.slice(i).match(/^<(?:a\b|img\b|code\b|\/a\b|\/code\b)[^>]*>/i);
    if(tag){chars.push({v:tag[0],opaque:true});i+=tag[0].length;continue;}
    const c=html[i];if((c==='*'||c==='_'||c==='~')&&html[i+1]===c){let j=i+1;while(html[j]===c)j++;const len=j-i;if(c!=='~'||len<3){chars.push({v:html.slice(i,j),delim:c,len,openTags:[],closeTags:[],closeOpeners:[]});i=j;continue;}}
    if(c==='*'||c==='_'||c==='~'){let j=i+1;while(html[j]===c)j++;const len=j-i;if(c==='~'&&len>=3)chars.push({v:html.slice(i,j),opaque:true});else chars.push({v:html.slice(i,j),delim:c,len,openTags:[],closeTags:[],closeOpeners:[]});i=j;continue;}
    chars.push({v:c});i++;
  }
  // Determine flanking from the encoded neighboring characters.
    const isSpace=c=>c===undefined||/\s/.test(c), isPunct=c=>c!==undefined&&/[\p{P}\p{S}]/u.test(c);
  for(let k=0;k<chars.length;k++){const x=chars[k];if(!x.delim)continue;const prev=chars[k-1]?.v?.at(-1),next=chars[k+1]?.v?.[0];const left=!isSpace(next)&&(!isPunct(next)||isSpace(prev)||isPunct(prev));const right=!isSpace(prev)&&(!isPunct(prev)||isSpace(next)||isPunct(next));x.open=x.delim==='_'?left&&(!right||isPunct(prev)):left;x.close=x.delim==='_'?right&&(!left||isPunct(next)):right;}
  for(let closer=0;closer<chars.length;closer++){const c=chars[closer];while(c.delim&&c.close&&c.len>0){let matched=false;for(let opener=closer-1;opener>=0;opener--){const o=chars[opener];if(!o.delim||o.delim!==c.delim||!o.open||o.len===0)continue;let anchorDepth=0,anchorValid=true;for(let n=opener+1;n<closer;n++){const v=chars[n].v;if(/^<a\b/i.test(v))anchorDepth++;else if(/^<\/a\b/i.test(v)){if(!anchorDepth){anchorValid=false;break;}anchorDepth--;}}if(!anchorValid||anchorDepth)continue;if(c.delim!=='~'&&o.delim==='_'&&opener>0&&/[\p{L}\p{N}]/u.test(chars[opener-1].v.at(-1)||''))continue;
      if(c.closeOpeners.some(p=>p<opener))continue;let crossed=false;for(let n=opener+1;n<closer;n++)if(chars[n].closeOpeners?.some(p=>p<opener)){crossed=true;break;}if(crossed)continue;
      let use=1;if(o.len>=2&&c.len>=2)use=2;
      if(c.delim!=='~'&&((o.close||c.open)&&((o.len+c.len)%3===0)&&o.len%3!==0&&c.len%3!==0))continue;
      const openTag=c.delim==='~'?'del':use===2?'strong':'em';o.openTags.unshift('<'+openTag+'>');c.closeTags.push('</'+openTag+'>');c.closeOpeners.push(opener);o.len-=use;c.len-=use;if(!c.len)c.close=false;if(!o.len)o.open=false;matched=true;break;
    }if(!matched)break;}}
  return chars.map(x=>x.delim?(x.closeTags.length?x.openTags.join('')+x.closeTags.join('')+x.delim.repeat(x.len):x.delim.repeat(x.len)+x.openTags.join('')):x.v).join('');
}

function parse(markdown) {
  if(typeof markdown!=='string') throw new TypeError('markdown must be a string');
  const source=markdown.replace(/\r\n?/g,'\n').replace(/\0/g,'�');
  const refs=new Map();
  const rawLines=source.split('\n');
  const fencedLines=new Set();let activeFence='',activeSize=0;for(let i=0;i<rawLines.length;i++){if(activeFence){fencedLines.add(i);const close=new RegExp('^ {0,3}'+activeFence+'{'+activeSize+',}[ \t]*$');if(close.test(rawLines[i]))activeFence='';continue;}const fm=/^ {0,3}(`{3,}|~{3,})/.exec(rawLines[i]);if(fm){activeFence=fm[1][0];activeSize=fm[1].length;fencedLines.add(i);}}
  for(let start=0;start<rawLines.length;start++){if(fencedLines.has(start))continue;const first=/^ {0,3}\[(.*)$/.exec(rawLines[start]);if(!first||/\]:/.test(first[1]))continue;let label=[first[1]],end=start+1,close=null;for(;end<rawLines.length&&!/^[ \t]*$/.test(rawLines[end]);end++){const m=/^ {0,3}(.*)\]:([ \t]*.*)$/.exec(rawLines[end]);if(m){close=m;label.push(m[1].replace(/^ {0,3}/,''));break;}label.push(rawLines[end].replace(/^ {0,3}/,''));}if(close&&label.length&&normalizeLabel(label.join(' '))){rawLines[start]='['+label.join(' ')+']:'+close[2];for(let n=start+1;n<=end;n++)rawLines[n]='';}}
  for(let i=0;i<rawLines.length;i++){if(fencedLines.has(i))continue;const q=/^ {0,3}((?:>[ \t]?)+)\[((?:\\.|[^\\\]])+)\]:[ \t]*(?:<([^>\n]*)>|(\S+))(?:[ \t]+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?[ \t]*$/.exec(rawLines[i]);if(q){const key=normalizeLabel(q[2]);if(!refs.has(key))refs.set(key,{url:unescapePunct(q[3]??q[4]??''),title:q[5]??q[6]??q[7]??null});rawLines[i]=q[1].replace(/[ \t]+$/,'');}}
  for(let start=0;start<rawLines.length;start++){if(fencedLines.has(start)||!/^ {0,3}\[$/.test(rawLines[start]))continue;const label=[];let end=start+1,found=false;for(;end<rawLines.length&&!/^[ \t]*$/.test(rawLines[end]);end++){const close=/^ {0,3}\]:[ \t]*(.*)$/.exec(rawLines[end]);if(close){found=true;break;}label.push(rawLines[end].replace(/^ {0,3}/,''));}if(found&&label.length){rawLines[start]='['+label.join('\n')+']:'+rawLines[end].replace(/^ {0,3}\]:/,'');for(let j=start+1;j<=end;j++)rawLines[j]='';}}
  // Definitions are global and can be used before their physical location.
  for(let i=0;i<rawLines.length;i++){const start=i;if(fencedLines.has(i))continue;const m=/^ {0,3}\[((?:\\.|[^\\\]])+)\]:[ \t]*(.*)$/.exec(rawLines[i]);if(!m||/(?<!\\)\[/.test(m[1])||!normalizeLabel(m[1]))continue;if(i>0&&!/^\s*$/.test(rawLines[i-1])&&!/^ {0,3}(?:#{1,6}(?:[ \t]|$)|>|`{3,}|~{3,}|[-+*][ \t]|\d{1,9}[.)][ \t]|(?:\*\s*){3,}|(?:-\s*){3,})/.test(rawLines[i-1]))continue;let rest=m[2],used=[];if(!rest.trim()&&i+1<rawLines.length&&!/^\s*$/.test(rawLines[i+1])){rest=rawLines[++i].trim();used.push(i);}let dest=/^(?:<([^>\n]*)>|(\S+))(?:[ \t]+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?[ \t]*$/.exec(rest),multiTitle=null;if(rest.startsWith('<')&&!/^<[^>\n]*>(?:[ \t]+(?:"[^"]*"|'[^']*'|\([^)]*\)))?[ \t]*$/.test(rest))dest=null;if(!dest){const t=/^(<[^>\n]*>|\S+)[ \t]+(["'(][\s\S]*)$/.exec(rest);if(t){let tail=t[2],mark=tail[0],close=mark==='('?')':mark;while(!tail.slice(1).includes(close)&&i+1<rawLines.length&&!/^\s*$/.test(rawLines[i+1])){tail+='\n'+rawLines[++i];used.push(i);}const closeAt=tail.lastIndexOf(close);if(closeAt>=0&&!tail.slice(closeAt+1).trim()){multiTitle=tail.slice(1,closeAt);dest=[rest,t[1].startsWith('<')?t[1].slice(1,-1):t[1],undefined];}}}if(!dest){i=start;continue;}let title=multiTitle??dest[3]??dest[4]??dest[5]??null;if(title===null&&i+1<rawLines.length&&/^\s*["'(]/.test(rawLines[i+1])){const t=/^\s*(?:"([^"]*)"|'([^']*)'|\(([^)]*)\))[ \t]*$/.exec(rawLines[i+1]);if(t){title=t[1]??t[2]??t[3];used.push(++i);}}const key=normalizeLabel(m[1]);if(!refs.has(key))refs.set(key,{url:unescapePunct(dest[1]??dest[2]??''),title});rawLines[start]='';for(const n of used)rawLines[n]='';}
  const lines=rawLines;
  const blank=s=>s===undefined||/^[ \t]*$/.test(s);
  const indent=s=>{let n=0;for(const c of s){if(c===' ')n++;else if(c==='\t')n+=4-(n%4);else break;}return n;};
  const detab=s=>{let col=0,o='';for(const c of s){if(c==='\t'){const n=4-col%4;o+=' '.repeat(n);col+=n;}else{o+=c;col++;}}return o;};
  for(let n=0;n<lines.length;n++) if(/^(?: {0,3}>| {0,3}(?:[*+-]|\d{1,9}[.)])[\t ])/.test(lines[n])) lines[n]=detab(lines[n]);
  const stripIndent=(s,n)=>{let i=0,c=0;while(i<s.length&&c<n){if(s[i]===' '){i++;c++;}else if(s[i]==='\t'){i++;const w=4-c%4;if(c+w>n)return ' '.repeat(c+w-n)+s.slice(i);c+=w;}else break;}return s.slice(i);};
  const atx=s=>/^ {0,3}(#{1,6})(?:[ \t]+|$)(.*)$/.exec(s);
  const fence=s=>/^ {0,3}(`{3,}|~{3,})(.*)$/.exec(s);
  const hr=s=>/^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(s);
  const setext=s=>/^ {0,3}(=+|-+)[ \t]*$/.exec(s);
  const listMark=s=>/^ {0,3}([*+-]|\d{1,9}[.)])([ \t]+|$)(.*)$/.exec(s);
  const quote=s=>/^ {0,3}>[ \t]?(.*)$/.exec(s);
  const htmlType=s=>{
    if(/^ {0,3}<!--/.test(s))return 1;if(/^ {0,3}<\?/.test(s))return 2;if(/^ {0,3}<![A-Z]/.test(s))return 3;if(/^ {0,3}<!\[CDATA\[/.test(s))return 4;
    const m=/^ {0,3}<(script|pre|style|textarea)(?:[ \t>]|$)/i.exec(s);if(m)return 5;
    if(/^ {0,3}<(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?:[\s/>]|$)/i.test(s))return 6;
    if(/^ {0,3}<(?:[A-Za-z][A-Za-z0-9-]*)(?:[ \t]+[A-Za-z_:][A-Za-z0-9_.:-]*(?:[ \t]*=[ \t]*(?:[^\s"'=<>`]+|'[^']*'|"[^"]*"))?)*[ \t]*\/?>[ \t]*$|^ {0,3}<\/[A-Za-z][A-Za-z0-9-]*[ \t]*>[ \t]*$|^ {0,3}(?:<\/(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)[ \t]*>[ \t]*)+$/i.test(s))return 7;
    return 0;
  };
  const isBlockStart=(s)=>{const lm=listMark(s),ht=htmlType(s),closingBlock=/^ {0,3}(?:<\/(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)\s*>[ \t]*)+$/i.test(s);return !!(atx(s)||fence(s)||hr(s)||quote(s)||(ht&&ht!==7)||closingBlock||(lm&&lm[3].trim()&&(!/\d/.test(lm[1])||Number.parseInt(lm[1],10)===1)));};
  const cells=s=>{let a=[],v='';for(let i=0;i<s.length;i++){const c=s[i];if(c==='\\'&&s[i+1]==='|'){v+='|';i++;continue;}if(c==='|'){a.push(v.trim());v='';}else v+=c;}a.push(v.trim());if(a[0]==='')a.shift();if(a.at(-1)==='')a.pop();return a;};
  const tableDelim=s=>{const a=cells(s);return a.length>0&&a.every(x=>/^:?-{1,}:?$/.test(x));};
  const renderInline=s=>inline(s,refs);
  function blocks(input, depth=0) {
    if(depth>16)return '<p>'+renderInline(input.join('\n'))+'</p>\n';
    let out='',i=0;
    while(i<input.length){let s=input[i];if(blank(s)){i++;continue;}
      let m=atx(s);
      if(m){let t=m[2].replace(/[ \t]+#+[ \t]*$/,'').replace(/[ \t]+$/,'');if(/^#+$/.test(t))t='';const n=m[1].length;out+='<h'+n+'>'+renderInline(t)+'</h'+n+'>\n';i++;continue;}
      m=fence(s);
      if(m&&!(m[1][0]==='`'&&m[2].includes('`'))){const marker=m[1][0],size=m[1].length,openingIndent=indent(s),info=m[2].trim();let lang=unescapePunct(info.split(/[ \t]+/)[0]||'');let body=[],closed=false;i++;while(i<input.length){const close=new RegExp('^ {0,3}'+(marker==='`'?'`':'~')+'{'+size+',}[ \t]*$');if(close.test(input[i])){i++;closed=true;if(body.at(-1)==='')body.pop();break;}body.push(stripIndent(input[i++],openingIndent));}if(!closed&&input.at(-1)===''&&body.at(-1)==='')body.pop();if(body.length===1&&body[0]===''&&i===input.length)body=[];const langAttr=attrEscape(lang).replace(/&amp;(#[xX][\da-fA-F]+|#\d+|[A-Za-z][A-Za-z0-9]*);/g,'&$1;');out+='<pre><code'+(lang?' class="language-'+langAttr+'"':'')+'>'+textEscape(body.join('\n')+(body.length?'\n':''))+'</code></pre>\n';continue;}
      if(hr(s)){out+='<hr>\n';i++;continue;}
      const ht=htmlType(s);
      if(ht){let body=[];const openingTag=/<([A-Za-z]+)/.exec(s)?.[1]||'script';const end=(line)=>ht===1?/-->/.test(line):ht===2?/\?>/.test(line):ht===3?/>/.test(line):ht===4?/\]\]>/.test(line):ht===5?new RegExp('</'+openingTag+'\\s*>','i').test(line):ht===6?blank(line):ht===7?blank(line):false;
        body.push(input[i++]);if(ht<=4||ht===5){if(!end(body[0]))while(i<input.length){const x=input[i++];body.push(x);if(end(x))break;}}else while(i<input.length&&!blank(input[i]))body.push(input[i++]);const followsBlock=ht===1&&blank(input[i])&&(listMark(input[i+1])||indent(input[i+1]||'')>=4),sourceEndsBlock=i>=input.length,htmlBlankBoundary=blank(input[i])&&input.slice(i).some(x=>!blank(x));out+=body.join('\n')+(sourceEndsBlock||followsBlock||htmlBlankBoundary&&ht!==1?'':'\n');continue;}
      const q=quote(s);
      if(q){let a=[],quoteFence=null;while(i<input.length){const x=quote(input[i]);if(x){const content=x[1],fm=fence(content);if(blank(content)&&content.length&&a.some(y=>!blank(y)))a.push('\uE010 '+content.trimEnd());else a.push(content);if(quoteFence){const close=new RegExp('^ {0,3}'+(quoteFence.marker==='`'?'`':'~')+'{'+quoteFence.size+',}[ \t]*$');if(close.test(content))quoteFence=null;}else if(fm&&!(fm[1][0]==='`'&&fm[2].includes('`')))quoteFence={marker:fm[1][0],size:fm[1].length};i++;continue;}if(quoteFence)break;const indentedList=/^ {4,}[-+*][ \t]+\S/.test(input[i]||'');if(!blank(input[i])&&(indent(input[i])<4||indentedList)&&a.length&&!blank(a.at(-1))&&!a.at(-1).startsWith('\uE010')&&!fence(a.at(-1))&& !isBlockStart(input[i])){let continuation=indentedList?stripIndent(input[i],4):input[i];if(indentedList)continuation='\uE010'+continuation;else if(setext(continuation))continuation='\uE010    '+continuation;a.push(continuation);i++;continue;}break;}out+='<blockquote>\n'+blocks(a,depth+1)+'</blockquote>\n';continue;}
      const lm=listMark(s);
      if(lm){const ordered=/\d/.test(lm[1]),bullet=lm[1].replace(/[0-9]/g,''),orderedType=ordered?lm[1].at(-1):'',start=ordered?Number.parseInt(lm[1],10):1,items=[];let loose=false;
        while(i<input.length){if(hr(input[i]))break;const mm=listMark(input[i]);if(!mm||(/\d/.test(mm[1])!==ordered)||(!ordered&&mm[1]!==bullet)||(ordered&&mm[1].at(-1)!==orderedType))break;
          const rawPadding=mm[2].length, effectivePadding=rawPadding>4?1:rawPadding, content=mm[3], item=[rawPadding>4?' '.repeat(rawPadding-1)+content:content], base=indent(input[i])+mm[1].length+Math.max(1,effectivePadding);let itemFence=fence(content);i++;
          while(i<input.length){if(itemFence){const line=input[i++],clean=stripIndent(detab(line),base);item.push(blank(line)?'':clean);if(new RegExp('^'+(itemFence[1][0]==='`'?'`':'~')+'{'+itemFence[1].length+',}[ \t]*$').test(clean))itemFence=null;continue;}if(hr(input[i])&&indent(input[i])<base)break;if(blank(input[i])){const blankAt=i;while(i<input.length&&blank(input[i]))i++;const blankCount=i-blankAt;if(i>=input.length){i=blankAt;break;}const next=listMark(input[i]);if(next&&(/\d/.test(next[1])===ordered)&&(ordered||next[1]===bullet)){loose=true;break;}if(indent(input[i])>=base&&item.some(x=>!blank(x))){const prev=item.filter(x=>!blank(x)).at(-1);if(!listMark(prev)||indent(input[i])<=base)loose=true;for(let z=0;z<blankCount;z++)item.push('');continue;}i=blankAt;break;}
            const next=listMark(input[i]);if(next&&indent(input[i])<base)break;
            if(indent(input[i])>=base){const line=stripIndent(detab(input[i++]),base);item.push(line);if(fence(line))itemFence=fence(line);continue;}
            if(isBlockStart(input[i]))break;
            const continuation=input[i++],trimmed=indent(continuation)?stripIndent(continuation,indent(continuation)):continuation;item.push(listMark(trimmed)?'\uE010'+trimmed:trimmed);
          }
          items.push(item);
        }
        const tag=ordered?'ol':'ul';out+='<'+tag+(ordered&&start!==1?' start="'+start+'"':'')+'>\n';
        for(const item of items){while(item.length&&blank(item.at(-1)))item.pop();const task=/^\[([ xX])\][ \t]+/.exec(item[0]||'');if(task)item[0]=item[0].slice(task[0].length);let body=blocks(item,depth+1);if(!loose){body=tightBlocks(body);if(!/<\/(?:ul|ol|blockquote|pre|table)>\n$/.test(body)&&!/<hr>\n$/.test(body)&&!/<\/h[1-6]>\n$/.test(body))body=body.replace(/\n$/,'');}if(task){const checked=task[1].toLowerCase()==='x'?' checked=""':'';const input='<input'+checked+' disabled="" type="checkbox"> ';body=body.startsWith('<p>')?'<p>'+input+body.slice(3):input+body;}out+='<li>'+body+'</li>\n';}
        out+='</'+tag+'>\n';continue;
      }
      if(indent(s)>=4){let code=[];while(i<input.length&&(indent(input[i])>=4||blank(input[i]))){code.push(stripIndent(input[i++],4));}while(code.length&&blank(code.at(-1)))code.pop();out+='<pre><code>'+textEscape(code.join('\n')+'\n')+'</code></pre>\n';continue;}
      // A reference definition is consumed as a block even if its target was forward collected.
      // Paragraphs gather lazy continuations until an interrupting block or a setext/table row.
      const para=[s];i++;while(i<input.length&&!blank(input[i])){if(setext(input[i]))break;if(isBlockStart(input[i]))break;if(para.length===1&&input[i].includes('|')&&tableDelim(input[i])&&cells(input[i]).length===cells(para[0]).length)break;para.push(input[i++]);}
      if(i<input.length&&(m=setext(input[i]))){const n=m[1][0]==='='?1:2;para[0]=para[0].replace(/^ {1,3}/,'');const t=para.join('\n').replace(/[ \t]+$/,'');out+='<h'+n+'>'+renderInline(t)+'</h'+n+'>\n';i++;continue;}
      if(para.length===1&&i<input.length&&tableDelim(input[i])&&cells(input[i]).length===cells(para[0]).length){const heads=cells(para[0]), align=cells(input[i]).map(c=>c.startsWith(':')?(c.endsWith(':')?'center':'left'):(c.endsWith(':')?'right':''));i++;let rows=[];while(i<input.length&&!blank(input[i])&&!isBlockStart(input[i]))rows.push(cells(input[i++]));const cell=(v,k,j)=>'<'+k+(align[j]?' align="'+align[j]+'"':'')+'>'+renderInline(v||'')+'</'+k+'>';const cellsRows=(vals,k)=>Array.from({length:heads.length},(_,j)=>cell(vals[j]||'',k,j));out+='<table>\n<thead>\n<tr>\n'+cellsRows(heads,'th').join('\n')+'\n</tr>\n</thead>\n';if(rows.length){out+='<tbody>';for(const r of rows)out+='<tr>\n'+cellsRows(r,'td').join('\n')+'\n</tr>\n';out+='</tbody>';}out+='</table>\n';continue;}
      out+='<p>'+renderInline(para.join('\n').replace(/ {2,}\n/g,'\u0001\n').replace(/\u0001\n/g,'  \n'))+'</p>\n';
    }
    return out;
  }
  // Expand tabs only for block layout decisions and content removed by indentation.
  return blocks(lines).replace(/\uE010/g,'').replace(/(<p>[^<]*<\/p>\n)([^<\n]+)(?=<\/li>)/g,'$1<p>$2</p>\n');
}

export { parse };
