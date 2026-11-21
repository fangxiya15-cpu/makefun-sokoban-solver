import f from'node:fs'
let{MAKEFUN_INPUT_DIR:I='/input',MAKEFUN_OUTPUT_DIR:O='/output'}=process.env,D,Z=n=>new Uint8Array(n),
F=(A,S,a,m={[a]:''},q=[a])=>{for(let x of q)for(let k=0;k<4;k++){let y=x+D[k];if(!A[y]&&!S.includes(y)&&!(y in m))m[y]=m[x]+'udlr'[k],q.push(y)}return m},
S=(A,B,G,p,R)=>{B.sort()
let N=[[B,p,'']],seen={[p+'|'+B]:1}
for(let[bs,pl,mv]of N){
if(bs.every(b=>G.includes(b)))return[mv,pl]
let rc=F(A,bs,pl)
for(let b of bs)for(let k=0;k<4;k++){let t=b+D[k],r=rc[b-D[k]]
if(r==null||bs.includes(t)||!(t in R)||(!G.includes(t)&&(A[t-D[1]]||A[t+D[1]])&&(A[t-1]||A[t+1])))continue
let nb=bs.map(x=>x==b?t:x).sort(),ky=b+'|'+nb
if(!seen[ky]){seen[ky]=1;N.push([nb,b,mv+r+'UDLR'[k]])}}}
return null}
for(let id of f.readdirSync(I)){
let T=''+f.readFileSync(I+'/'+id+'/level.txt'),w=T.indexOf('\n')+1,A=Z(T.length),G=[],B=[],p=-1,ans='',used=Z(A.length)
D=[-w,w,-1,1];
[...T].forEach((c,i)=>{let e='$*.+@'.indexOf(c);if(e<0)A[i]=c!=' ';else e<2&&B.push(i),e>0&&e<4&&G.push(i),e>2&&(p=i)})
let W=A.slice();for(let i=p-p%w;i<p-p%w+w;)A[i++]=1
for(let x of B)W[x]=1
for(let b of B)if(!used[b]){
let cs=F(A,[],b),rb=B.filter(x=>x in cs),rg=G.filter(x=>x in cs)
for(let x of rb)used[x]=1,W[x]=0
let mv=S(W,rb,rg,p,cs)
if(!mv){ans='';break}
ans+=mv[0];p=mv[1]
for(let x of rg)W[x]=1}
f.mkdirSync(O+'/'+id,{recursive:!0});f.writeFileSync(O+'/'+id+'/solution.txt',ans)}
