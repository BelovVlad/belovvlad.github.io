const root = document.documentElement;
try {
  const theme = JSON.parse(localStorage.getItem('pweb.home.v1'))?.settings?.theme;
  root.dataset.theme = theme === 'light' || (theme === 'system' && matchMedia('(prefers-color-scheme:light)').matches) ? 'light' : 'dark';
} catch {}
const container = document.querySelector('#materials'), search = document.querySelector('#search');
let files = [];
function render() {
  const query = search.value.trim().toLocaleLowerCase('ru');
  const results = files.filter(file=>[file.title,file.description,file.path].join(' ').toLocaleLowerCase('ru').includes(query));
  document.querySelector('#file-count').textContent = results.length ? results.length : '';
  container.replaceChildren();
  if (!results.length) {
    const empty = document.createElement('div');empty.className='empty';
    const title = document.createElement('strong');title.textContent=query ? 'Ничего не нашлось' : 'Материалы скоро появятся';
    const note = document.createElement('p');note.textContent=query ? 'Попробуйте другое название.' : 'Здесь будут PDF с пояснениями, расчётами и дополнительными материалами.';
    empty.append(title,note);container.append(empty);return;
  }
  for (const file of results) {
    const link = document.createElement('a');link.className='file';link.target='_blank';link.rel='noopener noreferrer';
    link.href = './'+file.path.split('/').map(encodeURIComponent).join('/');
    const badge = document.createElement('span');badge.className='file-icon';badge.textContent='PDF';
    const copy = document.createElement('span');copy.className='file-copy';
    const title = document.createElement('strong');title.textContent=file.title;
    const description = document.createElement('small');description.textContent=file.description || file.path.split('/').at(-1);
    copy.append(title,description);
    const meta = document.createElement('span');meta.className='file-meta';meta.textContent=(file.bytes/1024/1024 >= 1 ? (file.bytes/1024/1024).toFixed(1)+' МБ' : Math.max(1,Math.ceil(file.bytes/1024))+' КБ')+' ↗';
    link.append(badge,copy,meta);container.append(link);
  }
}
search.addEventListener('input',render);
try {
  const response = await fetch('./materials.json',{cache:'no-cache'});
  if (!response.ok) throw new Error('catalog');
  const catalog = await response.json();
  files = Array.isArray(catalog.files) ? catalog.files : [];
  render();
} catch { container.textContent='Не удалось загрузить материалы. Обновите страницу.'; }
