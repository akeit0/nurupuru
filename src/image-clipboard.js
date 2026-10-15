// Native paste on desktop; explicit clipboard reads from mobile buttons.
export function initImageClipboard({ loadImage, loadBackground, toast, t, isBlocked }) {
  const buttons = ['btnPasteImage', 'btnPasteBackground'].map(id => document.getElementById(id));
  const destination = document.getElementById('pasteDestination');
  let reading = false;

  async function readImage(background) {
    if (reading) return;
    if (!navigator.clipboard?.read) {
      toast(t('このブラウザでは貼り付けできません。画像選択をお使いください。'));
      return;
    }
    reading = true;
    try {
      const request = navigator.clipboard.read();
      for (const button of buttons) button.disabled = true;
      const items = await request;
      for (const item of items) {
        const type = item.types.find(type => /^image\/(png|jpeg|webp)$/.test(type));
        if (!type) continue;
        const blob = await item.getType(type);
        const extension = type === 'image/jpeg' ? 'jpg' : type.split('/')[1];
        const file = new File([blob], 'pasted-' + (background ? 'background' : 'image') + '.' + extension, { type });
        await (background ? loadBackground(file) : loadImage(file));
        return;
      }
      toast(t('クリップボードに画像がありません。画像そのものをコピーしてください。'));
    } catch {
      toast(t('貼り付けできませんでした。画像選択をお使いください。'));
    } finally {
      reading = false;
      for (const button of buttons) button.disabled = false;
    }
  }
  buttons[0].onclick = () => readImage(false);
  buttons[1].onclick = () => readImage(true);

  window.addEventListener('paste', event => {
    const target = event.target;
    if (event.defaultPrevented || reading || isBlocked() || target?.isContentEditable ||
        target?.closest?.('textarea,[role="textbox"],input:not([type]),input:is([type=text],[type=search],[type=password],[type=email],[type=url],[type=number],[type=tel])')) return;
    const data = event.clipboardData;
    const file = [...data?.files || []].find(file => file.type.startsWith('image/')) ||
      [...data?.items || []].find(item => item.kind === 'file' && item.type.startsWith('image/'))?.getAsFile();
    if (!file) return;
    event.preventDefault();
    void (destination.value === 'background' ? loadBackground(file) : loadImage(file));
  });
}
