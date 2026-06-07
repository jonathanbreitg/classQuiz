/**
 * attachDrag(containerEl, opts) → cleanup fn
 *
 * Unified pointer-event drag-and-drop for touch + mouse.
 * Uses setPointerCapture so pointermove/pointerup keep firing on the
 * source container even after the pointer leaves it.
 *
 * A gesture shorter than `threshold` pixels is treated as a tap.
 * A longer one creates a ghost element and ends with onDrop.
 *
 * opts
 *   itemSelector   string   CSS selector identifying draggable items
 *   getItemData    fn(el)   returns data for the dragged item (passed to callbacks)
 *   ghostText      fn(data) text content for the following ghost element
 *   ghostClass     string   class(es) on the ghost div
 *   draggingClass  string   class added to the source element while dragging
 *   findTarget     fn(el)   given the element under the pointer, return the valid
 *                           drop target (or null). Use .closest() here.
 *   onDrop         fn(data, targetEl)
 *   onTap          fn(data, itemEl)
 *   onEnterTarget  fn(targetEl | null)   optional — for hover highlight
 *   threshold      number   pixels before drag activates (default 10)
 */
export function attachDrag(containerEl, {
  itemSelector,
  getItemData,
  ghostText,
  ghostClass    = 'drag-ghost',
  draggingClass = 'item--dragging',
  findTarget,
  onDrop,
  onTap,
  onEnterTarget,
  onDragStart,
  onDragEnd,
  threshold = 10,
}) {
  let dragData   = null;
  let sourceEl   = null;
  let ghost      = null;
  let hovered    = null;
  let dragging   = false;
  let startX = 0, startY = 0;

  function reset() {
    const wasRealDrag = dragging;
    if (ghost)   { ghost.remove(); ghost = null; }
    if (hovered) { onEnterTarget?.(null); hovered = null; }
    if (sourceEl && draggingClass) sourceEl.classList.remove(draggingClass);
    dragData = null; sourceEl = null; dragging = false;
    if (wasRealDrag) onDragEnd?.();
  }

  function onDown(e) {
    const itemEl = e.target.closest(itemSelector);
    if (!itemEl) return;
    e.preventDefault();
    dragData = getItemData(itemEl);
    sourceEl = itemEl;
    dragging = false;
    startX   = e.clientX;
    startY   = e.clientY;
    itemEl.setPointerCapture(e.pointerId);
  }

  function onMove(e) {
    if (dragData === null) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (!dragging && Math.hypot(dx, dy) > threshold) {
      dragging = true;
      sourceEl.classList.add(draggingClass);
      onDragStart?.();
      ghost = document.createElement('div');
      ghost.className = ghostClass;
      ghost.textContent = ghostText(dragData);
      document.body.appendChild(ghost);
    }
    if (dragging && ghost) {
      ghost.style.left = `${e.clientX}px`;
      ghost.style.top  = `${e.clientY}px`;
      const under  = document.elementFromPoint(e.clientX, e.clientY);
      const target = under ? findTarget(under) : null;
      if (target !== hovered) {
        onEnterTarget?.(target);
        hovered = target;
      }
    }
  }

  function onUp(e) {
    if (dragData === null) return;
    if (dragging) {
      const under  = document.elementFromPoint(e.clientX, e.clientY);
      const target = under ? findTarget(under) : null;
      if (target) onDrop(dragData, target);
    } else {
      onTap(dragData, sourceEl);
    }
    reset();
  }

  containerEl.addEventListener('pointerdown',   onDown);
  containerEl.addEventListener('pointermove',   onMove);
  containerEl.addEventListener('pointerup',     onUp);
  containerEl.addEventListener('pointercancel', reset);

  return reset;
}
