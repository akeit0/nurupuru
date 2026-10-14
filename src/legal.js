import { getLanguage } from './i18n.js';
import { LEGAL, LEGAL_UPDATED, LEGAL_CONTACT, GITHUB_PRIVACY } from './legal-content.js';

export function initLegalUI(){
  const $=id=>document.getElementById(id),dialog=$('legalSheet');
  let policy='terms',language=getLanguage();
  const element=(tag,text)=>{const el=document.createElement(tag);el.textContent=text;return el;};
  function link(label,url){const el=element('a',label);el.href=url;el.target='_blank';el.rel='noopener noreferrer';return el;}
  function sync(){
    const locale=LEGAL[language],doc=locale[policy];dialog.lang=language;
    $('legalTitle').textContent=doc.title;$('closeLegal').setAttribute('aria-label',locale.close);
    for(const button of dialog.querySelectorAll('[data-policy]')){button.textContent=locale[button.dataset.policy].title;button.setAttribute('aria-pressed',String(button.dataset.policy===policy));}
    for(const button of dialog.querySelectorAll('[data-legal-language]'))button.setAttribute('aria-pressed',String(button.dataset.legalLanguage===language));
    const list=element('ol','');for(const [title,text] of doc.clauses){const item=element('li','');item.append(element('strong',title),element('p',text));list.append(item);}
    const body=$('legalCopy');body.replaceChildren(element('p',doc.intro),list,element('p',doc.closing));
    if(policy==='privacy')body.append(link('GitHub Privacy Statement',GITHUB_PRIVACY));
    body.append(element('p',`${locale.updated}: ${LEGAL_UPDATED}`));const contact=element('p',locale.contact+': ');contact.append(link('GitHub Issues',LEGAL_CONTACT));body.append(contact);body.scrollTop=0;
  }
  for(const button of document.querySelectorAll('[data-legal]'))button.addEventListener('click',()=>{
    policy=button.dataset.legal;language=getLanguage();sync();
    const parent=button.closest('dialog');if(parent?.open){parent.close();$('btnViewMenu').focus();}
    if(!dialog.open)dialog.showModal();
  });
  for(const button of dialog.querySelectorAll('[data-policy]'))button.onclick=()=>{policy=button.dataset.policy;sync();};
  for(const button of dialog.querySelectorAll('[data-legal-language]'))button.onclick=()=>{language=button.dataset.legalLanguage;sync();};
  $('closeLegal').onclick=()=>dialog.close();sync();
  return {syncLanguage(){language=getLanguage();sync();}};
}
