const $=s=>document.querySelector(s);
let state={key_hex:null,nonce:null};
let autoPaused=false, autoTimer=null, busy=false;

function syncControls(){
  $("#modesOut").textContent=$("#modes").value;
  $("#photons").max=$("#modes").value;
  if(+$("#photons").value>+$("#modes").value) $("#photons").value=$("#modes").value;
  $("#photonsOut").textContent=$("#photons").value;
  $("#shotsOut").textContent=$("#shots").value;
  $("#inputText").textContent=`${$("#photons").value} photons / ${$("#modes").value} modes`;
}
["modes","photons","shots"].forEach(id=>$("#"+id).addEventListener("input",syncControls));
$("#randomize").addEventListener("click",()=>{$("#seed").value=Math.floor(Math.random()*4294967295);run()});

function setStatus(s,ok=true){$("#status").textContent=s;$("#status").style.color=ok?"#8795aa":"#ff7188"}

function renderMatrix(m){
  const root=$("#matrix");root.innerHTML="";
  m.forEach(row=>{
    const r=document.createElement("div");r.className="matrix-row";
    row.forEach(x=>{
      const c=document.createElement("div");c.className="cell";
      const sign=x.im>=0?"+":"−";
      c.textContent=`${x.re.toFixed(2)} ${sign} ${Math.abs(x.im).toFixed(2)}i`;r.appendChild(c);
    });root.appendChild(r);
  });
}

function renderBars(items){
  const root=$("#bars");root.innerHTML="";
  const max=Math.max(...items.map(x=>x.probability),1e-9);
  items.forEach(x=>{
    const b=document.createElement("div");b.className="bar";
    b.innerHTML=`<div class="bar-label">${x.state}</div><div class="track"><div class="fill" style="width:${x.probability/max*100}%"></div></div><div class="bar-value">${(x.probability*100).toFixed(2)}%</div>`;
    root.appendChild(b);
  });
}

