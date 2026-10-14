import { readPreference, writePreference } from './preferences.js';

let language=readPreference('language')==='en'?'en':'ja';
// Japanese source strings keep the small UI catalog readable without a framework.
const en={
  '計算方式':'Physics backend',
  '準備中':'Coming soon','GitHubリポジトリ':'GitHub repository','GitHubリポジトリ（公開準備中）':'GitHub repository (not published yet)',
  'ツールで表示を自動切替':'Auto mask visibility',
  '塗る・消す・輪郭では表示、つかむ・移動揺れ・画面移動では非表示。グループを移る時だけ切り替えます。':'Show for Paint/Eraser/Select; hide for Grab/Inertia/Pan. Changes only between groups.',
  'ブラシの右ドラッグは消しゴムとして使えます。':'Right-drag in Brush temporarily erases.',
  '右ドラッグで移動揺れを使えます。':'Right-drag to move the canvas with inertia.',
  '揺れ':'Motion','材質':'Material',
  'WASMが利用できない場合はJavaScriptで計算します。':'Uses JavaScript if WASM is unavailable.',
  'プレビューの範囲と背景で保存します。':'Exports use the frame and background shown above.',
  '動画はWebMまたはMP4、静止画はPNGで保存します。':'Videos use WebM or MP4; still images use PNG.',
  '編集データを保存できませんでした: {error}':'Could not save project: {error}',
  '編集を保存':'Save project','編集を開く':'Open project','前の編集を復元':'Restore previous edit','編集データ':'Project',
  '編集データの形式が正しくありません':'Invalid project file','編集データは128MB以下にしてください':'Project files must be 128 MB or smaller',
  '前の編集を復元しました':'Previous edit restored','編集データを保存しました':'Project saved','編集データを開きました':'Project opened','編集データを開けませんでした: {error}':'Could not open project: {error}',
  '元に戻しました':'Undone','やり直しました':'Redone',
  '背景の倍率':'Background scale','書き出しプレビュー':'Export preview',
  '書き出し範囲':'Export frame','前景に合わせる':'Fit foreground','背景に合わせる':'Fit background','前景・背景のどちらに保存範囲を合わせるか選べます。':'Choose whether to fit the saved frame to the foreground or background.',
  '移動する対象':'Pan target','キャンバス':'Canvas','背景':'Background','ドラッグで背景を移動':'Drag to reposition the background','背景は1本指・マウスで位置、スクロールで倍率を調整。Space・2本指は常にキャンバス全体を移動します。':'Drag with one finger or a mouse to reposition the background; scroll to resize it. Space or two fingers always pan the whole canvas.',
  '利用規約':'Terms of Use','プライバシーポリシー':'Privacy Policy',
  'ツールの表示':'Tool visibility','上の操作も一緒に隠す':'Hide the top row too',
  'ツールを隠す':'Hide tools','ツールを表示':'Show tools','隠す':'Hide','再表示':'Show',
  'サイズ':'Size',
  '戻す':'Undo','やり直し':'Redo','開く':'Open','メニュー':'Menu','リセット':'Reset','マスク設定':'Mask settings','操作の円':'Cursor circle','マスク操作':'Mask controls','サンプル':'Samples',
  '表示・画像・ヘルプ':'View, image & help','選択中のツール設定':'Active tool settings','調整する項目':'Parameter','ピンチで拡大・移動':'Pinch to zoom and pan','詳細':'Details','言語・サンプル':'Language & sample','表示':'View','拡大・縮小':'Zoom','揺れ設定':'Motion','設定':'Settings',
  'ぬるぷる':'Nurupuru','塗る。触れる。':'Paint. Touch. ','やわらかく動かす。':'Make it move.',
  'デモ':'Demo','輪郭線あり':'Outlined','輪郭に沿って選びやすいサンプル':'A sample with a clear outline','シンプル':'Plain','なめらかな形のサンプル':'A smooth sample',
  '画像を開く':'Open image','書き出し':'Export','塗る':'Paint','消す':'Erase','輪郭':'Select','つかむ':'Grab','移動揺れ':'Inertia','画面移動':'Pan','録画中':'Recording',
  '市松模様':'Checker','暗い背景':'Dark','白い背景':'White','? ヘルプ':'? Help','マスク表示中':'Mask visible','マスク非表示':'Mask hidden','マスクの表示':'Mask display',
  '動きやすさを色で表示':'Show movement strength','動かす範囲を単色で表示':'Show a single color','0 固定':'0 Fixed','255 動きやすい':'255 Free','表示の濃さ':'Overlay opacity',
  'ここに画像をドロップ':'Drop an image here','ブラシ':'Brush','ドラッグで塗る・クリックで1回塗る':'Drag to paint · click to dab','ドラッグで消す・クリックで1回消す':'Drag to erase · click to erase once','揺らす':'Animate','停止':'Stop','軽量メッシュ':'Light mesh','全体':'Fit',
  'ツール設定':'Tools','揺らし方':'Motion','材質・反動':'Material','ブラシ設定':'Brush settings','消しゴム設定':'Eraser settings','消しゴム':'Eraser',
  '画像をなぞって動かす範囲を塗ります。マスクボタンで表示を切り替えられます。':'Paint the areas you want to move. Use the mask button to change overlay visibility.',
  'ブラシサイズ':'Brush size','動きやすさ':'Movement strength','塗り重ねても中心の値は変わりません。境界はなめらかにつながります。':'Repeated strokes keep the chosen strength. Edges blend smoothly.',
  '画像全体を塗る':'Fill image','マスクを消去':'Clear mask','色は動きやすさを示します。表示の濃さはキャンバス右上から変更できます。':'Color shows movement strength. Adjust overlay opacity at the top right.',
  'つかみ設定':'Grab settings','塗った部分をドラッグして引っぱります。離すとバネの反動で揺れます。':'Drag a painted area to pull it. Release to let it recoil.',
  'つかむ範囲':'Grab radius','キャンバス上の円がつかむ範囲です。':'The circle shows your grab radius.','力の分布':'Falloff','1乗':'Linear','2乗':'Quadratic','正規分布（σ=半径/2）':'Gaussian (σ = radius / 2)',
  '中心からの力の弱まり方を選びます。正規分布は円の外側にも弱い力が続きます。':'Choose how force fades from the center. Gaussian extends weakly beyond the circle.',
  '追従力':'Grip strength','高くすると指についてきやすくなります。':'Higher values follow your pointer more closely.','揺れそのものの材質・戻る速さは':'Adjust softness and return speed in','「材質・反動」':'Material','で調整できます。':'.',
  '輪郭フィット':'Select region','輪郭設定':'Selection settings','画像をクリックして領域を選択します。透過画像でも色選択が使えます。':'Click inside an area to select it. Color selection also works on transparent images.',
  '判定方法':'Selection method','自動で選択':'Automatic','透過境界':'Transparency','色の近さ':'Similar color','色の許容幅':'Color tolerance','ブラシで微調整':'Refine with brush',
  '画面全体をドラッグして動かします。移動・停止時の加速度がマスク内に伝わり、慣性で揺れます。':'Drag the view. Acceleration and stopping make painted areas sway with inertia.',
  '画像を直接つかむ操作ではありません。局所的に引っぱるには':'To pull a local area, choose','G「つかむ」':'Grab (G)','を選んでください。':'.',
  '画像を動かさず、表示位置だけ変更します。ホイール・ピンチで拡大縮小、0で全体表示。':'Move the view. Scroll or pinch to zoom; press 0 to fit.',
  'ブラシの詳細設定':'Brush options','ペンの筆圧':'Pen pressure','ブラシサイズに反映します':'Changes brush size',
  '好きな動きを選び、「▶ 揺らす」でプレビューできます。':'Choose a motion, then press Animate to preview.',
  '強さ':'Strength','速さ':'Speed','強さは画像幅に対する割合です。':'Strength is relative to image width.','柔らかい設定では大きく伸びる場合があります。':'Soft materials may stretch a lot at high strength.',
  '材質と反動':'Material and recoil','材質を選んで、やわらかさと余韻を調整します。':'Choose a material, then adjust softness and recoil.',
  '標準':'Standard','硬め':'Firm','やわらかめ':'Soft','やわらかさ':'Softness','小さくすると硬く、大きくすると柔らかくなります。':'Lower is stiffer; higher is softer.',
  '面積を保つ':'Keep area','高くすると形がつぶれにくくなります。':'Higher values resist compression.','戻る速さ':'Return speed','減衰':'Damping',
  '小さくすると余韻が長く、大きくすると早く静まります。':'Lower values keep motion going; higher values settle sooner.','範囲外の固定力':'Outside anchoring','高くすると塗っていない部分が動きにくくなります。':'Higher values hold unpainted areas more firmly.',
  '計算品質':'Quality','メッシュの細かさ':'Mesh density','軽量 · 約1,100点':'Light · ~1,100 nodes','標準 · 約2,400点':'Standard · ~2,400 nodes','高密度 · 約4,600点':'Fine · ~4,600 nodes',
  '計算頻度':'Simulation rate','240 Hz · 軽量':'240 Hz · Light','360 Hz · 標準':'360 Hz · Standard','600 Hz · 精密':'600 Hz · Precise','反復上限':'Iteration limit',
  '2回':'2 iterations','4回':'4 iterations','6回':'6 iterations','8回':'8 iterations','大きくすると精度が上がり、負荷が増えます。':'Higher values improve accuracy and require more work.',
  '画像のなめらかさ':'Image filtering','なめらか':'Smooth','くっきり':'Sharp','計測待機':'Waiting for measurements','待機':'Idle',
  'キーボード操作・ヘルプ ⌄':'Shortcuts ⌄','画面移動＋慣性':'Pan with inertia','マスク':'Mask','自動揺れ ON/OFF':'Toggle animation','全体表示':'Fit view','+ ドラッグ 移動':'+ drag to pan','元に戻す':'Undo','やり直す':'Redo','画像はブラウザ内で処理します。':'Images stay in your browser.',
  '操作ヘルプ':'Help','各ツールの使い方とショートカットを確認できます。':'Tools and keyboard shortcuts.','ブラシ・消しゴム（B / E）':'Brush / Eraser (B / E)',
  '指定した動きやすさ（0〜255）を塗ります。0は強く固定、255は動きやすい状態。低い値でも上塗りできます。消しゴムは0に戻します。青→黄→赤で値を表示し、表示の濃さは動きに影響しません。':'Paint movement strength from 0 (fixed) to 255 (free). Paint lower values to strengthen anchoring. Erasing restores 0. Blue → yellow → red shows strength; overlay opacity does not affect motion.',
  '輪郭フィット（F）':'Select region (F)','選びたい物体の内側をクリック・タップして離すと、輪郭に沿ってマスクを追加します。':'Click or tap inside an object to add its region to the mask.',
  'つかむ（G）':'Grab (G)','マスクを塗った部分をドラッグして引っぱります。離すと反動で揺れます。「力の分布」で1乗・2乗・正規分布を選べます。':'Drag a painted area, then release to let it recoil. Choose linear, quadratic or Gaussian falloff.',
  '移動揺れ（V）':'Inertia (V)','画面をドラッグすると、移動・停止の加速度で画像が揺れます。':'Drag the view to make painted areas respond to acceleration and stopping.',
  '画面移動・ズーム（H / Space）':'Pan / Zoom (H / Space)','Hで移動ツールを選び、対象をキャンバス・背景から選べます。ドラッグで移動、スクロールで選択した対象を拡大縮小。Space＋ドラッグ・2本指は常にキャンバス全体の移動・ズームです。':'Use H to select Pan, then choose Canvas or Background. Drag to move and scroll to zoom the selected target. Space-drag or two fingers always pan and zoom the whole canvas.',
  '揺らし方・材質':'Motion / Material','「揺らし方」で自動揺れの種類・強さ・速さ、「材質・反動」でやわらかさ・減衰・固定力を調整。「▶ 揺らす」（P）で自動揺れを開始・停止します。':'Motion sets the pattern, strength and speed. Material sets softness, damping and anchoring. Press Animate (P) to start or stop.',
  '表示・やり直し':'Display / Undo','ヘルプ横でテーマ・背景・操作範囲の円を切り替えます。↻で変形をリセット。Mでマスク表示、0で全体表示。Ctrl / ⌘ + Zで元に戻す、Ctrl / ⌘ + Shift + Zでやり直す。1 / 2 / 3で設定タブを切り替えます。':'Use the toolbar to change theme, background and cursor. Reset deformation with ↻. M toggles the mask; 0 fits the view. Ctrl / ⌘ + Z undoes; Shift + Z redoes. 1 / 2 / 3 switch settings tabs.',
  'アニメーションを書き出す':'Export animation','表示領域ではなく、元画像の比率で保存します。':'Exports use the source image aspect ratio.','画像データはブラウザから送信されません。':'Image data stays in your browser.',
  '形式':'Format','動画':'Video','静止画 PNG':'Still PNG','動画はWebMまたはMP4で保存します。':'Videos use WebM or MP4.','最大解像度（長辺）':'Resolution (long edge)','元サイズ（最大2800 px）':'Original (up to 2800 px)','録画時間':'Duration','3秒':'3 s','5秒':'5 s','8秒':'8 s','背景色':'Background','透明（PNG向け）':'Transparent (PNG)','白':'White','ダーク':'Dark',
  'プレビュー中の動きも動画として記録できます。':'Record the motion you see in the preview.','書き出しを開始':'Start export','選択中のサンプルを読み込む':'Load the selected demo','デモの種類を選ぶ':'Choose a demo','デモの種類':'Demo variants','元に戻す Ctrl+Z':'Undo Ctrl+Z','やり直す Ctrl+Shift+Z':'Redo Ctrl+Shift+Z','編集ツール':'Tools',
  '塗る (B)':'Paint (B)','ブラシ (B)':'Brush (B)','消す (E)':'Erase (E)','消しゴム (E)':'Eraser (E)','輪郭フィット (F)':'Select region (F)','つかんで揺らす (G)':'Grab and move (G)','つかむ (G)':'Grab (G)',
  '移動揺れ (V)：画面を動かし、慣性で揺らす':'Inertia (V): move the view to shake the image','移動揺れ：画面移動＋慣性 (V)':'Inertia: pan with acceleration (V)','画面を移動 (H / Space)':'Pan (H / Space)','画面を移動 (H)':'Pan (H)',
  '表示とヘルプ':'Display and help','テーマ':'Theme','キャンバス背景':'Canvas background','操作範囲の円を非表示にする':'Hide cursor circle','操作範囲の円を表示する':'Show cursor circle','マスク操作を非表示にする':'Hide mask controls','マスク操作を表示する':'Show mask controls','画像編集キャンバス':'Image canvas','マスクの表示切り替え (M)':'Toggle mask (M)','マスクを非表示にする':'Hide mask','マスクを表示する':'Show mask','マスクの表示設定':'Mask display settings',
  'ミント':'Mint','シアン':'Cyan','イエロー':'Yellow','ピンク':'Pink','ラベンダー':'Lavender','好きな色に変更':'Choose a color','自由なマスク色':'Custom mask color','自動で揺らす (P)':'Animate (P)','自動揺れを止める (P)':'Stop animation (P)','変形をリセット':'Reset deformation','縮小':'Zoom out','拡大':'Zoom in','等倍':'Actual size','全体表示 (0)':'Fit view (0)','編集設定':'Settings','表示する設定':'Settings tabs','ヘルプを閉じる':'Close help','閉じる':'Close',
  'なぞった部分を動きやすさ 0 に戻します。':'Restore movement strength to 0 and clear the overlay.','なぞった部分を指定した動きやすさにします。低い値で上塗りすると固定を強められます。':'Paint the chosen strength. Lower values strengthen anchoring.',
  '塗った部分を引っぱる':'Drag a painted area','画面を移動して慣性でぷるぷるさせる':'Move the view to create inertia','画像内をクリックして選択':'Click inside an area to select','移動':'Pan','ドラッグでキャンバスを移動':'Drag to pan',
  'ひとつ前のマスクに戻しました':'Mask undone','マスクをやり直しました':'Mask redone','画像全体を動きやすさ {value} にしました':'Filled the image with strength {value}',
  '画像に透明境界がありません。「色の近さ」を選択してください':'No transparent boundary. Try Similar color.','透明な部分です。選択したい物体の内側をクリックしてください':'This area is transparent. Click inside an object.',
  '広い範囲が選ばれています。色の許容幅を下げてください':'Too much is selected. Reduce color tolerance.','輪郭を抽出できませんでした。許容幅を調整するかブラシをお試しください':'No region found. Adjust tolerance or try the brush.',
  '{method}から {value}% の範囲を追加しました':'Added {value}% using {method}',
  'PNG / JPEG / WebP の静止画像を選択してください':'Choose a PNG, JPEG or WebP image','画像は45MB以下にしてください':'Choose an image under 45 MB','画像サイズが小さすぎます':'The image is too small',
  '読み込みました。負荷軽減のため長辺を{limit}px以下に縮小しました。':'Loaded and resized to at most {limit} px on the long edge.','読み込みました。動かしたい部分を塗ってください。':'Loaded. Paint the areas you want to move.','画像を読み込めませんでした: {error}':'Could not load the image: {error}',
  'PNGを書き出しました':'PNG exported','PNGの作成に失敗しました':'Could not create the PNG','このブラウザは動画録画に対応していません。PNGをお試しください':'Video recording is unavailable. Try PNG.',
  '対応する動画エンコーダが見つかりません':'No supported video encoder','録画エラーが発生しました':'Recording failed','動画を書き出しました':'Video exported','録画データがありませんでした':'No recording data','録画を停止':'Stop recording','{size} px · 録画中…':'{size} px · Recording…','録画を開始できませんでした: {error}':'Could not start recording: {error}','録画が終了しました。':'Recording finished.',
  '計算時間  {ms} ms\n最大反復  {iterations} 回 / 上限 {limit} 回\n計算精度  {status}{error}':'Physics  {ms} ms\nIterations  {iterations} / {limit}\nConvergence  {status}{error}',
  '目標に到達':'Converged','上限で終了':'Iteration limit reached','\nリセットしてください':'\nPlease reset','録画中 {elapsed} / {duration} 秒':'Recording {elapsed} / {duration} s','{value} Hz目安':'~{value} Hz','{value} 点 · {cols}×{rows}':'{value} nodes · {cols}×{rows}',
  'この計算方式は利用できません: {error}':'This backend is unavailable: {error}','変形だけをリセットしました':'Deformation reset','エラー: {error}':'Error: {error}','不明':'Unknown','GPUコンテキストが失われました。再読み込みしてください。':'GPU context lost. Reload the page.','起動できませんでした':'Could not start',
  'WebGL2 を初期化できませんでした。GPUが有効な対応ブラウザで開いてください。':'Could not initialize WebGL2. Use a supported browser with GPU acceleration.',
  '角度':'Angle','揺れ方の向きを回転します。0°は元の向きです。':'Rotate the motion direction. 0° keeps its original orientation.','Pulseは放射状のため、角度は変わりません。':'Pulse is radial, so angle has no effect.','角度をリセット':'Reset angle',
  'ゆっくり左右に往復。':'A gentle side-to-side sway.','上下に弾む。':'An up-and-down bounce.','中心から伸縮。':'Expand and contract from the center.','細かく素早く振動。':'Quick, fine vibrations.',
  '時計回りの円運動。':'A simple clockwise circle.','反時計回りの円運動。':'A simple counterclockwise circle.',
  'Circleの開始角度を変えます。':"Set the circle's starting angle.",
  '揺れ方の種類':'Motion patterns','背景画像':'Background image','画像を選ぶ…':'Choose image…','背景画像を削除':'Remove background image','背景画像を読み込みました':'Background loaded','背景画像を削除しました':'Background removed','背景画像がありません':'Load a background image first',
  '背景画像は変形せず、前景の後ろに表示します。位置は移動ツールで調整できます。':'The background stays behind the foreground without deforming. Reposition it with Pan.','言語 / Language':'Language',
};
const originals=new WeakMap(),attributes=new WeakMap();
export const getLanguage=()=>language;
export function setLanguage(value){language=value==='en'?'en':'ja';writePreference('language',language);}
export function t(source,values={}){
  const text=language==='en'?(en[source]??source):source;
  return text.replace(/\{(\w+)\}/g,(match,key)=>values[key]??match);
}
export function translateUI(root=document){
  const walker=document.createTreeWalker(root.body||root,NodeFilter.SHOW_TEXT);
  for(let node=walker.nextNode();node;node=walker.nextNode()){
    if(node.parentElement.closest('script,style,[data-i18n-skip]'))continue;
    if(!originals.has(node))originals.set(node,node.textContent);
    const source=originals.get(node),trimmed=source.trim();
    node.textContent=source.replace(trimmed,t(trimmed));
  }
  for(const element of (root.body||root).querySelectorAll('[title],[aria-label]')){
    let saved=attributes.get(element);if(!saved){saved={};attributes.set(element,saved);}
    for(const name of ['title','aria-label'])if(element.hasAttribute(name)){
      saved[name]??=element.getAttribute(name);element.setAttribute(name,t(saved[name]));
    }
  }
  document.documentElement.lang=language;
  document.title=language==='ja'?'ぬるぷる | Nurupuru':'Nurupuru';
}
