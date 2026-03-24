// ==========================================
// SPRITE EDITOR - HOTKEYS MODULE
// ==========================================

import { interactiveState, customFramesData, img, animationState } from './state.js';
import { undo, redo, pushUndo } from './undo.js';
import { updateConfigFromInputs, forceRedraw } from './render.js';
import { saveToLocalStorage } from './storage.js';

export function setupHotkeys() {
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if (e.ctrlKey && e.key === 'z') {
            e.preventDefault();
            undo();
            forceRedraw();
            return;
        }

        if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
            e.preventDefault();
            redo();
            forceRedraw();
            return;
        }

        if (!interactiveState.isDragging && customFramesData[interactiveState.selectedFrameIndex]) {
            const rect = customFramesData[interactiveState.selectedFrameIndex];
            let moved = false;
            const oldData = { ...rect };

            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                rect.x = Math.max(0, rect.x - 1);
                moved = true;
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                rect.x = Math.min(img.width - rect.w, rect.x + 1);
                moved = true;
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                rect.y = Math.max(0, rect.y - 1);
                moved = true;
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                rect.y = Math.min(img.height - rect.h, rect.y + 1);
                moved = true;
            }

            if (moved) {
                pushUndo('move', interactiveState.selectedFrameIndex, oldData, { ...rect });
                forceRedraw();
                saveToLocalStorage();
                return;
            }
        }

        if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            if (customFramesData[interactiveState.selectedFrameIndex]) {
                const oldData = { ...customFramesData[interactiveState.selectedFrameIndex] };
                pushUndo('delete', interactiveState.selectedFrameIndex, oldData, null);
                delete customFramesData[interactiveState.selectedFrameIndex];
                forceRedraw();
                saveToLocalStorage();
            }
            return;
        }

        if (e.key === ' ') {
            e.preventDefault();
            animationState.isPaused = !animationState.isPaused;
            return;
        }

        if (e.key === '+' || e.key === '=') {
            e.preventDefault();
            const scaleInput = document.getElementById('inpScale');
            const newScale = Math.min(10, (parseInt(scaleInput.value) || 1) + 1);
            scaleInput.value = newScale;
            updateConfigFromInputs();
            return;
        }
        if (e.key === '-' || e.key === '_') {
            e.preventDefault();
            const scaleInput = document.getElementById('inpScale');
            const newScale = Math.max(1, (parseInt(scaleInput.value) || 1) - 1);
            scaleInput.value = newScale;
            updateConfigFromInputs();
            return;
        }
    });
}
