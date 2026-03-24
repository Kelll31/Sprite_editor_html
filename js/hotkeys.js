// ==========================================
// SPRITE EDITOR - HOTKEYS MODULE
// ==========================================

import { interactiveState, customFramesData, img, animationState, frameNames } from './state.js';
import { undo, redo, pushUndo, getUndoLength, getRedoLength } from './undo.js';
import { updateConfigFromInputs, forceRedraw } from './render.js';
import { saveToLocalStorage } from './storage.js';

export function setupHotkeys() {
    document.addEventListener('keydown', (e) => {
        // Разрешаем Ctrl+Z/Y в input и textarea только если это не отмена
        const isInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';
        
        // Ctrl+Z - Undo (работает везде)
        if (e.ctrlKey && e.key === 'z') {
            e.preventDefault();
            if (undo()) {
                forceRedraw();
                // Обновляем список названий кадров если есть
                const frameNamesListDiv = document.getElementById('frameNamesList');
                if (frameNamesListDiv && window.renderFrameNames) {
                    window.renderFrameNames();
                }
                saveToLocalStorage();
            }
            return;
        }

        // Ctrl+Y или Ctrl+Shift+Z - Redo (работает везде)
        if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
            e.preventDefault();
            if (redo()) {
                forceRedraw();
                // Обновляем список названий кадров если есть
                const frameNamesListDiv = document.getElementById('frameNamesList');
                if (frameNamesListDiv && window.renderFrameNames) {
                    window.renderFrameNames();
                }
                saveToLocalStorage();
            }
            return;
        }
        
        // Остальные горячие клавиши только не в input
        if (isInput) return;

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
                const oldNames = { ...frameNames };
                const frameToDelete = interactiveState.selectedFrameIndex;
                pushUndo('delete', frameToDelete, oldData, null, oldNames, { ...frameNames });
                delete customFramesData[frameToDelete];
                delete frameNames[frameToDelete];
                
                // Find next available frame
                const remainingFrames = Object.keys(customFramesData).map(k => parseInt(k)).sort((a, b) => a - b);
                if (remainingFrames.length > 0) {
                    interactiveState.selectedFrameIndex = remainingFrames[0];
                }
                
                forceRedraw();
                saveToLocalStorage();
                
                // Update frame names list
                if (window.renderFrameNames) window.renderFrameNames();
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
            // Увеличение FPS
            const fpsInput = document.getElementById('inpFPS');
            const newFps = Math.min(60, (parseInt(fpsInput.value) || 10) + 1);
            fpsInput.value = newFps;
            updateConfigFromInputs();
            return;
        }
        if (e.key === '-' || e.key === '_') {
            e.preventDefault();
            // Уменьшение FPS
            const fpsInput = document.getElementById('inpFPS');
            const newFps = Math.max(1, (parseInt(fpsInput.value) || 10) - 1);
            fpsInput.value = newFps;
            updateConfigFromInputs();
            return;
        }
    });
}
