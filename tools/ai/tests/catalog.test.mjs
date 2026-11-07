import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCatalog} from '../../../search/catalog.js';

test('catalogs arrive progressively; a failed source does not discard available files', async t => {
  const requests = new Map(), updates = [];
  t.mock.method(globalThis, 'fetch', url => new Promise(resolve => requests.set(String(url),resolve)));
  const loaded = loadCatalog(snapshot => updates.push(snapshot));
  assert.equal(requests.size,4,'all sources start without waiting for Home');
  assert.equal(updates[0].pending,4);
  const respond = async (part,body,status=200) => {
    const key=[...requests.keys()].find(url=>url.includes(part));
    requests.get(key)(new Response(JSON.stringify(body),{status}));
    await new Promise(resolve=>setImmediate(resolve));
  };
  await respond('NSU_FP_Y4_S1',{files:[{path:'course/lecture.pdf',subject:'Оптика'}]});
  assert.equal(updates.at(-1).pending,3);
  assert.equal(updates.at(-1).docs.find(d=>d.site==='nsu').semester,7);
  await respond('Department',{},503);
  assert.deepEqual(updates.at(-1).failed,['department']);
  await respond('Helper_PF_NSU',{files:[{path:'2/book.pdf',section:'2 семестр',group:'Оптика',view:'https://books.hyle.space/book.pdf'}]});
  await respond('sites.json',[{id:'home:test',site:'home',kind:'site',url:'https://hyle.space/',title:'Home'}]);
  const result=await loaded;
  assert.equal(result.pending,0);
  assert.deepEqual(result.failed,['department']);
  assert.deepEqual(result.docs.slice(0,3).map(d=>d.site),['home','helper','nsu'],'priority must not depend on response order');
  const book=result.docs.find(d=>d.site==='helper');
  assert.equal(book.semester,2);assert.equal(book.subject,'Оптика');
  assert.equal(book.file,'https://books.hyle.space/book.pdf');
  assert.equal(updates[0].pending,4,'previous snapshots stay immutable');
});
