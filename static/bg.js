/* Animated photonic background: drifting photons, faint interference waves, pulse on every new sample. */
(function(){
  const cv=document.getElementById("bg");if(!cv)return;
  const ctx=cv.getContext("2d"),reduce=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let W=0,H=0,dpr=1,parts=[],pulse=0,t0=performance.now();
  function resize(){
    dpr=Math.min(window.devicePixelRatio||1,1.5);W=innerWidth;H=innerHeight;
    cv.width=W*dpr;cv.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);
    const n=Math.max(28,Math.min(70,Math.round(W*H/26000)));
    parts=Array.from({length:n},()=>({x:Math.random()*W,y:Math.random()*H,vx:.25+Math.random()*.55,vy:(Math.random()-.5)*.25,r:1+Math.random()*1.8,h:180+Math.random()*100}));
  }
  function frame(now){
    const t=(now-t0)/1000,light=document.documentElement.dataset.theme==="light";
    ctx.clearRect(0,0,W,H);
    ctx.globalCompositeOperation=light?"source-over":"lighter";
    // slow interference waves
    for(let k=0;k<3;k++){
      ctx.beginPath();
      for(let x=0;x<=W;x+=14){
        const y=H*(.25+.25*k)+Math.sin(x*.006+t*.5+k*2)*38+Math.sin(x*.013-t*.35+k)*20;
        x?ctx.lineTo(x,y):ctx.moveTo(x,y);
      }
      ctx.strokeStyle=`hsla(${190+k*45},90%,${light?45:62}%,${(.05+pulse*.06)*(light?2.2:1)})`;ctx.lineWidth=1.4+pulse*1.5;ctx.stroke();
    }
    // photons + links
    for(const p of parts){
      if(!reduce){p.x+=p.vx*(1+pulse*2.2);p.y+=p.vy+Math.sin(t+p.h)*.12}
      if(p.x>W+10){p.x=-10;p.y=Math.random()*H}
      if(p.y<-10)p.y=H+10;if(p.y>H+10)p.y=-10;
    }
    for(let i=0;i<parts.length;i++){
      const a=parts[i];
      for(let j=i+1;j<parts.length;j++){
        const b=parts[j],dx=a.x-b.x,dy=a.y-b.y,d=dx*dx+dy*dy;
        if(d<14000){ctx.strokeStyle=light?`rgba(30,110,190,${(1-d/14000)*(.14+pulse*.2)})`:`rgba(102,227,255,${(1-d/14000)*(.1+pulse*.18)})`;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()}
      }
      const g=ctx.createRadialGradient(a.x,a.y,0,a.x,a.y,a.r*7);
      g.addColorStop(0,`hsla(${a.h},100%,${light?52:72}%,${(.55+pulse*.3)*(light?.7:1)})`);g.addColorStop(1,`hsla(${a.h},100%,${light?45:60}%,0)`);
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(a.x,a.y,a.r*7,0,7);ctx.fill();
    }
    ctx.globalCompositeOperation="source-over";
    pulse*=.95;
    if(!reduce)requestAnimationFrame(frame);
  }
  window.bgPulse=()=>{pulse=1};
  window.bgRefresh=()=>{if(reduce)requestAnimationFrame(frame)};
  addEventListener("resize",resize);resize();requestAnimationFrame(frame);
})();
