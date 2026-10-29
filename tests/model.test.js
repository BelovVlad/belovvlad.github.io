import test from 'node:test';
import assert from 'node:assert/strict';
import defaults, { DIPLOMA_URL } from '../config.js';
import { clone, validateConfig, safeUrl, filterResources, moveResource, migrateConfig } from '../model.js';

test('default config and JSON round-trip retain actual links and drafts', () => {
  assert.deepEqual(validateConfig(JSON.parse(JSON.stringify(defaults))), defaults);
  assert.equal(defaults.resources.find(r => r.id === 'nsu-s2').url, '');
});
test('search matches titles, descriptions and categories in Russian and English', () => {
  assert.equal(filterResources(defaults,{query:'ФИЗИЧЕСКОГО'}).length,1);
  assert.equal(filterResources(defaults,{query:'Education'}).length,2);
  assert.equal(filterResources(defaults,{query:'семестр'}).length,2);
  assert.equal(filterResources(defaults,{category:'tools',query:'Репозитории'}).length,0);
  assert.equal(filterResources(defaults,{favorites:true}).length,1);
});
test('imports reject executable URLs, duplicate IDs and dangling categories', () => {
  for (const url of ['javascript:alert(1)','data:text/html,test','file:///x','//evil.example','https:example.com']) assert.equal(safeUrl(url),false);
  for (const url of ['https://example.com/','http://localhost:4173/']) assert.equal(safeUrl(url),true);
  const invalid = [
    c => c.resources[0].url = 'javascript:alert(1)',
    c => c.resources[0].category = 'missing',
    c => c.resources.push({...c.resources[0]}),
    c => c.categories.push({...c.categories[0]}),
    c => c.categories[0].id = 'all',
    c => c.version = 2,
    c => c.resources[0].title = ' '
  ];
  for (const mutate of invalid) { const config = clone(defaults); mutate(config); assert.throws(() => validateConfig(config)); }
});
test('imports normalize optional settings and remove unknown properties', () => {
  const config = clone(defaults); config.settings = { theme:'x', view:'x', newTab:false }; config.unknown = 'ignored';
  config.resources[0].icon = '<svg onload=alert(1)>';
  const validated = validateConfig(config);
  assert.deepEqual(validated.settings,{theme:'dark',view:'grid',newTab:false,showTasks:false});
  assert.equal(validated.resources[0].icon,'globe'); assert.equal(validated.unknown,undefined);
});
test('reordering swaps category peers even if other categories are interleaved', () => {
  const config = clone(defaults); config.resources.splice(1,0,config.resources.splice(2,1)[0]);
  assert.equal(moveResource(config,'nsu-s1',1),true);
  assert.deepEqual(config.resources.map(r => r.id),['nsu-s2','diploma-materials','nsu-s1','github']);
  assert.equal(moveResource(config,'nsu-s1',1),false);
  assert.equal(moveResource(config,'missing',1),false);
});

test('old collections retire only the abandoned seed and preserve custom data', () => {
  const old=clone(defaults); old.revision=1;
  old.resources.push({id:'darknotes',title:'DarkNotes',url:'https://belovvlad.github.io/DarkNotes/',category:'tools',icon:'pen',description:'',favorite:true});
  old.resources.push({id:'custom',title:'Мой проект',url:'https://example.com/',category:'projects',icon:'code',description:'',favorite:true});
  old.todos.push({id:'todo',text:'Сохранённая задача',done:true});
  const migrated=migrateConfig(validateConfig(old));
  assert.equal(migrated.resources.some(r=>r.id==='darknotes'),false);
  assert.equal(migrated.resources.some(r=>r.id==='custom'),true);
  assert.deepEqual(migrated.todos,old.todos);
  assert.equal(migrated.revision,7);
  assert.equal(migrateConfig(migrated),migrated);
  old.resources.find(r=>r.id==='darknotes').url='https://example.com/renamed';
  assert.equal(migrateConfig(validateConfig(old)).resources.some(r=>r.id==='darknotes'),true);
});

