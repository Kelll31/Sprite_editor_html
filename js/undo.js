// ==========================================
// SPRITE EDITOR - UNDO/REDO MODULE
// ==========================================

import { customFramesData, frameNames } from './state.js';

let undoStack = [];
let redoStack = [];
const MAX_UNDO = 100;

export function pushUndo(actionType, frameIndex, oldData, newData, oldFrameNames, newFrameNames) {
    undoStack.push({ 
        actionType, 
        frameIndex, 
        oldData, 
        newData,
        oldFrameNames: oldFrameNames || null,
        newFrameNames: newFrameNames || null
    });
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack = [];
}

export function getUndoLength() {
    return undoStack.length;
}

export function getRedoLength() {
    return redoStack.length;
}

export function undo() {
    if (undoStack.length === 0) return false;
    const action = undoStack.pop();
    
    // Сохраняем текущее состояние для redo
    const currentFrameData = customFramesData[action.frameIndex] !== undefined ? 
        (action.frameIndex === -1 ? { ...customFramesData } : { ...customFramesData[action.frameIndex] }) : null;
    const currentFrameNames = { ...frameNames };
    
    redoStack.push({ 
        ...action, 
        newData: currentFrameData,
        newFrameNames: currentFrameNames
    });
    
    // Восстанавливаем старое состояние
    if (action.frameIndex === -1) {
        // Для действий со всеми кадрами (autoslice)
        if (action.oldData === null) {
            Object.keys(customFramesData).forEach(key => delete customFramesData[key]);
        } else {
            Object.keys(customFramesData).forEach(key => delete customFramesData[key]);
            Object.assign(customFramesData, action.oldData);
        }
    } else {
        // Для действий с одним кадром
        if (action.oldData === null) {
            delete customFramesData[action.frameIndex];
        } else {
            customFramesData[action.frameIndex] = { ...action.oldData };
        }
    }
    
    // Восстанавливаем названия кадров если есть
    if (action.oldFrameNames) {
        Object.keys(frameNames).forEach(key => delete frameNames[key]);
        Object.assign(frameNames, action.oldFrameNames);
    }
    
    return true;
}

export function redo() {
    if (redoStack.length === 0) return false;
    const action = redoStack.pop();
    
    // Сохраняем текущее состояние для undo
    const currentFrameData = customFramesData[action.frameIndex] !== undefined ? 
        (action.frameIndex === -1 ? { ...customFramesData } : { ...customFramesData[action.frameIndex] }) : null;
    const currentFrameNames = { ...frameNames };
    
    undoStack.push({ 
        ...action, 
        newData: currentFrameData,
        newFrameNames: currentFrameNames
    });
    
    // Восстанавливаем новое состояние
    if (action.frameIndex === -1) {
        // Для действий со всеми кадрами (autoslice)
        if (action.newData === null) {
            Object.keys(customFramesData).forEach(key => delete customFramesData[key]);
        } else {
            Object.keys(customFramesData).forEach(key => delete customFramesData[key]);
            Object.assign(customFramesData, action.newData);
        }
    } else {
        // Для действий с одним кадром
        if (action.newData === null) {
            delete customFramesData[action.frameIndex];
        } else {
            customFramesData[action.frameIndex] = { ...action.newData };
        }
    }
    
    // Восстанавливаем названия кадров если есть
    if (action.newFrameNames) {
        Object.keys(frameNames).forEach(key => delete frameNames[key]);
        Object.assign(frameNames, action.newFrameNames);
    }
    
    return true;
}

export function clearUndo() {
    undoStack = [];
    redoStack = [];
}

export function saveUndoState() {
    return {
        undoStack: JSON.parse(JSON.stringify(undoStack)),
        redoStack: JSON.parse(JSON.stringify(redoStack))
    };
}

export function loadUndoState(state) {
    if (state) {
        undoStack = state.undoStack || [];
        redoStack = state.redoStack || [];
    }
}
