/* Textareas keep native editing/IME. Transparent mirrors paint only highlights. */
class LinkedEditors {
  constructor(input, output) {
    this.editors = [input, output]; this.expectedScroll = new WeakMap(); this.ranges = new Map();
    this.mirrors = new Map(); this.alignment = null;
    for (const editor of this.editors) {
      const viewport = document.createElement('div'); viewport.className = 'text-viewport';
      editor.replaceWith(viewport);
      const paint = document.createElement('div'); paint.className = 'link-paint'; paint.setAttribute('aria-hidden', 'true');
      const mirror = document.createElement('div'); mirror.className = 'link-mirror'; paint.append(mirror);
      viewport.append(paint, editor); this.mirrors.set(editor, mirror);
      editor.addEventListener('scroll', () => this.scroll(editor), { passive: true });
      for (const event of ['select', 'keyup', 'pointerup', 'selectionchange']) editor.addEventListener(event, () => this.scheduleSelection());
      editor.addEventListener('pointermove', event => { if (event.buttons) this.scheduleSelection(); });
    }
    document.addEventListener('selectionchange', () => this.scheduleSelection());
    this.resizeObserver = new ResizeObserver(() => this.refresh());
    for (const editor of this.editors) this.resizeObserver.observe(editor);
    this.refresh();
  }
  setAlignment(alignment, source, target) {
    this.alignment = alignment; this.source = source; this.target = target;
    this.ranges.clear(); this.refresh(); this.select();
  }
  clear() { this.alignment = null; this.ranges.clear(); this.refresh(); }
  refresh() {
    for (const editor of this.editors) {
      const mirror = this.mirrors.get(editor), style = getComputedStyle(editor);
      for (const property of ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'wordSpacing', 'textIndent', 'textTransform', 'tabSize', 'direction', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft']) mirror.style[property] = style[property];
      mirror.style.width = `${editor.clientWidth}px`;
      this.paint(editor, this.ranges.get(editor) || []);
      this.position(editor);
    }
  }
  paint(editor, ranges) {
    const mirror = this.mirrors.get(editor), text = editor.value;
    const fragment = document.createDocumentFragment(); let cursor = 0;
    for (const range of BaroAlignment.mergeRanges(ranges)) {
      const start = Math.min(text.length, range.start), end = Math.min(text.length, range.end);
      if (end <= start) continue;
      fragment.append(document.createTextNode(text.slice(cursor, start)));
      const mark = document.createElement('mark'); mark.textContent = text.slice(start, end); fragment.append(mark);
      cursor = end;
    }
    fragment.append(document.createTextNode(text.slice(cursor) + '\u200b'));
    mirror.replaceChildren(fragment);
  }
  position(editor) { this.mirrors.get(editor).style.transform = `translate(${-editor.scrollLeft}px, ${-editor.scrollTop}px)`; }
  scroll(editor) {
    this.position(editor);
    const expected = this.expectedScroll.get(editor);
    this.expectedScroll.delete(editor);
    if (expected !== undefined && Math.abs(editor.scrollTop - expected) < 1) return;
    const other = this.editors.find(item => item !== editor);
    const maximum = editor.scrollHeight - editor.clientHeight;
    if (maximum <= 0) return;
    const targetMaximum = Math.max(0, other.scrollHeight - other.clientHeight);
    const ratio = Math.min(1, Math.max(0, editor.scrollTop / maximum));
    const top = ratio === 0 ? 0 : ratio >= 1 - 0.5 / maximum ? targetMaximum : ratio * targetMaximum;
    if (Math.abs(other.scrollTop - top) > 0.5) {
      other.scrollTop = top; this.expectedScroll.set(other, other.scrollTop); this.position(other);
    }
  }
  scheduleSelection() {
    if (this.selectionFrame) return;
    this.selectionFrame = requestAnimationFrame(() => { this.selectionFrame = null; this.select(); });
  }
  select() {
    const editor = document.activeElement;
    if (!this.editors.includes(editor)) return;
    if (!this.alignment || this.editors[0].value !== this.source || this.editors[1].value !== this.target) {
      for (const item of this.editors) { this.ranges.set(item, []); this.paint(item, []); }
      return;
    }
    const other = this.editors.find(item => item !== editor);
    const ranges = BaroAlignment.matchingRanges(this.alignment, editor.selectionStart, editor.selectionEnd, editor === this.editors[1]);
    this.ranges.set(editor, []); this.ranges.set(other, ranges);
    this.paint(editor, []); this.paint(other, ranges);
    // Painting never changes selection, focus, or either scroll position.
  }
}
