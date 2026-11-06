// A shared search surface; existing site navigation, catalog and AI entry stay intact.
const input=document.getElementById('search');
if(input) {
  const box=input.closest('.searchbox') || input.parentElement;
  const source=location.pathname.startsWith('/Helper_PF_NSU/')?'helper':location.pathname.startsWith('/Department/')?'department':'home';
  let frame, overlay, ready=false, opened=false, aiOpen=false, savedFocus, scroll=0, oldOverflow='';
  const background=new Map();
  let query=input.value;
  let entryDirty=false;
  input.addEventListener('input',()=>{entryDirty=true;});
  function show(q=entryDirty?input.value:query,fromHistory=false) {
    entryDirty=false;
    query=q;
    if(!overlay){
      overlay=document.createElement('div');overlay.setAttribute('role','dialog');overlay.setAttribute('aria-label','Поиск по всему Hyle');overlay.setAttribute('aria-modal','true');
      overlay.style.cssText='position:fixed;inset:0;z-index:1000;background:#080d12';
      frame=document.createElement('iframe');frame.title='Общий поиск Hyle';frame.style.cssText='display:block;width:100%;height:100%;border:0;color-scheme:dark';
      frame.src='/search/?'+new URLSearchParams({q:query,from:source});overlay.append(frame);document.body.append(overlay);
    }
    if(!opened){
      savedFocus=document.activeElement;scroll=scrollY;oldOverflow=document.documentElement.style.overflow;
      for(const el of document.body.children){if(el===overlay)continue;background.set(el,el.inert);el.inert=true;}
      document.documentElement.style.overflow='hidden';
      if(!fromHistory)history.pushState({...history.state,hyleSearchOverlay:true},'');
    }
    opened=true;overlay.hidden=false;
    if(ready)frame.contentWindow.postMessage({type:'hyle-search-open',query},location.origin);
    frame.focus();
  }
  function close(fromHistory=false){
    if(!opened)return;
    if(!fromHistory&&history.state?.hyleSearchOverlay){history.back();return;}
    opened=false;overlay.hidden=true;document.documentElement.style.overflow=oldOverflow;
    for(const [el,inert] of background)el.inert=inert;background.clear();
    scrollTo(0,scroll);savedFocus?.focus({preventScroll:true});
  }
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==frame?.contentWindow)return;
    if(event.data?.type==='hyle-search-close')close();
    if(event.data?.type==='hyle-search-state')query=String(event.data.query||'');
    if(event.data?.type==='hyle-search-ready'){ready=true;if(opened)frame.contentWindow.postMessage({type:'hyle-search-open',query},location.origin);}
    if(event.data?.type==='hyle-search-ai-open'){
      if(!aiOpen)history.pushState({...history.state,hyleSearchOverlay:true,hyleSearchAi:true},'');
      aiOpen=true;
    }
    if(event.data?.type==='hyle-search-ai-close-request'){
      if(history.state?.hyleSearchAi)history.back();
      else {aiOpen=false;frame.contentWindow.postMessage({type:'hyle-search-ai-close'},location.origin);}
    }
  });
  window.addEventListener('popstate',event=>{
    if(opened||history.state?.hyleSearchOverlay)event.stopImmediatePropagation();
    if(aiOpen&&!history.state?.hyleSearchAi){aiOpen=false;frame.contentWindow.postMessage({type:'hyle-search-ai-close'},location.origin);}
    if(history.state?.hyleSearchOverlay){if(!opened)show(query,true);}else close(true);
  },true);
  window.addEventListener('keydown',event=>{
    if(document.documentElement.classList.contains('ai-open'))return;
    const shortcut=(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k';
    if((shortcut&&!document.querySelector('dialog[open]')) || (event.key==='Enter'&&event.target===input&&!event.isComposing)){
      event.preventDefault();event.stopImmediatePropagation();show();
    }
    if(event.key==='Escape'&&opened){event.preventDefault();close();}
  },true);
  const icon=box.querySelector('.search-icon,[data-icon="search"]');
  if(icon){
    const trigger=document.createElement('button');trigger.type='button';trigger.setAttribute('aria-label','Открыть общий поиск');
    trigger.style.cssText='display:grid;place-items:center;flex:none;padding:0;border:0;background:none;color:inherit;min-width:32px;min-height:36px;cursor:pointer';
    icon.replaceWith(trigger);trigger.append(icon);
    trigger.addEventListener('pointerdown',e=>e.stopPropagation());
    trigger.addEventListener('click',e=>{e.preventDefault();show();});
  }
}
