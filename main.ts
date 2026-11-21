import*as f from'node:fs'
let{MAKEFUN_INPUT_DIR:I='/input',MAKEFUN_OUTPUT_DIR:O='/output'}=process.env,D
let F=(A,S,a)=>{let m=new Map([[a,'']]),q=[a];for(let x of q)for(let d of D){let y=x+d;if(!A[y]&&!S.has(y)&&!m.has(y))m.set(y,m.get(x)+'udlr'[D.indexOf(d)]),q.push(y)}return m}
let L=(A,GS)=>{let v=new Uint8Array(A.length),q=[];for(let g of GS)v[g]=1,q.push(g);for(let x of q)for(let d of D){let y=x-d;if(!A[y]&&!A[y-d]&&!v[y])v[y]=1,q.push(y)}return v}
let S=(A,B,GS,p)=>{
B.sort()
let v=L(A,GS);if(B.some(b=>!v[b]))return null
let N=[[B,p,'']],seen=new Set([p+'|'+B])
for(let n of N){
let bs=n[0];if(bs.every(b=>GS.includes(b)))return[n[2],n[1]]
let rc=F(A,new Set(bs),n[1])
for(let b of bs)for(let d of D){let t=b+d
if(!rc.has(b-d)||bs.includes(t)||!v[t])continue
let nb=bs.map(x=>x==b?t:x).sort(),ky=b+'|'+nb
if(seen.has(ky))continue;seen.add(ky)
let mv=n[2]+rc.get(b-d)+'UDLR'[D.indexOf(d)]
N.push([nb,b,mv])}}
return null}
for(let id of f.readdirSync(I)){
let T=f.readFileSync(I+'/'+id+'/level.txt','utf8'),w=T.indexOf('\n')+1,A=new Uint8Array(T.length),GS=[],B=[],p=-1
D=[-w,w,-1,1]
for(let i=0;i<T.length;i++){let c=T[i],e='$*.+@'.indexOf(c);if(e<0){A[i]=c!=' ';continue}if(e<2)B.push(i);if(e>0&&e<4)GS.push(i);if(e>2)p=i}
let ans=''
if(B.length){
let v=L(A,GS),ct=new Set()
for(let i=(p/w|0)*w,j=i+w;i<j;i++)if(!A[i]&&!v[i])ct.add(i)
let blocked=new Set(B),cur=p,used=new Uint8Array(A.length)
for(let b of B){if(used[b])continue
let cs=F(A,ct,b),rb=B.filter(x=>cs.has(x)),rg=GS.filter(x=>cs.has(x))
for(let x of rb)used[x]=1,blocked.delete(x)
let A2=A.slice();for(let s of blocked)A2[s]=1
let mv=S(A2,rb,rg,cur)
if(!mv){ans='';break}
ans+=mv[0];cur=mv[1]
for(let x of rg)blocked.add(x)}}
let u=O+'/'+id;f.mkdirSync(u,{recursive:true});f.writeFileSync(u+'/solution.txt',ans)}