/* ---------- Photonic chip graphic (canvas; graphic taken from PhotonLock) ---------- */
const chipState={m:4,n:3,hist:[0,0,0,0],det:[0,0,0,0],anims:[],dur:1600};
function resetChip(m,n){chipState.m=m;chipState.n=n;chipState.hist=Array(m).fill(0);chipState.det=Array(m).fill(0);chipState.anims=[];}
function partner(c,r){const m=chipState.m;if(r%2==c%2&&r+1<m)return r+1;if(r>0&&(r-1)%2==c%2)return r-1;return -1}
function chipPath(s,t){
  const m=chipState.m,reach=[new Set([s])];
  for(let c=0;c<m;c++){const nx=new Set();reach[c].forEach(r=>{nx.add(r);const q=partner(c,r);if(q>=0)nx.add(q)});reach.push(nx)}
  if(!reach[m].has(t))return Array(m+1).fill(t);
  const p=[t];let r=t;
  for(let c=m-1;c>=0;c--){const cand=[r,partner(c,r)].filter(x=>x>=0&&reach[c].has(x));r=cand[Math.random()*cand.length|0];p.unshift(r)}
  return p;
}
function sizeChip(){const c=$("#chip"),d=window.devicePixelRatio||1,w=c.clientWidth,hh=c.clientHeight;if(c.width!=w*d||c.height!=hh*d){c.width=w*d;c.height=hh*d}const x=c.getContext("2d");x.setTransform(d,0,0,d,0,0);return[x,w,hh]}
function drawChip(now){
  const[x,W,H]=sizeChip(),m=chipState.m,n=chipState.n,hist=chipState.hist,det=chipState.det;
  const light=document.documentElement.dataset.theme==="light",ink=light?"#4a5878":"#8b96c6";
  const L=84,R=W-110,xs=L+10,xe=R-10,dx=(xe-xs)/m,P=26,yr=j=>P+(j+.5)*(H-2*P)/m;
  x.clearRect(0,0,W,H);x.globalCompositeOperation=light?"source-over":"lighter";
  for(const[col,ph,a] of [["#7a4dff",0,.1],["#32e6a0",2,.09]]){x.beginPath();for(let k=0;k<=160;k++){const px=k/160*W;x.lineTo(px,H/2+Math.sin(k*.09+now/900+ph)*H*.28*Math.sin(k/160*Math.PI))}x.strokeStyle=col;x.globalAlpha=a*3;x.lineWidth=14;x.stroke()}
  x.globalAlpha=1;const gr=x.createLinearGradient(L,0,R,0);gr.addColorStop(0,light?"#7a4dff":"#a98bff");gr.addColorStop(.5,light?"#0aa5d6":"#5ee7ff");gr.addColorStop(1,light?"#12b76a":"#6dffb4");
  x.strokeStyle=gr;x.lineWidth=1.2;x.globalAlpha=.55;
  for(let j=0;j<m;j++){x.beginPath();x.moveTo(L,yr(j));x.lineTo(R,yr(j));x.globalAlpha=light?.3:.12;x.stroke()}
  x.globalAlpha=.6;
  for(let c=0;c<m;c++)for(let r=c%2;r+1<m;r+=2){
    const a=xs+c*dx+dx*.2,b=xs+c*dx+dx*.8;
    x.beginPath();x.moveTo(a,yr(r));x.lineTo(b,yr(r+1));x.moveTo(a,yr(r+1));x.lineTo(b,yr(r));x.stroke();
    const pulse=.5+.5*Math.sin(now/500+c+r);x.fillStyle=gr;x.globalAlpha=.4+.4*pulse;x.beginPath();x.arc((a+b)/2,(yr(r)+yr(r+1))/2,3,0,7);x.fill();x.globalAlpha=.6;
  }
  x.globalAlpha=1;
  const ypos=(p,xx)=>{const f=(xx-xs)/dx;if(f<0)return yr(p[0]);if(f>=m)return yr(p[m]);const c=Math.floor(f),u=f-c,s=Math.min(1,Math.max(0,(u-.2)/.6)),e=s*s*(3-2*s);return yr(p[c])+(yr(p[c+1])-yr(p[c]))*e};
  chipState.anims=chipState.anims.filter(a=>{
    const age=(now-a.t0)/chipState.dur;
    a.paths.forEach((p,k)=>{
      const s=age-k*.02;if(s<0)return;if(s>=1&&!a.done)return;
      for(let q=0;q<14;q++){
        const sx=L+Math.min(1,s)*(R-L)-q*6,al=(1-q/14);if(sx<L||al<=0)continue;
        const yy=ypos(p,sx),hue=270-110*Math.min(1,(sx-L)/(R-L)),g=x.createRadialGradient(sx,yy,0,sx,yy,q?5:11);
        g.addColorStop(0,`hsla(${hue},100%,${light?46:75}%,${al})`);g.addColorStop(1,`hsla(${hue},100%,${light?40:60}%,0)`);
        x.fillStyle=g;x.beginPath();x.arc(sx,yy,q?5:11,0,7);x.fill();
      }
    });
    if(age>=1&&!a.done){a.done=1;a.out.forEach(o=>{if(o<m){det[o]=1;hist[o]++}})}
    return age<1.05;
  });
  const mh=Math.max(1,...hist);x.globalAlpha=1;x.font="11px system-ui";
  for(let j=0;j<m;j++){
    const y=yr(j);
    x.fillStyle=j<n?(light?"#e08a00":"#ffd27a"):(light?"#9aa7bf":"#556");x.beginPath();x.arc(L-22,y,j<n?5+1.5*Math.sin(now/200+j):2.5,0,7);x.fill();
    x.fillStyle=ink;x.fillText(j<n?"|1>":"|0>",L-62,y+4);
    det[j]*=.95;x.fillStyle=light?`rgba(11,143,201,${.15+.85*det[j]})`:`rgba(94,231,255,${.15+.85*det[j]})`;x.fillRect(R+2,y-8,12,16);
    x.fillStyle="rgba(169,139,255,.8)";x.fillRect(R+20,y-4,hist[j]/mh*70,8);
    x.fillStyle=ink;x.fillText(hist[j],R+22+hist[j]/mh*70+4,y+4);
  }
  x.globalCompositeOperation="source-over";x.fillStyle=ink;
  x.fillText("single-photon sources",6,14);x.fillText("secret interferometer (beam-splitter mesh)",xs+8,14);x.fillText("detectors",R-4,14);
}
function chipLoop(now){drawChip(now);requestAnimationFrame(chipLoop)}
function updateGraphicFromSample(data){
  const m=data.modes, n=data.photons;
  if(chipState.m!==m||chipState.n!==n)resetChip(m,n);
  const match=String(data.sampled_state).match(/\|([0-9,]+)>/);
  const occ=match?match[1].split(",").map(Number):[];
  // Fly one photon per input mode to the detectors of the sampled output occupation vector.
  const out=[];occ.forEach((c,j)=>{for(let k=0;k<c;k++)out.push(j)});
  chipState.dur=Math.max(500,Math.min(1600,+$("#autoInterval").value*1.2));
  chipState.anims.push({t0:performance.now(),out,paths:out.map((o,k)=>chipPath(k,o))});
  const outcomes=binomial(m+n-1,n);
  $("#metricOutcomes").textContent=outcomes;
  const entropy=data.top_states.reduce((sum,x)=>sum-(x.probability>0?x.probability*Math.log2(x.probability):0),0);
  $("#metricEntropy").textContent=entropy.toFixed(2);
  const variation=data.top_states.reduce((sum,x)=>sum+Math.abs(x.probability-(1/data.top_states.length)),0)/2;
  $("#metricDistance").textContent=variation.toFixed(3);
}
function binomial(n,k){if(k<0||k>n)return 0;k=Math.min(k,n-k);let r=1;for(let i=1;i<=k;i++)r=r*(n-k+i)/i;return Math.round(r);}
function setAutoPaused(paused){
  autoPaused=paused;
  $("#autoToggle").textContent=paused?"▶ Resume":"Ⅱ Pause";
  $("#autoText").textContent=paused?"Automatic sampling paused":"Automatic sampling active";
  $("#autoLed").classList.toggle("paused",paused);
  if(autoTimer)clearInterval(autoTimer);
  autoTimer=setInterval(()=>{if(!autoPaused&&!busy)run(true)},+$("#autoInterval").value);
}
$("#autoToggle").addEventListener("click",()=>setAutoPaused(!autoPaused));
$("#autoInterval").addEventListener("input",()=>{
  $("#autoIntervalOut").textContent=$("#autoInterval").value+" ms";
  if(autoTimer){clearInterval(autoTimer);autoTimer=setInterval(()=>{if(!autoPaused&&!busy)run(true)},+$("#autoInterval").value)}
});

