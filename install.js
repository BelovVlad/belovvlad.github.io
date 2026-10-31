// One app for the whole domain. manifest.webmanifest has scope "/", so the hub, НГУ, Кафедра and the
// diploma open inside the same app window; NSU and Department link the same manifest, so installing
// from any of them gives this one app. Each site keeps its own offline storage: the hub only reads the
// caches of this origin to show what is saved and sends to НГУ for its «Сохранить все материалы».
const $ = selector => document.querySelector(selector);
const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
let prompt = null;

const SITES = [
  { id:'hub', name:'Хаб', url:'./', cache: keys => keys.some(key => key.startsWith('pweb-hub-')) },
  { id:'nsu', name:'НГУ · 4 курс', url:'/NSU_FP_Y4_S1/docs/', save:'/NSU_FP_Y4_S1/docs/#offline' },
  { id:'department', name:'Кафедра', url:'/Department/', online:'Открывается при подключении к интернету.' },
  { id:'diploma', name:'Диплом', url:'/diploma/', online:'Нужны интернет и пароль при каждом входе.' }
];

const bytes = value => value >= 1073741824 ? (value / 1073741824).toFixed(1) + ' ГБ' : value >= 1048576 ? Math.round(value / 1048576) + ' МБ' : Math.max(1, Math.round(value / 1024)) + ' КБ';
const word = (n, one, few, many) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; };

function installState() {
  const button = $('#install-app'), text = $('#install-text'), help = $('#install-help');
  if (!button) return;
  if (installed()) {
    $('#install-title').textContent = 'Вы в приложении PweB';
    text.textContent = 'Сайты PweB открываются в этом окне. Хаб и сохранённые материалы НГУ работают без интернета.';
    button.hidden = true; help.hidden = true; return;
  }
  button.hidden = false;
  button.lastChild.textContent = prompt ? 'Установить' : 'Как установить';
}

async function install() {
  const help = $('#install-help');
  if (prompt) {
    const event = prompt; prompt = null;
    try { await event.prompt(); await event.userChoice; } catch { /* the instructions below stay available */ }
    installState(); return;
  }
  help.textContent = ios ? 'В Safari нажмите «Поделиться», затем «На экран Домой».'
    : matchMedia('(pointer:fine)').matches ? 'В Edge: меню ⋯ → «Приложения» → «Установить этот сайт как приложение». В Chrome: значок установки справа в адресной строке. Приложение появится в меню «Пуск» и на рабочем столе.'
    : 'В Chrome нажмите ⋮ → «Установить приложение» или «Добавить на главный экран». Если сайт открыт внутри мессенджера, сначала выберите «Открыть в браузере».';
  help.hidden = false;
}

async function offlineRows() {
  const box = $('#offline-sites');
  if (!box) return;
  let keys = [];
  try { keys = await caches.keys(); } catch { /* no Cache Storage: everything is online-only */ }
  const nsuShell = keys.some(key => key.startsWith('nsu-app-') && key.includes('-shell-'));
  let nsuFiles = 0;
  for (const key of keys.filter(key => key.startsWith('nsu-app-') && key.endsWith('-pdf-v1'))) {
    try { nsuFiles += (await (await caches.open(key)).keys()).length; } catch { /* unreadable cache counts as empty */ }
  }
  box.innerHTML = '';
  for (const site of SITES) {
    let state = 'online', text = site.online, action = null;
    if (site.id === 'hub') { state = site.cache(keys) ? 'ready' : 'pending'; text = state === 'ready' ? 'Открывается без интернета.' : 'Копия появится после первой загрузки.'; }
    if (site.id === 'nsu') {
      state = nsuFiles ? 'ready' : nsuShell ? 'partial' : 'pending';
      text = nsuFiles ? `Сохранено ${nsuFiles} ${word(nsuFiles, 'материал', 'материала', 'материалов')}. Новые и изменённые можно докачать.`
        : nsuShell ? 'Сайт открывается без интернета, PDF пока не сохранены.' : 'Откройте сайт один раз при подключении, затем сохраните материалы.';
      action = { href:site.save, label: nsuFiles ? 'Докачать' : 'Сохранить материалы' };
    }
    const row = document.createElement('div'); row.className = 'offline-row'; row.dataset.state = state;
    row.innerHTML = '<span class="offline-dot" aria-hidden="true"></span><div><strong></strong><span></span></div>';
    row.querySelector('strong').textContent = site.name; row.querySelector('span:last-child').textContent = text;
    if (action) {
      const link = document.createElement('a'); link.className = 'button'; link.href = action.href; link.textContent = action.label;
      link.addEventListener('click', () => navigator.storage?.persist?.().catch(() => {}));
      row.append(link);
    }
    box.append(row);
  }
  const note = $('#storage-note');
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    const kept = await navigator.storage.persisted?.();
    note.textContent = `Занято на устройстве: ${bytes(usage)}${quota ? ' из ' + bytes(quota) : ''}.` + (kept ? ' Браузер не будет очищать эти данные сам.' : ' При нехватке места браузер может их очистить; установленное приложение защищено лучше.');
  } catch { note.textContent = ''; }
}

window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); prompt = event; installState(); });
window.addEventListener('appinstalled', () => { prompt = null; navigator.storage?.persist?.().catch(() => {}); installState(); });
$('#install-app')?.addEventListener('click', () => void install());
// The tab is filled when it opens, so the counts are current after a download in НГУ.
const panel = $('#panel-app');
if (panel) new MutationObserver(() => { if (!panel.hidden) void offlineRows(); }).observe(panel, { attributes:true, attributeFilter:['hidden'] });
$('#settings-button')?.addEventListener('click', () => { if (panel && !panel.hidden) void offlineRows(); });
installState();
