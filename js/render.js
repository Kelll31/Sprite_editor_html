// ==========================================
// SPRITE EDITOR - RENDER MODULE
// ==========================================

import { appState, customFramesData, img, interactiveState, animationState, frameNames } from './state.js';

let animCanvas, animCtx, fullCanvas, fullCtx, infoDiv;

export function setCanvasElements(anim, full, info) {
    animCanvas = anim;
    animCtx = anim.getContext('2d');
    fullCanvas = full;
    fullCtx = full.getContext('2d');
    infoDiv = info;
}

export function getBaseGridRect(index) {
    const cols = appState.cols || 1;
    const rows = appState.rows || 1;
    const baseW = img.width / cols;
    const baseH = img.height / rows;
    const col = index % cols;
    const row = Math.floor(index / cols);
    return {
        x: col * baseW,
        y: row * baseH,
        w: baseW,
        h: baseH
    };
}

export function getFrameRect(index) {
    if (customFramesData[index]) {
        return customFramesData[index];
    }
    return getBaseGridRect(index);
}

export function updateConfigFromInputs() {
    const inputs = {
        cols: document.getElementById('inpCols'),
        rows: document.getElementById('inpRows'),
        scale: document.getElementById('inpScale'),
        frames: document.getElementById('inpFrames'),
        offsets: document.getElementById('inpOffsets'),
        fps: document.getElementById('inpFPS'),
        playMode: document.getElementById('inpPlayMode')
    };

    appState.cols = parseInt(inputs.cols.value) || 1;
    appState.rows = parseInt(inputs.rows.value) || 1;
    appState.scale = parseFloat(inputs.scale.value) || 1;
    appState.fps = parseInt(inputs.fps.value) || 10;
    appState.playMode = inputs.playMode.value || 'loop';

    const parseArr = (val) => val.split(',').map(n => parseFloat(n.trim())).filter(n => !isNaN(n));
    appState.activeFrames = parseArr(inputs.frames.value);
    if (appState.activeFrames.length === 0) appState.activeFrames = [0];
    appState.offsets = parseArr(inputs.offsets.value);

    // Reset animation state
    animationState.frameIdx = 0;
    animationState.pingpongDirection = 1;
    animationState.hasPlayedOnce = false;

    forceRedraw();
    
    // Обновляем список названий кадров
    window.renderFrameNames && window.renderFrameNames();
}

export function forceRedraw() {
    tick();
}

export function tick(timestamp) {
    if (!img.complete || img.naturalWidth === 0) return;

    const frameInterval = 1000 / appState.fps;
    if (timestamp && timestamp - animationState.lastFrameTime < frameInterval) {
        renderInspector();
        return;
    }
    if (timestamp) animationState.lastFrameTime = timestamp;

    if (animationState.isPaused) {
        renderInspector();
        return;
    }

    if (appState.activeFrames.length > 0) {
        const animFrameIndex = appState.activeFrames[animationState.frameIdx];
        const rect = getFrameRect(animFrameIndex);

        const finalW = Math.max(1, rect.w);
        const finalH = Math.max(1, rect.h);

        animCanvas.width = finalW * appState.scale;
        animCanvas.height = finalH * appState.scale;
        animCtx.imageSmoothingEnabled = false;

        let renderOffsetX = appState.offsets.length > animationState.frameIdx ? appState.offsets[animationState.frameIdx] * appState.scale : 0;

        animCtx.clearRect(0, 0, animCanvas.width, animCanvas.height);
        animCtx.drawImage(
            img,
            rect.x, rect.y, finalW, finalH,
            renderOffsetX, 0, finalW * appState.scale, finalH * appState.scale
        );

        if (!interactiveState.isDragging && appState.activeFrames.length === 1) {
            interactiveState.selectedFrameIndex = animFrameIndex;
        }

        if (appState.playMode === 'loop') {
            animationState.frameIdx = (animationState.frameIdx + 1) % appState.activeFrames.length;
        } else if (appState.playMode === 'pingpong') {
            animationState.frameIdx += animationState.pingpongDirection;
            if (animationState.frameIdx >= appState.activeFrames.length - 1) {
                animationState.pingpongDirection = -1;
            } else if (animationState.frameIdx <= 0) {
                animationState.pingpongDirection = 1;
            }
        } else if (appState.playMode === 'once') {
            if (animationState.frameIdx < appState.activeFrames.length - 1) {
                animationState.frameIdx++;
            } else {
                animationState.hasPlayedOnce = true;
            }
        }
    }

    renderInspector();
}

