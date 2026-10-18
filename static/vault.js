/* Encrypt / Decrypt dialogs: seal a message, share message + secret key, open it again. */
(function(){
  const $=s=>document.querySelector(s);
  let openEl=null,lastFocus=null;

  /* ---------- dialog handling ---------- */
  function openModal(id,focusSel){
    lastFocus=document.activeElement;openEl=$(id);openEl.hidden=false;
    document.body.classList.add("modal-open");
    setTimeout(()=>$(focusSel).focus(),40);
  }
  function closeModal(){
    if(!openEl)return;
    if(openEl.id==="decModal"){ // do not leave decrypted text on screen
      $("#decOut").hidden=true;$("#decMsg").textContent="";
      $("#decKey").type="password";$("#decEye").textContent="Show";$("#decEye").setAttribute("aria-pressed","false");
    }
    openEl.hidden=true;openEl=null;document.body.classList.remove("modal-open");
    if(lastFocus&&lastFocus.focus)lastFocus.focus();
  }
  document.addEventListener("keydown",e=>{
    if(!openEl)return;
    if(e.key==="Escape"){e.preventDefault();closeModal();return}
    if(e.key!=="Tab")return;
    const f=[...openEl.querySelectorAll("button,textarea,input,[href]")].filter(x=>!x.disabled&&x.offsetParent!==null);
    if(!f.length)return;
    const first=f[0],last=f[f.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
  });
  document.querySelectorAll(".modal").forEach(m=>{
    m.addEventListener("mousedown",e=>{if(e.target===m)closeModal()});
    m.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",closeModal));
  });
  $("#openEncrypt").addEventListener("click",()=>openModal("#encModal","#encMsg"));
  $("#openDecrypt").addEventListener("click",()=>openModal("#decModal","#decPkg"));

  /* ---------- helpers ---------- */
  async function post(url,body){
    const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    return r.json();
  }
  function showErr(sel,msg){const e=$(sel);e.textContent=msg;e.hidden=false}
  function hideErr(sel){$(sel).hidden=true}
  async function copyText(t){
    try{await navigator.clipboard.writeText(t);return true}
    catch(_){
      const ta=document.createElement("textarea");ta.value=t;ta.style.cssText="position:fixed;opacity:0";
      document.body.appendChild(ta);ta.select();let ok=false;
      try{ok=document.execCommand("copy")}catch(__){}
      ta.remove();return ok;
    }
  }
  function flash(btn,text){
    if(!btn.dataset.label)btn.dataset.label=btn.textContent;
    btn.textContent=text;btn.classList.add("done");clearTimeout(btn._t);
    btn._t=setTimeout(()=>{btn.textContent=btn.dataset.label;btn.classList.remove("done")},1700);
  }
  document.querySelectorAll("[data-copy]").forEach(b=>b.addEventListener("click",async()=>{
    const el=$(b.dataset.copy),t=el.value!==undefined?el.value:el.textContent;
    flash(b,(await copyText(t))?"Copied ✓":"Copy failed");
  }));
  const pkgOf=t=>(String(t).match(/QFP1\.[0-9a-fA-F]+\.[0-9a-fA-F]+/)||[])[0];
  const keyOf=t=>(String(t).match(/QF-\d+-\d-\d-\d+-[0-9a-fA-F]{32}/i)||[])[0];

  /* ---------- Encrypt ---------- */
  $("#encMsg").addEventListener("input",()=>{
    $("#encCount").textContent=`${$("#encMsg").value.length} / 5000`;
    $("#encOut").hidden=true; // output no longer matches the edited text
  });
  $("#encGo").addEventListener("click",async()=>{
    const msg=$("#encMsg").value,btn=$("#encGo");
    hideErr("#encErr");
    if(!msg.trim()){showErr("#encErr","Please enter a message to encrypt.");return}
    if(typeof setAutoPaused==="function")setAutoPaused(true); // pause live sampling while encrypting
    btn.disabled=true;btn.textContent="Encrypting…";
    try{
      const d=await post("/api/courier/seal",{plaintext:msg,modes:+$("#modes").value,photons:+$("#photons").value,shots:+$("#shots").value});
      if(!d.ok)throw new Error(d.error);
      $("#encPkg").value=d.package;$("#encKey").value=d.access_code;$("#encFp").textContent=d.fingerprint;
      $("#encOut").hidden=false;
      if(typeof setStatus==="function")setStatus("Message encrypted with AES-GCM. Live sampling paused.");
      if(window.bgPulse)bgPulse();
      $("#encOut").scrollIntoView({behavior:"smooth",block:"nearest"});
    }catch(e){showErr("#encErr",e.message||"Encryption failed.")}
    finally{btn.disabled=false;btn.textContent="Encrypt message"}
  });
  $("#encBoth").addEventListener("click",async()=>{
    const t=`QuantumForge encrypted message\nEncrypted message: ${$("#encPkg").value}\nSecret key: ${$("#encKey").value}`;
    flash($("#encBoth"),(await copyText(t))?"Copied both ✓":"Copy failed");
  });

  /* ---------- Decrypt ---------- */
  $("#decEye").addEventListener("click",()=>{
    const k=$("#decKey"),show=k.type==="password";
    k.type=show?"text":"password";$("#decEye").textContent=show?"Hide":"Show";$("#decEye").setAttribute("aria-pressed",String(show));
  });
  // Pasting the "Copy both" block into either field fills both fields.
  function smartSplit(e){
    const t=e.target.value,p=pkgOf(t),k=keyOf(t);
    if(p&&k){$("#decPkg").value=p;$("#decKey").value=k}
  }
  $("#decPkg").addEventListener("input",smartSplit);$("#decKey").addEventListener("input",smartSplit);
  $("#decGo").addEventListener("click",async()=>{
    const btn=$("#decGo");hideErr("#decErr");$("#decOut").hidden=true;
    const pkg=pkgOf($("#decPkg").value)||$("#decPkg").value.trim();
    let key=(keyOf($("#decKey").value)||$("#decKey").value.trim());
    if(!pkg||!key){showErr("#decErr","Enter both the encrypted message and the secret key.");return}
    key="QF"+key.slice(2).toLowerCase();
    btn.disabled=true;btn.textContent="Decrypting…";
    try{
      const d=await post("/api/courier/open",{access_code:key,package:pkg});
      if(!d.ok)throw new Error(d.error);
      $("#decMsg").textContent=d.plaintext;$("#decOut").hidden=false;
      if(window.bgPulse)bgPulse();
      $("#decOut").scrollIntoView({behavior:"smooth",block:"nearest"});
    }catch(e){showErr("#decErr",e.message||"Decryption failed.")}
    finally{btn.disabled=false;btn.textContent="Decrypt message"}
  });
})();
