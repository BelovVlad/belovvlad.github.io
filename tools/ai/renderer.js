import MarkdownIt from 'markdown-it';
import texmath from 'markdown-it-texmath';
import katex from 'katex';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';
import python from 'highlight.js/lib/languages/python';
import javascript from 'highlight.js/lib/languages/javascript';
import cpp from 'highlight.js/lib/languages/cpp';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
for (const [name, language] of Object.entries({python, javascript, cpp, bash, json})) hljs.registerLanguage(name, language);

export function sourceLink(source) {
  const roots = {helper: 'Helper_PF_NSU/viewer/', department: 'Department/viewer/',
    'nsu-y4s1': 'NSU_FP_Y4_S1/docs/', nsu: 'NSU_FP_Y4_S1/docs/'};
  const path = source?.book;
  const site = source?.site || 'helper'; // old saved Helper answers did not always include site
  if (!roots[site] || typeof path !== 'string' || path.includes('\\') ||
      path.split('/').some(p => !p || p === '..' || p.startsWith('.'))) return null;
  const ext = path.split('.').at(-1).toLowerCase();
  const position = ext === 'pdf' ? 'page' : ext === 'ipynb' ? 'cell' : 'line';
  const reader = ext === 'pdf' ? 'pdfjs/viewer.html' : ext === 'ipynb' ? 'notebook/viewer.html' : 'notebook/code.html';
  let file = site.startsWith('nsu') ? path : 'files/' + path;
  if (site === 'helper' && ext === 'pdf') file = 'https://books.hyle.space/' + path.split('/').map(encodeURIComponent).join('/');
  const url = new URL(roots[site] + reader, 'https://hyle.space/');
  url.search = new URLSearchParams({file, title: String(source.title || path.split('/').at(-1)),
    [position]: String(Math.max(1, Number.parseInt(source.page, 10) || 1))});
  return url.href;
}

const md = new MarkdownIt({html: false, breaks: false, linkify: false, typographer: false,
  highlight(code, language) {
    if (code.length > 30000 || !hljs.getLanguage(language)) return '';
    try { return hljs.highlight(code, {language, ignoreIllegals: true}).value; } catch { return ''; }
  }
});
md.use(texmath, {engine: {renderToString(tex, options) {
  // No shared user macros, trusted commands, external resources or unbounded expansion.
  if (tex.length > 12000) return md.utils.escapeHtml(tex);
  return katex.renderToString(tex, {...options, macros: {}, trust: false, strict: 'ignore',
    maxExpand: 200, maxSize: 20, throwOnError: false});
}}, delimiters: ['dollars', 'brackets']});
md.renderer.rules.image = (tokens, i) => md.utils.escapeHtml(tokens[i].content); // no tracking images
const linkOpen = md.renderer.rules.link_open || ((tokens, i, options, env, self) => self.renderToken(tokens, i, options));
md.renderer.rules.link_open = (tokens, i, options, env, self) => {
  tokens[i].attrSet('rel', 'noopener noreferrer');
  return linkOpen(tokens, i, options, env, self);
};
// Citation references are inline tokens, never substitutions inside HTML, math or code.
md.inline.ruler.before('link', 'hyle_citation', (state, silent) => {
  if (state.linkLevel || state.src[state.pos] !== '[') return false;
  let end = state.pos + 1;
  while (end < state.posMax && end - state.pos <= 4 && state.src[end] >= '0' && state.src[end] <= '9') end++;
  if (end === state.pos + 1 || state.src[end] !== ']' || ['(', '['].includes(state.src[end + 1])) return false;
  const number = Number(state.src.slice(state.pos + 1, end));
  const source = state.env.sources?.[number - 1];
  const href = sourceLink(source);
  if (!source || !href) return false;
  if (!silent) {
    const token = state.push('hyle_citation', 'a', 0);
    token.content = String(number); token.meta = {href};
  }
  state.pos = end + 1;
  return true;
});
md.renderer.rules.hyle_citation = (tokens, i) => `<a class="ai-cite" rel="noopener noreferrer" href="${md.utils.escapeHtml(tokens[i].meta.href)}">[${tokens[i].content}]</a>`;

export function renderAnswer(text, sources = []) {
  // Always parse the accumulated source: incomplete fences/math remain harmless text until closed.
  // Raw HTML is disabled before the final sanitization, including restored localStorage messages.
  return DOMPurify.sanitize(md.render(String(text).slice(0, 150000), {sources}), {
    USE_PROFILES: {html: true, mathMl: true, svg: true},
    FORBID_TAGS: ['img', 'style', 'script', 'iframe', 'object', 'embed', 'form', 'input'],
    FORBID_ATTR: ['id', 'name'], ALLOW_DATA_ATTR: false
  });
}
