import { t, getLanguage } from './i18n.js';

// Move existing controls, preserving their listeners and values at every size.
// The quick slider sends input to the original control so there is one settings path.
export function initEditorLayout({params,setWorkspace,requestRedraw}){
  const $=id=>document.getElementById(id),compact=matchMedia('(max-width: 810px), (max-height: 500px) and (pointer: coarse)');
  const inspector=$('inspector'),settings=$('settingsSheet'),view=$('viewSheet'),maskSheet=$('maskSheet');
  const workspace=document.querySelector('.workspace'),footer=document.querySelector('.footer-left');
  const [motion,material]=[['btnMotionDetails','揺れ'],['btnMaterialDetails','材質']].map(([id,label])=>{
    const button=document.createElement('button');button.id=id;button.type='button';button.className='footer-btn mobile-only';button.textContent=label;button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls','settingsSheet');footer.append(button);return button;
  });
  const toggle=document.createElement('button');toggle.id='btnInspector';toggle.type='button';toggle.className='footer-btn desktop-only';toggle.textContent='設定';toggle.setAttribute('aria-controls','inspector');toggle.setAttribute('aria-expanded','true');document.querySelector('.footer-right').append(toggle);
  const iconLabels={btnUndo:'戻す',btnRedo:'やり直し',btnUpload:'画像を選択',btnExport:'書き出し',btnViewMenu:'メニュー',btnResetMotion:'リセット',maskToggle:'マスク',maskColorButton:'マスク設定',cursorToggle:'操作の円',maskControlsToggle:'マスク操作'};
  for(const [id,label] of Object.entries(iconLabels)){const span=document.createElement('span');span.className='mobile-icon-label mobile-only';span.textContent=label;$(id).append(span);}
  for(const button of document.querySelectorAll('[data-mask-color]')){const span=document.createElement('span');span.className='mobile-only';span.textContent=button.title;button.append(span);}
  // Short, frequent choices are direct on mobile. Longer or occasional lists keep
  // their dropdowns so sheets stay compact. The original inputs remain authoritative.
  const choices=[...document.querySelectorAll('#language,#theme,#maskView,#renderMode')].map(source=>{
    source.classList.add('native-choice');const group=document.createElement('div');group.className='mobile-choices mobile-only';group.dataset.select=source.id;group.setAttribute('role','group');
    const label=document.querySelector(`label[for="${source.id}"]`),captionSource=source.getAttribute('aria-label');let caption=null;
    if(label){label.id||=(source.id+'Label');group.setAttribute('aria-labelledby',label.id);}
    else if(captionSource){caption=document.createElement('span');caption.className='choice-caption';caption.id=source.id+'Label';caption.textContent=captionSource;group.append(caption);group.setAttribute('aria-labelledby',caption.id);}
    if(source.id==='language')group.setAttribute('data-i18n-skip','');
    const buttons=[...source.options].map(option=>{const button=document.createElement('button');button.type='button';button.dataset.value=option.value;button.onclick=()=>{source.value=option.value;source.dispatchEvent(new Event('change',{bubbles:true}));};group.append(button);return {button,option};});
    source.after(group);source.addEventListener('change',syncChoices);
    return {source,group,buttons,caption,captionSource};
  });
  function syncChoices(){
    for(const {source,buttons,caption,captionSource} of choices){
      if(caption)caption.textContent=t(captionSource);
      for(const {button,option} of buttons){button.textContent=option.label.trim();button.disabled=source.disabled||option.disabled;button.setAttribute('aria-pressed',String(source.value===option.value));}
    }
  }
  const optionObserver=new MutationObserver(syncChoices);for(const {source} of choices)optionObserver.observe(source,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled']});
  for(const button of document.querySelectorAll('[data-export-format]'))button.addEventListener('click',syncChoices);
  toggle.onclick=()=>{const collapsed=workspace.classList.toggle('inspector-collapsed');inspector.inert=collapsed;toggle.setAttribute('aria-expanded',String(!collapsed));};
  const relocations=[
    [inspector,settings],[$('language'),$('viewPreferences')],
    [choices.find(choice=>choice.source.id==='language').group,$('viewPreferences')],
    [document.querySelector('.demo-wrap'),$('viewPreferences')],
    [document.querySelector('.stage-actions'),$('viewAppearance')],
    [$('documentActions'),$('viewDocuments')],
    [$('appInfo'),$('viewAppInfo')],
    [document.querySelector('.footer-right'),$('viewZoom')],[$('maskPalette'),maskSheet],
    [$('maskFloating'),footer],
    ...[...document.querySelectorAll('#demoMenu [data-demo]')].map(node=>[node,$('viewSamples')]),
  ].map(([node,target])=>{const home=document.createComment('editor control home');node.before(home);return {node,target,home};});
  function openDetails(group='paint'){
    dismissPalette();
    setWorkspace(group);if(compact.matches){if(!settings.open)settings.showModal();}
    else {workspace.classList.remove('inspector-collapsed');inspector.inert=false;toggle.setAttribute('aria-expanded','true');$('tab'+group[0].toUpperCase()+group.slice(1)).focus();}
  }
  $('btnToolDetails').onclick=()=>openDetails('paint');motion.onclick=()=>openDetails('motion');material.onclick=()=>openDetails('material');
  $('btnSheetPlay').onclick=()=>$('btnPlay').click();
  function dismissPalette(){maskSheet.close();$('maskPalette').hidden=true;$('maskColorButton').setAttribute('aria-expanded','false');}
  $('btnViewMenu').onclick=()=>{dismissPalette();view.showModal();};$('closeViewSheet').onclick=()=>view.close();$('closeSettings').onclick=()=>settings.close();
  view.addEventListener('close',()=>{$('demoMenu').hidden=true;$('btnDemoMenu').setAttribute('aria-expanded','false');});
  view.addEventListener('click',event=>{if(event.target.closest('[data-demo],#btnDemo'))view.close();});
  $('maskColorButton').addEventListener('click',event=>{if(!compact.matches)return;event.stopImmediatePropagation();$('maskPalette').hidden=false;$('maskColorButton').setAttribute('aria-expanded','true');maskSheet.showModal();},true);
  $('closeMaskSheet').onclick=()=>maskSheet.close();maskSheet.addEventListener('close',dismissPalette);
  for(const sheet of [settings,view,maskSheet,$('legalSheet')]){
    sheet.addEventListener('close',requestRedraw);
    sheet.addEventListener('keydown',event=>{
      if(event.key!=='Tab')return;
      const stops=[...sheet.querySelectorAll('button,input,select,summary,a[href],[tabindex]')].filter(node=>!node.disabled&&node.tabIndex>=0&&node.getClientRects().length);
      const first=stops[0],last=stops.at(-1),active=document.activeElement;
      if(first&&(!sheet.contains(active)||(event.shiftKey?active===first:active===last))){event.preventDefault();(event.shiftKey?last:first).focus();}
    });
    // Pointer-down outside the sheet dismisses it; drags within settings keep it open.
    sheet.addEventListener('pointerdown',event=>{if(event.target!==sheet)return;const r=sheet.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)sheet.close();});
  }
  // A native dialog lives above custom help; close it before opening help.
  $('btnHelp').addEventListener('click',()=>{if(view.open){view.close();$('btnViewMenu').focus();}},true);
  let brushParameter='brushSize',quickKey=null;
  let bottomHidden=false;
  function syncBottomTools(){
    const hideTop=compact.matches&&bottomHidden&&$('hideTopWithTools').checked;
    workspace.classList.toggle('bottom-tools-hidden',bottomHidden);
    workspace.classList.toggle('top-tools-hidden',hideTop);footer.parentElement.inert=hideTop;
    const label=t(bottomHidden?'ツールを表示':'ツールを隠す');$('btnBottomTools').setAttribute('aria-expanded',String(!bottomHidden));$('btnBottomTools').setAttribute('aria-label',label);$('btnBottomTools').title=label;
    $('bottomToolsToggleText').textContent=t(bottomHidden?'再表示':'隠す');
    $('quickControls').inert=compact.matches&&bottomHidden;
    for(const button of document.querySelectorAll('.rail .tool'))button.inert=compact.matches&&bottomHidden;
  }
  $('btnBottomTools').onclick=()=>{bottomHidden=!bottomHidden;syncBottomTools();requestRedraw();};
  $('hideTopWithTools').addEventListener('change',()=>{syncBottomTools();requestRedraw();});
  const names={brushSize:'ブラシサイズ',brushStrength:'動きやすさ',grabRadius:'つかむ範囲',contourTolerance:'色の許容幅'};
  function sync(){
    $('btnSheetPlay').textContent=$('playIcon').textContent+' '+$('playText').textContent;
    $('btnSheetPlay').setAttribute('aria-pressed',String(params.autoPlaying));
    const keys=params.tool==='brush'?['brushSize','brushStrength']:params.tool==='erase'?['brushSize']:params.tool==='grab'?['grabRadius']:params.tool==='fit'?['contourTolerance']:[];
    quickKey=params.tool==='brush'?brushParameter:keys[0]||null;
    const group=$('quickParameters'),range=$('quickRange');
    // Keep selection stable while dragging and while localizing the editor.
    if([...group.children].map(o=>o.dataset.quick).join()!==keys.join())group.replaceChildren(...keys.map(key=>{const button=document.createElement('button');button.type='button';button.dataset.quick=key;button.onclick=()=>{if(params.tool==='brush')brushParameter=key;sync();};return button;}));
    for(const button of group.children){const key=button.dataset.quick,label=key==='brushSize'?t('サイズ'):key==='brushStrength'&&getLanguage()==='en'?'Movement':t(names[key]);button.replaceChildren(document.createTextNode(label));const output=document.createElement('small');output.textContent=$(key+'Out').textContent;button.append(output);button.setAttribute('aria-label',t(names[key]));button.setAttribute('aria-pressed',String(key===quickKey));}
    group.hidden=!quickKey;range.hidden=!quickKey;$('quickHint').hidden=!!quickKey||params.tool==='pan';$('quickPanTargets').hidden=params.tool!=='pan';
    if(quickKey){const source=$(quickKey);range.min=source.min;range.max=source.max;range.step=source.step||'1';range.value=source.value;range.setAttribute('aria-label',t(names[quickKey]));range.style.setProperty('--val',source.style.getPropertyValue('--val'));}
    syncChoices();
    syncBottomTools();
  }
  $('quickRange').addEventListener('input',()=>{if(!quickKey)return;const source=$(quickKey);source.value=$('quickRange').value;source.dispatchEvent(new Event('input',{bubbles:true}));});
  function adapt(){
    settings.close();view.close();dismissPalette();$('demoMenu').hidden=true;$('btnDemoMenu').setAttribute('aria-expanded','false');
    for(const {node,target,home} of relocations)if(compact.matches)target.append(node);else home.after(node);
    inspector.inert=!compact.matches&&workspace.classList.contains('inspector-collapsed');
    sync();
  }
  compact.addEventListener('change',adapt);adapt();
  return {sync,openDetails,viewInsets:()=>compact.matches?{top:bottomHidden&&$('hideTopWithTools').checked?0:footer.parentElement.getBoundingClientRect().height,bottom:bottomHidden?0:$('quickControls').getBoundingClientRect().height+document.querySelector('.rail').getBoundingClientRect().height}:{top:0,bottom:0}};
}
