import test from 'node:test';
import assert from 'node:assert/strict';
import defaults from '../config.js';
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
  assert.deepEqual(config.resources.map(r => r.id),['nsu-s2','github','nsu-s1']);
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
  assert.equal(migrated.revision,2);
  assert.equal(migrateConfig(migrated),migrated);
  old.resources.find(r=>r.id==='darknotes').url='https://example.com/renamed';
  assert.equal(migrateConfig(validateConfig(old)).resources.some(r=>r.id==='darknotes'),true);
});
