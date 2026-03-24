// ==========================================
// SPRITE EDITOR - UNDO/REDO MODULE
// ==========================================

import { customFramesData } from './state.js';

let undoStack = [];
let redoStack = [];
const MAX_UNDO = 50;

export function pushUndo(actionType, frameIndex, oldData, newData) {
    undoStack.push({ actionType, frameIndex, oldData, newData });
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack = [];
}

export function undo() {
    if (undoStack.length === 0) return;
    const action = undoStack.pop();
    const currentData = customFramesData[action.frameIndex] ? { ...customFramesData[action.frameIndex] } : null;
    redoStack.push({ ...action, newData: currentData });
    if (action.oldData === null) {
        delete customFramesData[action.frameIndex];
    } else {
        customFramesData[action.frameIndex] = { ...action.oldData };
    }
    return true;
}

export function redo() {
    if (redoStack.length === 0) return;
    const action = redoStack.pop();
    const currentData = customFramesData[action.frameIndex] ? { ...customFramesData[action.frameIndex] } : null;
    undoStack.push({ ...action, newData: currentData });
    if (action.newData === null) {
        delete customFramesData[action.frameIndex];
    } else {
        customFramesData[action.frameIndex] = { ...action.newData };
    }
    return true;
}
