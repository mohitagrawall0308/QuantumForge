/* Light / dark mode toggle (choice is remembered in this browser). */
(function(){
  const root=document.documentElement,btn=document.getElementById("themeToggle");
  function label(){
    const light=root.dataset.theme==="light",t=light?"Switch to dark mode":"Switch to light mode";
    btn.setAttribute("aria-label",t);btn.title=t;
  }
  btn.addEventListener("click",()=>{
    const next=root.dataset.theme==="light"?"dark":"light";
    root.dataset.theme=next;
    try{localStorage.setItem("qf-theme",next)}catch(e){}
    label();
    if(window.bgRefresh)bgRefresh();
  });
  label();
})();
