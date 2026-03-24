// ==========================================
// SPRITE EDITOR - INTERACTIONS MODULE
// ==========================================

import { interactiveState, customFramesData, appState, img, viewState } from './state.js';
import { getFrameRect, forceRedraw } from './render.js';
import { pushUndo } from './undo.js';
import { saveToLocalStorage } from './storage.js';

let shiftSelectStart = null;
let shiftSelectEnd = null;

export function setupCanvasInteractions(fullCanvas) {
    const getMousePos = (e) => {
        const rect = fullCanvas.getBoundingClientRect();
        const scaleX = fullCanvas.width / rect.width;
        const scaleY = fullCanvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    };

    const checkHandleZone = (mx, my, rect) => {
        const hs = 8;
        if (Math.abs(mx - (rect.x + rect.w)) < hs && Math.abs(my - (rect.y + rect.h)) < hs) return 'resize_br';
        if (Math.abs(mx - (rect.x + rect.w)) < hs && my > rect.y && my < rect.y + rect.h) return 'resize_r';
        if (Math.abs(my - (rect.y + rect.h)) < hs && mx > rect.x && mx < rect.x + rect.w) return 'resize_b';
        if (mx > rect.x && mx < rect.x + rect.w && my > rect.y && my < rect.y + rect.h) return 'move';
        return null;
    };

    fullCanvas.addEventListener('mousedown', (e) => {
        const mouse = getMousePos(e);

        if (e.shiftKey && !e.ctrlKey && !e.metaKey) {
            shiftSelectStart = { x: mouse.x, y: mouse.y };
            shiftSelectEnd = { x: mouse.x, y: mouse.y };
            return;
        }

        const selRect = getFrameRect(interactiveState.selectedFrameIndex);
        const action = checkHandleZone(mouse.x, mouse.y, selRect);

        if (action && !e.ctrlKey && !e.metaKey) {
            interactiveState.isDragging = true;
            interactiveState.action = action;
            interactiveState.startX = mouse.x;
            interactiveState.startY = mouse.y;
            if (!customFramesData[interactiveState.selectedFrameIndex]) {
                customFramesData[interactiveState.selectedFrameIndex] = { ...selRect };
            }
            interactiveState.origRect = { ...customFramesData[interactiveState.selectedFrameIndex] };
        } else {
            const totalCells = appState.cols * appState.rows;
            for (let i = 0; i < totalCells; i++) {
                const r = getFrameRect(i);
                if (mouse.x > r.x && mouse.x < r.x + r.w && mouse.y > r.y && mouse.y < r.y + r.h) {
                    interactiveState.selectedFrameIndex = i;

                    if (e.ctrlKey || e.metaKey) {
                        let currentFrames = [...appState.activeFrames];
                        if (currentFrames.includes(i)) {
                            if (currentFrames.length > 1) {
                                currentFrames = currentFrames.filter(frame => frame !== i);
                            }
                        } else {
                            currentFrames.push(i);
                        }
                        document.getElementById('inpFrames').value = currentFrames.join(',');
                    } else {
                        document.getElementById('inpFrames').value = i;
                    }

                    document.querySelectorAll('.preset-badge').forEach(b => b.classList.remove('active-preset'));
                    import('./render.js').then(({ updateConfigFromInputs }) => updateConfigFromInputs());
                    return;
                }
            }
        }
    });

    fullCanvas.addEventListener('mousemove', (e) => {
        const mouse = getMousePos(e);

        if (shiftSelectStart) {
            shiftSelectEnd = { x: mouse.x, y: mouse.y };
            forceRedraw();
            return;
        }

        if (!interactiveState.isDragging) {
            const selRect = getFrameRect(interactiveState.selectedFrameIndex);
            const hoverAction = checkHandleZone(mouse.x, mouse.y, selRect);
            if (hoverAction === 'resize_br') fullCanvas.style.cursor = 'nwse-resize';
            else if (hoverAction === 'resize_r') fullCanvas.style.cursor = 'ew-resize';
            else if (hoverAction === 'resize_b') fullCanvas.style.cursor = 'ns-resize';
            else if (hoverAction === 'move') fullCanvas.style.cursor = 'move';
            else fullCanvas.style.cursor = 'crosshair';
            return;
        }

        const dx = mouse.x - interactiveState.startX;
        const dy = mouse.y - interactiveState.startY;
        const targetRect = customFramesData[interactiveState.selectedFrameIndex];
        const orig = interactiveState.origRect;

        if (interactiveState.action === 'move') {
            let newX = orig.x + dx;
            let newY = orig.y + dy;
            targetRect.x = Math.max(0, Math.min(img.width - targetRect.w, newX));
            targetRect.y = Math.max(0, Math.min(img.height - targetRect.h, newY));
        } else if (interactiveState.action === 'resize_br') {
            let newW = orig.w + dx;
            let newH = orig.h + dy;
            targetRect.w = Math.max(1, Math.min(img.width - targetRect.x, newW));
            targetRect.h = Math.max(1, Math.min(img.height - targetRect.y, newH));
        } else if (interactiveState.action === 'resize_r') {
            let newW = orig.w + dx;
            targetRect.w = Math.max(1, Math.min(img.width - targetRect.x, newW));
        } else if (interactiveState.action === 'resize_b') {
            let newH = orig.h + dy;
            targetRect.h = Math.max(1, Math.min(img.height - targetRect.y, newH));
        }

        forceRedraw();
    });

    window.addEventListener('mouseup', () => {
        if (shiftSelectStart && shiftSelectEnd) {
            const x = Math.min(shiftSelectStart.x, shiftSelectEnd.x);
            const y = Math.min(shiftSelectStart.y, shiftSelectEnd.y);
            const w = Math.abs(shiftSelectEnd.x - shiftSelectStart.x);
            const h = Math.abs(shiftSelectEnd.y - shiftSelectStart.y);

            if (w > 5 && h > 5) {
                let newIndex = 0;
                while (customFramesData[newIndex]) newIndex++;
                
                customFramesData[newIndex] = { x, y, w, h };
                interactiveState.selectedFrameIndex = newIndex;
                pushUndo('shift_create', newIndex, null, { x, y, w, h });
                forceRedraw();
                saveToLocalStorage();
            }
            shiftSelectStart = null;
            shiftSelectEnd = null;
        }
        interactiveState.isDragging = false;
        interactiveState.action = null;
    });

    // Zoom
    fullCanvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        viewState.zoom = Math.max(0.5, Math.min(5, viewState.zoom + delta));
        fullCanvas.style.transform = `scale(${viewState.zoom})`;
        fullCanvas.style.transformOrigin = 'center center';
    });
}
