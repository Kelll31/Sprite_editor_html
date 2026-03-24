// ==========================================
// SPRITE EDITOR - STORAGE MODULE
// ==========================================

import { customFramesData, customAnimations, appState, fileNameForJSON, frameNames } from './state.js';

export function saveToLocalStorage() {
    const data = {
        customFramesData,
        customAnimations,
        frameNames,
        appState: {
            cols: appState.cols,
            rows: appState.rows,
            activeFrames: appState.activeFrames,
            offsets: appState.offsets,
            fps: appState.fps,
            playMode: appState.playMode,
            gridVisible: appState.gridVisible
        },
        fileNameForJSON
    };
    localStorage.setItem('spriteEditorData', JSON.stringify(data));
}

export function loadFromLocalStorage() {
    const saved = localStorage.getItem('spriteEditorData');
    if (saved) {
        const data = JSON.parse(saved);
        Object.assign(customFramesData, data.customFramesData || {});
        Object.assign(customAnimations, data.customAnimations || {});
        Object.assign(frameNames, data.frameNames || {});
        if (data.appState) {
            appState.cols = data.appState.cols || 4;
            appState.rows = data.appState.rows || 2;
            appState.activeFrames = data.appState.activeFrames || [0];
            appState.offsets = data.appState.offsets || [];
            appState.fps = data.appState.fps || 10;
            appState.playMode = data.appState.playMode || 'loop';
            appState.gridVisible = data.appState.gridVisible !== undefined ? data.appState.gridVisible : true;
        }
        return true;
    }
    return false;
}

// Auto-save every 5 seconds
export function startAutoSave() {
    setInterval(saveToLocalStorage, 5000);
}
