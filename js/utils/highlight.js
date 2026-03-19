/** highlight.js — Prism.js 语法高亮 */

function highlightAll() {
  if (typeof Prism !== 'undefined') {
    document.querySelectorAll('pre code').forEach(el => Prism.highlightElement(el));
  }
}
