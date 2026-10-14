import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { LEGAL, LEGAL_UPDATED, LEGAL_CONTACT, GITHUB_PRIVACY } from '../src/legal-content.js';

const escape=value=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function page(policy,appHref){
  const title=LEGAL.ja[policy].title+' / '+LEGAL.en[policy].title;
  const content=['ja','en'].map(language=>{
    const locale=LEGAL[language],doc=locale[policy];
    return `<section id="${language}" lang="${language}"><h2>${language==='ja'?'日本語':'English'}</h2><p>${escape(doc.intro)}</p><ol>${doc.clauses.map(([heading,text])=>`<li><strong>${escape(heading)}</strong><p>${escape(text)}</p></li>`).join('')}</ol><p>${escape(doc.closing)}</p>${policy==='privacy'?`<p><a href="${GITHUB_PRIVACY}" target="_blank" rel="noopener noreferrer">GitHub Privacy Statement</a></p>`:''}<p>${locale.updated}: <time datetime="${LEGAL_UPDATED}">${LEGAL_UPDATED}</time></p><p>${locale.contact}: <a href="${LEGAL_CONTACT}" target="_blank" rel="noopener noreferrer">GitHub Issues</a></p></section>`;
  }).join('\n');
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="light dark"><title>${escape(title)} | Nurupuru</title>
<style>*{box-sizing:border-box;touch-action:manipulation}body{margin:0;padding:24px max(20px,env(safe-area-inset-left)) 32px;color:#25283a;background:#f5f6fa;font:15px/1.8 system-ui,-apple-system,sans-serif}main{max-width:760px;margin:auto}h1{font-size:24px;line-height:1.5}h2{font-size:20px}nav{display:flex;flex-wrap:wrap;gap:16px}a{color:#6947ad;display:inline-flex;align-items:center;min-height:44px;overflow-wrap:anywhere}section{border-top:1px solid #d7dbe7;margin-top:24px;padding-top:8px;scroll-margin-top:12px}li{margin:16px 0}li p{margin:4px 0}ol{padding-left:24px}footer{border-top:1px solid #d7dbe7;margin-top:24px;padding-top:16px}a:focus-visible{outline:2px solid #8764ce;outline-offset:4px}@media(prefers-color-scheme:dark){body{background:#11151d;color:#edf0fa}a{color:#c4b4ff}section,footer{border-color:#3b4050}}</style></head><body><main><h1>${escape(title)}</h1><nav aria-label="言語 / Language"><a href="#ja">日本語</a><a href="#en">English</a><a href="${policy==='terms'?'privacy.html':'terms.html'}">${policy==='terms'?'プライバシーポリシー / Privacy Policy':'利用規約 / Terms of Use'}</a></nav>${content}<footer><a href="${appHref}">${escape(LEGAL.ja.back)} / ${escape(LEGAL.en.back)}</a></footer></main></body></html>
`;
}
export async function buildLegalPages(root){
  for(const policy of ['terms','privacy']){
    await writeFile(path.join(root,policy+'.html'),page(policy,'index.html'),'utf8');
    await writeFile(path.join(root,'dist',policy+'.html'),page(policy,'nurupuru.html'),'utf8');
  }
}