test('revision 2 collections gain Diploma without overwriting personal data or duplicating cards',()=>{
  const old=clone(defaults);old.revision=2;
  old.categories=old.categories.filter(c=>c.id!=='diploma');old.resources=old.resources.filter(r=>r.category!=='diploma');
  old.resources[0].title='Мой семестр';old.todos=[{id:'task',text:'Сохранить меня',done:true}];
  const next=migrateConfig(old);
  assert.equal(next.categories.filter(c=>c.id==='diploma').length,1);
  assert.equal(next.resources.filter(r=>r.category==='diploma').length,1);
  assert.equal(next.resources[0].title,'Мой семестр');assert.deepEqual(next.todos,old.todos);
  assert.equal(old.resources.length,3);assert.equal(migrateConfig(next),next);
  const existing=clone(old);existing.categories.push({id:'my-diploma',name:'Диплом',description:'Мой раздел',icon:'folder'});
  const reused=migrateConfig(existing);assert.equal(reused.categories.filter(c=>c.name==='Диплом').length,1);
  assert.equal(reused.resources.filter(r=>r.category==='my-diploma').length,1);
});

const presentationCard={id:'diploma-presentation',title:'Презентация диплома',description:'',url:'https://belovvlad.github.io/diploma/web/',category:'diploma',icon:'code',favorite:false};
test('revision 3 Diploma cards move from Sites to the protected site and keep personal edits',()=>{
  const old=clone(defaults);old.revision=3;
  old.resources.push({...presentationCard,url:'https://pweb-diploma.swoonybard26.chatgpt.site/web/'});
  const materials=old.resources.find(r=>r.id==='diploma-materials');materials.url='https://pweb-diploma.swoonybard26.chatgpt.site/';materials.title='Мои материалы';
  const next=migrateConfig(validateConfig(old));
  assert.equal(next.revision,7);
  assert.equal(next.resources.find(r=>r.id==='diploma-materials').url,DIPLOMA_URL);
  assert.equal(next.resources.find(r=>r.id==='diploma-materials').title,'Мои материалы');
  assert.equal(next.resources.some(r=>r.url.includes('chatgpt.site')||r.id==='diploma-presentation'),false);
});
test('revision 4 retires the presentation card and refreshes only untouched Diploma texts',()=>{
  const old=clone(defaults);old.revision=4;
  old.resources.push({...presentationCard},{...presentationCard,id:'mine',title:'Моя ссылка'});
  old.resources.find(r=>r.id==='diploma-materials').description='PDF с пояснениями, расчётами и дополнительными материалами.';
  old.categories.find(c=>c.id==='diploma').description='Свой текст';
  const next=migrateConfig(validateConfig(old));
  assert.equal(next.resources.some(r=>r.url==='https://belovvlad.github.io/diploma/web/'),false);
  assert.equal(next.resources.find(r=>r.id==='diploma-materials').description,defaults.resources.find(r=>r.id==='diploma-materials').description);
  assert.equal(next.categories.find(c=>c.id==='diploma').description,'Свой текст');
});
test('revision 5 cards leave the former public Diploma copy for the protected site',()=>{
  const old=clone(defaults);old.revision=5;
  const materials=old.resources.find(r=>r.id==='diploma-materials');materials.url='https://belovvlad.github.io/diploma/';materials.title='Мои материалы';
  old.resources.push({id:'mine',title:'Отчёт',description:'',url:'https://belovvlad.github.io/diploma/viewer/pdfjs/viewer.html',category:'diploma',icon:'book',favorite:true});
  const next=migrateConfig(validateConfig(old));
  assert.equal(next.revision,7);
  assert.deepEqual(next.resources.filter(r=>r.category==='diploma').map(r=>[r.title,r.url]),[['Мои материалы',DIPLOMA_URL],['Отчёт',DIPLOMA_URL]]);
  assert.equal(next.resources.some(r=>r.url.includes('github.io/diploma/viewer')),false);
});
test('revision 6 cards leave the Cloudflare Diploma site for the encrypted one',()=>{
  const old=clone(defaults);old.revision=6;
  old.resources.find(r=>r.id==='diploma-materials').url='https://pweb-diploma.pages.dev/';
  old.resources.push({id:'mine',title:'Отчёт',description:'',url:'https://pweb-diploma.pages.dev/viewer/pdfjs/viewer.html',category:'diploma',icon:'book',favorite:true});
  const next=migrateConfig(validateConfig(old));
  assert.equal(next.revision,7);
  assert.deepEqual(next.resources.filter(r=>r.category==='diploma').map(r=>r.url),[DIPLOMA_URL,DIPLOMA_URL]);
});
