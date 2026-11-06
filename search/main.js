import { SearchEngine } from './engine.js';
import { mountSearch } from './ui.js';
import { loadCatalog } from './catalog.js';

const params = new URLSearchParams(location.search);
const embedded = window.parent !== window;
const root = document.getElementById('hyle-next');
const send = (type, extra={}) => { if (embedded) parent.postMessage({type,...extra},location.origin); };
try {
  const {docs,failed} = await loadCatalog();
  const engine = new SearchEngine(docs);
  const app = mountSearch(root,docs,engine,{
    initialQuery: params.get('q') || '', entry:params.get('from') || 'home', embedded,
    onClose:()=>embedded?send('hyle-search-close'):location.assign('/'), onState:state=>send('hyle-search-state',{query:state.query})
  });
  document.querySelector('.search-field').id='searchbox';
  document.querySelector('input[type="search"]').id='search';
  document.querySelector('[data-action="ai"]').id='ai-button';
  window.HyleAIScope=()=>{
    const s=app.getState();
    const selected = s.sources.filter(id => ['helper','department','nsu'].includes(id)).map(id => id === 'nsu' ? 'nsu-y4s1' : id);
    return { site: selected.length === 3 ? '' : selected.join('|') || '__none__', subject:s.subject, semester:s.semester };
  };
  await import('./ai.js');
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin || event.source!==parent)return;
    if(event.data?.type==='hyle-search-open')app.open(event.data.query);
  });
  if(failed.length){
    const notice=document.createElement('p');notice.className='catalog-warning';notice.setAttribute('role','status');
    notice.textContent='Часть каталогов временно недоступна. Перезагрузите поиск, чтобы повторить загрузку.';
    document.querySelector('.search-field').after(notice);
  }
  send('hyle-search-ready');
  document.querySelector('#search').focus();
} catch {
  root.textContent='Не удалось загрузить поиск. Обновите страницу и попробуйте снова.';
  const back=document.createElement('button');back.textContent='Назад';back.onclick=()=>embedded?send('hyle-search-close'):history.back();root.append(back);
}
