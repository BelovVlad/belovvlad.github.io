import { SearchEngine } from './engine.js?v=4';
import { mountSearch } from './ui.js?v=2';
import { loadCatalog } from './catalog.js?v=4';
import { installReaderNavigation } from './reader.js?v=2';

const params = new URLSearchParams(location.search);
const embedded = window.parent !== window;
const root = document.getElementById('hyle-next');
const send = (type, extra={}) => { if (embedded) parent.postMessage({type,...extra},location.origin); };
try {
  const engine = new SearchEngine([]);
  const app = mountSearch(root,[],engine,{
    loading:true,
    initialQuery: params.get('q') || '', entry:params.get('from') || 'home', embedded,
    onClose:()=>embedded?send('hyle-search-close'):location.assign('/'), onState:state=>send('hyle-search-state',{query:state.query})
  });
  installReaderNavigation();
  document.querySelector('.search-field').id='searchbox';
  document.querySelector('input[type="search"]').id='search';
  document.querySelector('[data-action="ai"]').id='ai-button';
  window.HyleAIScope=()=>{
    const s=app.getState();
    const selected = s.sources.filter(id => ['helper','department','nsu'].includes(id)).map(id => id === 'nsu' ? 'nsu-y4s1' : id);
    return { site: selected.length === 3 ? '' : selected.join('|') || '__none__', subject:s.subject, semester:s.semester };
  };
  const aiButton = document.querySelector('#ai-button'); aiButton.disabled = true;
  void import('./ai.js').then(() => { aiButton.disabled = false; }).catch(() => { aiButton.title = 'Не удалось загрузить ИИ. Обновите страницу.'; });
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin || event.source!==parent)return;
    if(event.data?.type==='hyle-search-open')app.open(event.data.query);
  });
  send('hyle-search-ready');
  if (!embedded) document.querySelector('#search').focus({preventScroll:true});
  const notice=document.createElement('p');notice.className='catalog-warning';notice.setAttribute('role','status');
  document.querySelector('.search-field').after(notice);
  let latest, scheduled = false;
  void loadCatalog(snapshot => {
    latest = snapshot;
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      app.setCatalog(latest.docs, latest.pending > 0);
      notice.hidden = !latest.pending && !latest.failed.length;
      notice.textContent = latest.pending ? 'Каталоги загружаются. Уже можно вводить запрос.' :
        latest.failed.length ? 'Часть каталогов временно недоступна. Перезагрузите поиск, чтобы повторить загрузку.' : '';
    });
  });
} catch {
  root.textContent='Не удалось загрузить поиск. Обновите страницу и попробуйте снова.';
  const back=document.createElement('button');back.textContent='Назад';back.onclick=()=>embedded?send('hyle-search-close'):history.back();root.append(back);
}
