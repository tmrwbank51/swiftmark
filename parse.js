// A small, stateless CommonMark and GFM renderer.
const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const entities = s => s.replace(/&(#(?:x[\da-f]+|\d+)|[a-z][a-z\d]+);/gi,(m,x)=>{try{if(x[0]==='#'){let n=x[1].toLowerCase()==='x'?parseInt(x.slice(2),16):+x.slice(1);return String.fromCodePoint(n||0xfffd)}return ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:'\u00a0',copy:'©',reg:'®',mdash:'—',ndash:'–',hellip:'…'}[x]||m)}catch{return m}});
function inline(src){
 let out='', i=0;
 while(i<src.length){let s=src.slice(i),m;
  if((m=/^\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/.exec(s))){out+=esc(m[1]);i+=m[0].length;continue}
  if((m=/^\\\n/.exec(s))){out+='<br>\n';i+=m[0].length;continue}
  if((m=/^`+/.exec(s))){let q=m[0],j=src.indexOf(q,i+q.length);if(j>=0){let t=src.slice(i+q.length,j).replace(/\n/g,' ');if(/^ .* $/.test(t)&&/[^ ]/.test(t))t=t.slice(1,-1);out+='<code>'+esc(t)+'</code>';i=j+q.length;continue}}
  if((m=/^!?\[([^\]]*)\]\((<[^>]*>|(?:\\.|[^\s)])+)(?:\s+"([^"]*)")?\)/.exec(s))){let image=m[0][0]==='!';let label=inline(m[1]),url=m[2].replace(/^<|>$/g,'').replace(/\\([()])/g,'$1').replace(/&/g,'&amp;');out+=image?'<img src="'+url+'" alt="'+esc(m[1])+'"'+(m[3]?' title="'+esc(m[3])+'"':'')+' />':'<a href="'+url+'"'+(m[3]?' title="'+esc(m[3])+'"':'')+'>'+label+'</a>';i+=m[0].length;continue}
  if((m=/^<((?:https?:\/\/|ftp:\/\/)[^ >]+)>/.exec(s))){out+='<a href="'+esc(m[1])+'">'+esc(m[1])+'</a>';i+=m[0].length;continue}
  if((m=/^<([\w.+-]+@[\w.-]+\.[A-Za-z]{2,})>/.exec(s))){out+='<a href="mailto:'+esc(m[1])+'">'+esc(m[1])+'</a>';i+=m[0].length;continue}
  if((m=/^<([A-Za-z][^<>]*)>/.exec(s))){out+=m[0];i+=m[0].length;continue}
  if((m=/^\n/.exec(s))){out+='\n';i++;continue}
  if((m=/^(\*\*|__|~~|\*|_)(?=\S)([\s\S]*?\S)\1/.exec(s))){let tag=m[1].length===2?(m[1]==='~~'?'del':'strong'):'em';out+='<'+tag+'>'+inline(m[2])+'</'+tag+'>';i+=m[0].length;continue}
  if((m=/^\[([^\]]+)\]\(([^ )]+)\)/.exec(s))){out+='<a href="'+esc(m[2])+'">'+inline(m[1])+'</a>';i+=m[0].length;continue}
  if((m=/^&(?:#\d+|#x[\da-f]+|[a-z][\da-z]+);/i.exec(s))){out+=entities(m[0]);i+=m[0].length;continue}
  if((m=/^https?:\/\/[^\s<>]+/.exec(s))){let u=m[0],p='';while(/[.,!?;:]$/.test(u)){p=u.slice(-1)+p;u=u.slice(0,-1)}out+='<a href="'+esc(u)+'">'+esc(u)+'</a>'+p;i+=m[0].length;continue}
  out+=esc(src[i]);i++;
 }
 return out;
}
function parse(md){
 if(typeof md!=='string')throw new TypeError('markdown must be a string');
 md=md.replace(/\r\n?/g,'\n').replace(/\0/g,'�');
 const lines=md.split('\n'), out=[];let i=0;
 const blank=n=>n>=lines.length||/^\s*$/.test(lines[n]);
 const para=arr=>{let t=arr.join('\n').replace(/\n+$/,'');return '<p>'+inline(t)+'</p>\n'};
 while(i<lines.length){if(blank(i)){i++;continue}let l=lines[i],m;
  if((m=/^ {0,3}(#{1,6})(?:\s+|$)(.*)$/.exec(l))){let t=m[2].replace(/\s+#+\s*$/,'').replace(/\s+$/,'');out.push('<h'+m[1].length+'>'+inline(t)+'</h'+m[1].length+'>\n');i++;continue}
  if((m=/^ {0,3}(```+|~~~+)(.*)$/.exec(l))){let fence=m[1],lang=m[2].trim().split(/\s+/)[0]||'', body=[];i++;while(i<lines.length&&!new RegExp('^ {0,3}'+fence[0]+'{'+fence.length+',}\\s*$').test(lines[i]))body.push(lines[i++]);if(i<lines.length)i++;out.push('<pre><code'+(lang?' class="language-'+esc(lang)+'"':'')+'>'+esc(body.join('\n')+(body.length?'\n':''))+'</code></pre>\n');continue}
  if(/^ {0,3}(?:\*\s*){3,}$|^ {0,3}(?:-\s*){3,}$|^ {0,3}(?:_\s*){3,}$/.test(l)){out.push('<hr>\n');i++;continue}
  if(/^ {0,3}>/.test(l)){let a=[];while(i<lines.length&&/^ {0,3}>/.test(lines[i]))a.push(lines[i++].replace(/^ {0,3}> ?/,''));out.push('<blockquote>\n'+parse(a.join('\n'))+'</blockquote>\n');continue}
  if((m=/^ {0,3}([-+*]|\d+[.)])\s+(.*)$/.exec(l))){let ordered=/\d/.test(m[1]),start=ordered?parseInt(m[1]):1,tag=ordered?'ol':'ul',items=[];while(i<lines.length&&(m=/^ {0,3}([-+*]|\d+[.)])\s+(.*)$/.exec(lines[i]))&&(/\d/.test(m[1])===ordered)){let x=m[2];i++;while(i<lines.length&&/^ {2,}\S/.test(lines[i]))x+='\n'+lines[i++].replace(/^ {2,}/,'');items.push(x)}out.push('<'+tag+(ordered&&start!==1?' start="'+start+'"':'')+'>\n'+items.map(x=>'<li>'+inline(x)+'</li>\n').join('')+'</'+tag+'>\n');continue}
  if(/^ {4}/.test(l)){let a=[];while(i<lines.length&&(/^ {4}/.test(lines[i])||blank(i))){if(blank(i)){a.push('');i++}else a.push(lines[i++].slice(4))}out.push('<pre><code>'+esc(a.join('\n').replace(/\n+$/,''))+'\n</code></pre>\n');continue}
  if(/^(?: {0,3})(?:<!--|<script\b|<pre\b|<style\b|<div\b|<table\b)/i.test(l)){let a=[];while(i<lines.length&&!blank(i))a.push(lines[i++]);out.push(a.join('\n')+'\n');continue}
  let a=[l];i++;while(i<lines.length&&!blank(i)&&!/^ {0,3}(?:#{1,6}\s|>|```|~~~|[-+*]\s|\d+[.)]\s)/.test(lines[i])&&!/^ {0,3}(?:\*\s*){3,}$/.test(lines[i]))a.push(lines[i++]);
  if(i<lines.length&&/^ {0,3}(=+|-+)\s*$/.test(lines[i])){let lv=lines[i].trim()[0]==='='?1:2;out.push('<h'+lv+'>'+inline(a.join('\n').trim())+'</h'+lv+'>\n');i++;continue}
  if(a.length>1&&a[1].includes('|')&&/^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(a[1])){let heads=a[0].replace(/^\||\|$/g,'').split('|').map(x=>x.trim()), aligns=a[1].replace(/^\||\|$/g,'').split('|').map(x=>x.trim()), rows=[];i++;while(i<lines.length&&lines[i].includes('|'))rows.push(lines[i++].replace(/^\||\|$/g,'').split('|').map(x=>x.trim()));let fmt=(x,k)=>'<'+k+(aligns[x]&&aligns[x][0]===':'?' align="'+(aligns[x].endsWith(':')?'center':'left')+'"':aligns[x]&&aligns[x].endsWith(':')?' align="right"':'')+'>'+inline(x<arguments.length? '' : '')+'</'+k+'>';let cells=(row,k)=>row.map((v,j)=>'<'+k+(aligns[j]&&aligns[j][0]===':'?' align="'+(aligns[j].endsWith(':')?'center':'left')+'"':aligns[j]&&aligns[j].endsWith(':')?' align="right"':'')+'>'+inline(v)+'</'+k+'>').join('');out.push('<table>\n<thead>\n<tr>'+cells(heads,'th')+'</tr>\n</thead>\n<tbody>\n'+rows.map(r=>'<tr>'+cells(r,'td')+'</tr>\n').join('')+'</tbody>\n</table>\n');continue}
  out.push(para(a));
 }
 return out.join('');
}
export { parse };