export function renderInspector() {
    if (!img.complete || img.naturalWidth === 0) return;

    fullCanvas.width = img.width;
    fullCanvas.height = img.height;
    fullCtx.imageSmoothingEnabled = false;
    fullCtx.clearRect(0, 0, fullCanvas.width, fullCanvas.height);
    fullCtx.globalAlpha = 0.8;
    fullCtx.drawImage(img, 0, 0);
    fullCtx.globalAlpha = 1.0;

    const cols = appState.cols;
    const rows = appState.rows;
    const totalCells = cols * rows;
    const showGrid = appState.gridVisible !== undefined ? appState.gridVisible : true;

    // Отрисовка сетки только если включено
    if (showGrid) {
        for (let i = 0; i < totalCells; i++) {
            const rect = getFrameRect(i);
            const isCustom = customFramesData[i] !== undefined;
            const isSelectedForEdit = i === interactiveState.selectedFrameIndex;
            const isInAnimation = appState.activeFrames.includes(i);

            fullCtx.beginPath();
            fullCtx.rect(rect.x, rect.y, rect.w, rect.h);

            if (isSelectedForEdit) {
                fullCtx.fillStyle = 'rgba(80, 250, 123, 0.3)';
                fullCtx.fill();
                fullCtx.strokeStyle = '#50fa7b';
                fullCtx.lineWidth = 2;
            } else if (isInAnimation) {
                fullCtx.fillStyle = 'rgba(139, 233, 253, 0.15)';
                fullCtx.fill();
                fullCtx.strokeStyle = 'rgba(139, 233, 253, 0.8)';
                fullCtx.lineWidth = 1;
            } else if (isCustom) {
                fullCtx.strokeStyle = '#ff79c6';
                fullCtx.lineWidth = 1;
                fullCtx.setLineDash([4, 2]);
            } else {
                fullCtx.strokeStyle = 'rgba(241, 196, 15, 0.3)';
                fullCtx.lineWidth = 1;
                fullCtx.setLineDash([]);
            }

            fullCtx.stroke();
            fullCtx.setLineDash([]);

            if (isSelectedForEdit) {
                fullCtx.fillStyle = '#50fa7b';
            } else if (isInAnimation) {
                fullCtx.fillStyle = '#8be9fd';
            } else if (isCustom) {
                fullCtx.fillStyle = '#ff79c6';
            } else {
                fullCtx.fillStyle = '#fff';
            }

            fullCtx.font = 'bold 12px monospace';
            fullCtx.fillText(i, rect.x + 4, rect.y + 14);

            if (isSelectedForEdit) {
                const handleSize = 6;
                fullCtx.fillStyle = '#50fa7b';
                fullCtx.fillRect(rect.x + rect.w - handleSize / 2, rect.y + rect.h - handleSize / 2, handleSize, handleSize);
                fullCtx.fillRect(rect.x + rect.w - handleSize / 2, rect.y + rect.h / 2 - handleSize / 2, handleSize, handleSize);
                fullCtx.fillRect(rect.x + rect.w / 2 - handleSize / 2, rect.y + rect.h - handleSize / 2, handleSize, handleSize);
            }
        }
    }

    const selRect = getFrameRect(interactiveState.selectedFrameIndex);
    infoDiv.innerText = `Редактор (Кадр: [${interactiveState.selectedFrameIndex}]) | X: ${Math.round(selRect.x)}, Y: ${Math.round(selRect.y)}, W: ${Math.round(selRect.w)}, H: ${Math.round(selRect.h)}`;
}

// Функция для обновления видимости сетки
export function setGridVisible(visible) {
    appState.gridVisible = visible;
    const checkbox = document.getElementById('chkShowGrid');
    if (checkbox) {
        checkbox.checked = visible;
    }
    forceRedraw();
}