async function run(automatic=false){
  if(busy)return;busy=true;
  setStatus("Computing permanents and sampling the output…");
  $("#run").disabled=true;
  try{
    const body={modes:+$("#modes").value,photons:+$("#photons").value,shots:+$("#shots").value,seed:automatic?null:($("#seed").value||null)};
    const r=await fetch("/api/simulate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const d=await r.json();if(!d.ok)throw new Error(d.error);
    state.key_hex=d.key_hex;
    $("#seed").value=d.seed;$("#inputText").textContent=`${d.photons} photons / ${d.modes} modes`;
    $("#metricPhotons").textContent=d.photons;$("#metricModes").textContent=d.modes;$("#metricShots").textContent=d.shots;
    $("#bigState").textContent=d.sampled_state;$("#sampleText").textContent=d.sampled_state;
    $("#key").textContent=d.key_preview;
    renderMatrix(d.matrix);renderBars(d.top_states);updateGraphicFromSample(d);if(window.bgPulse)bgPulse();
    setStatus(automatic?"Automatic round complete. Sample and demo key refreshed.":"Simulation complete. A new bosonic sample and demo key were generated.");
  }catch(e){setStatus(e.message,false)}
  finally{$("#run").disabled=false;busy=false}
}
$("#run").addEventListener("click",run);
$("#encrypt").addEventListener("click",async()=>{
  setAutoPaused(true); // freeze the key so the ciphertext can be decrypted later
  if(!state.key_hex){setStatus("Run the Boson Sampling experiment first.",false);return}
  const keyHex=state.key_hex; // remember exactly which key encrypts this message
  const r=await fetch("/api/encrypt",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({plaintext:$("#plaintext").value,key_hex:keyHex})});
  const d=await r.json();if(!d.ok){setStatus(d.error,false);return}
  state.encKeyHex=keyHex;state.nonce=d.nonce;$("#nonce").value=d.nonce;$("#ciphertext").value=d.ciphertext;$("#decrypted").textContent="—";setStatus("Message encrypted with AES-GCM.");
});
$("#decrypt").addEventListener("click",async()=>{
  if(!state.encKeyHex||!state.nonce){setStatus("Encrypt a message first.",false);return}
  const r=await fetch("/api/decrypt",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key_hex:state.encKeyHex,nonce:state.nonce,ciphertext:$("#ciphertext").value})});
  const d=await r.json();$("#decrypted").textContent=d.ok?d.plaintext:d.error;setStatus(d.ok?"Decryption successful.":"Decryption failed.",d.ok);
});
syncControls();resetChip(+$("#modes").value,+$("#photons").value);requestAnimationFrame(chipLoop);setAutoPaused(false);run();
