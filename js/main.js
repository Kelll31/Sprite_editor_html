// ==========================================
// SPRITE EDITOR - MAIN MODULE
// ==========================================

import { img, customFramesData, customAnimations, appState, animationState, frameNames } from './state.js';
import { setCanvasElements, forceRedraw, updateConfigFromInputs, renderInspector, setGridVisible } from './render.js';
import { setupHotkeys } from './hotkeys.js';
import { setupCanvasInteractions } from './interactions.js';
import { startAutoSave, loadFromLocalStorage, saveToLocalStorage } from './storage.js';
import { autoCrop, autoSlice, autoDetectGrid, removeBackground, autoSliceImproved, previewRemoveBackground, pickColorFromCanvas } from './tools.js';

let animCanvas, animCtx, fullCanvas, fullCtx, errorMsg, infoDiv;
let animPresetsDiv, frameNamesListDiv;
let fileNameForJSON = "spritesheet.png";

function init() {
    animCanvas = document.getElementById('animCanvas');
    animCtx = animCanvas.getContext('2d');
    fullCanvas = document.getElementById('fullSheetCanvas');
    fullCtx = fullCanvas.getContext('2d');
    errorMsg = document.getElementById('errorMsg');
    infoDiv = document.getElementById('selectedFrameInfo');
    animPresetsDiv = document.getElementById('animPresets');
    frameNamesListDiv = document.getElementById('frameNamesList');

    setCanvasElements(animCanvas, fullCanvas, infoDiv);

    // Input listeners
    ['inpCols', 'inpRows', 'inpFrames', 'inpOffsets', 'inpFPS', 'inpPlayMode'].forEach(id => {
        document.getElementById(id).addEventListener('input', () => {
            animationState.frameIdx = 0;
            updateConfigFromInputs();
        });
    });

    // Button listeners
    document.getElementById('imageLoader').addEventListener('change', handleImageUpload);
    document.getElementById('btnUndo').addEventListener('click', () => {
        import('./undo.js').then(({ undo }) => {
            if (undo()) {
                forceRedraw();
                if (window.renderFrameNames) window.renderFrameNames();
                saveToLocalStorage();
            }
        });
    });
    document.getElementById('btnRedo').addEventListener('click', () => {
        import('./undo.js').then(({ redo }) => {
            if (redo()) {
                forceRedraw();
                if (window.renderFrameNames) window.renderFrameNames();
                saveToLocalStorage();
            }
        });
    });
    document.getElementById('btnExportJSON').addEventListener('click', generateJSON);
    document.getElementById('btnImportJSON').addEventListener('click', importJSON);
    document.getElementById('btnResetCustom').addEventListener('click', () => {
        const oldData = { ...customFramesData };
        const oldNames = { ...frameNames };
        Object.keys(customFramesData).forEach(key => delete customFramesData[key]);
        Object.keys(frameNames).forEach(key => delete frameNames[key]);
        import('./undo.js').then(({ pushUndo }) => {
            pushUndo('reset_all', -1, oldData, null, oldNames, null);
        });
        forceRedraw();
    });
    document.getElementById('btnAddPreset').addEventListener('click', addPreset);
    document.getElementById('btnAutoCrop').addEventListener('click', autoCrop);
    document.getElementById('btnAutoSlice').addEventListener('click', autoSliceImproved);
    
    // Background removal preview state
    window.bgRemovalState = {
        hasPreview: false,
        previewCanvas: null,
        originalImageData: null,
        isPickingColor: false
    };

    // New button listeners for background removal with preview
    const previewCanvas = document.getElementById('previewCanvas');
    const btnPreviewBg = document.getElementById('btnPreviewBg');
    const btnApplyBg = document.getElementById('btnApplyBg');
    const btnCancelBg = document.getElementById('btnCancelBg');
    const btnColorPicker = document.getElementById('btnColorPicker');
    const toleranceRange = document.getElementById('inpToleranceRange');
    const toleranceNumber = document.getElementById('inpTolerance');
    const colorSelect = document.getElementById('inpBgColor');

    // Sync tolerance slider and number input with LIVE preview
    let previewTimeout = null;
    
    toleranceRange.addEventListener('input', (e) => {
        toleranceNumber.value = e.target.value;
        // Live preview - update immediately
        if (img.complete && img.naturalWidth > 0) {
            clearTimeout(previewTimeout);
            previewTimeout = setTimeout(() => {
                updatePreview();
            }, 50);
        }
    });

    toleranceNumber.addEventListener('input', (e) => {
        toleranceRange.value = e.target.value;
        // Live preview - update immediately
        if (img.complete && img.naturalWidth > 0) {
            clearTimeout(previewTimeout);
            previewTimeout = setTimeout(() => {
                updatePreview();
            }, 50);
        }
    });
    
    // Also update preview when color changes
    colorSelect.addEventListener('change', () => {
        if (img.complete && img.naturalWidth > 0 && window.bgRemovalState.hasPreview) {
            updatePreview();
        }
    });

    // Color picker button
    btnColorPicker.addEventListener('click', () => {
        window.bgRemovalState.isPickingColor = !window.bgRemovalState.isPickingColor;
        if (window.bgRemovalState.isPickingColor) {
            btnColorPicker.style.backgroundColor = '#50fa7b';
            btnColorPicker.style.color = '#282a36';
            fullCanvas.style.cursor = 'crosshair';
        } else {
            btnColorPicker.style.backgroundColor = '';
            btnColorPicker.style.color = '';
            fullCanvas.style.cursor = 'crosshair';
        }
    });

    // Click on full canvas to pick color
    fullCanvas.addEventListener('click', (e) => {
        if (window.bgRemovalState.isPickingColor) {
            const colorInfo = pickColorFromCanvas(fullCanvas, e.clientX, e.clientY);
            if (colorInfo) {
                // Update color select to custom
                const customOption = document.createElement('option');
                customOption.value = colorInfo.rgb;
                customOption.text = `Выбранный (${colorInfo.rgb})`;
                customOption.selected = true;
                
                // Remove existing custom options
                Array.from(colorSelect.options).forEach(opt => {
                    if (opt.text.startsWith('Выбранный')) opt.remove();
                });
                colorSelect.add(customOption);
                
                window.bgRemovalState.isPickingColor = false;
                btnColorPicker.style.backgroundColor = '';
                btnColorPicker.style.color = '';
                fullCanvas.style.cursor = 'crosshair';
                
                // Update preview if active
                if (window.bgRemovalState.hasPreview) {
                    updatePreview();
                }
            }
        }
    });

    // Preview button
    btnPreviewBg.addEventListener('click', updatePreview);

    // Apply button
    btnApplyBg.addEventListener('click', applyBackgroundRemoval);

    // Cancel button
    btnCancelBg.addEventListener('click', cancelBackgroundRemoval);

    function updatePreview() {
        if (!img.complete || img.naturalWidth === 0) return;
        
        const colorRgb = colorSelect.value.split(',').map(Number);
        const tolerance = parseInt(toleranceRange.value) || 30;
        
        previewRemoveBackground(colorRgb, tolerance, previewCanvas);
        
        previewCanvas.style.display = 'block';
        window.bgRemovalState.hasPreview = true;
        btnApplyBg.disabled = false;
        btnCancelBg.disabled = false;
    }

    function applyBackgroundRemoval() {
        if (!window.bgRemovalState.hasPreview) return;
        
        const colorRgb = colorSelect.value.split(',').map(Number);
        const tolerance = parseInt(toleranceRange.value) || 30;
        
        const newImg = removeBackground(colorRgb, tolerance);
        if (newImg) {
            newImg.onload = () => {
                img.src = newImg.src;
                img.onload = () => {
                    forceRedraw();
                    cancelBackgroundRemoval();
                    saveToLocalStorage();
                };
            };
        }
    }

    function cancelBackgroundRemoval() {
        previewCanvas.style.display = 'none';
        window.bgRemovalState.hasPreview = false;
        btnApplyBg.disabled = true;
        btnCancelBg.disabled = true;
    }

    document.getElementById('chkShowGrid').addEventListener('change', (e) => {
        appState.gridVisible = e.target.checked;
        forceRedraw();
    });

    setupHotkeys();
    setupCanvasInteractions(fullCanvas);
    
    // Загружаем сохраненные данные
    loadFromLocalStorage();
    
    // Обновляем UI из сохраненных данных
    const saved = localStorage.getItem('spriteEditorData');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            if (data.appState) {
                document.getElementById('inpCols').value = data.appState.cols || 4;
                document.getElementById('inpRows').value = data.appState.rows || 2;
                document.getElementById('inpFPS').value = data.appState.fps || 10;
                document.getElementById('inpPlayMode').value = data.appState.playMode || 'loop';
                if (data.appState.activeFrames) {
                    document.getElementById('inpFrames').value = data.appState.activeFrames.join(',');
                }
                if (data.appState.offsets) {
                    document.getElementById('inpOffsets').value = data.appState.offsets.join(',');
                }
            }
            if (data.appState && data.appState.gridVisible !== undefined) {
                document.getElementById('chkShowGrid').checked = data.appState.gridVisible;
            }
        } catch (e) {
            console.error('Ошибка загрузки сохраненных данных:', e);
        }
    }
    
    createPlaceholderImage();
    startAutoSave();
    renderPresets();
    renderFrameNames();

    updateConfigFromInputs();
    requestAnimationFrame(function animate(time) {
        import('./render.js').then(({ tick }) => tick(time));
        requestAnimationFrame(animate);
    });
}

function handleImageUpload(e) {
    const reader = new FileReader();
    reader.onload = function (event) {
        img.src = event.target.result;
        img.onload = () => {
            // Clear objects instead of reassigning
            Object.keys(customFramesData).forEach(key => delete customFramesData[key]);
            Object.keys(customAnimations).forEach(key => delete customAnimations[key]);
            Object.keys(frameNames).forEach(key => delete frameNames[key]);
            renderPresets();
            renderFrameNames();
            fileNameForJSON = e.target.files[0].name;
            document.getElementById('inpFrames').value = "0";
            animationState.frameIdx = 0;
            
            // Auto-detect grid based on objects in the image
            const gridInfo = autoDetectGrid();
            document.getElementById('inpCols').value = gridInfo.cols;
            document.getElementById('inpRows').value = gridInfo.rows;
            
            updateConfigFromInputs();
            forceRedraw();
        };
    }
    if (e.target.files[0]) {
        reader.readAsDataURL(e.target.files[0]);
    }
}

function createPlaceholderImage() {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ff79c6';
    ctx.fillRect(0, 0, 400, 200);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, 400, 200);
    ctx.beginPath(); ctx.moveTo(100, 0); ctx.lineTo(100, 200); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(200, 0); ctx.lineTo(200, 200); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(300, 0); ctx.lineTo(300, 200); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 100); ctx.lineTo(400, 100); ctx.stroke();
    ctx.fillStyle = '#282a36';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('ЗАГРУЗИ', 150, 80);
    ctx.fillText('КАРТИНКУ 📁', 125, 130);
    img.src = canvas.toDataURL();
    img.onload = forceRedraw;
}

function addPreset() {
    const nameInp = document.getElementById('inpPresetName');
    const framesInp = document.getElementById('inpPresetFrames');
    const name = nameInp.value.trim();
    const framesStr = framesInp.value.trim();

    if (!name || !framesStr) return;

    const framesArr = framesStr.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
    if (framesArr.length === 0) return;

    customAnimations[name] = framesArr;
    renderPresets();
    nameInp.value = '';
    framesInp.value = '';
}

function renderPresets() {
    animPresetsDiv.innerHTML = '';
    for (let presetName in customAnimations) {
        const badge = document.createElement('div');
        badge.className = 'preset-badge';

        const spanName = document.createElement('span');
        spanName.innerText = presetName;
        spanName.onclick = () => {
            document.querySelectorAll('.preset-badge').forEach(b => b.classList.remove('active-preset'));
            badge.classList.add('active-preset');
            document.getElementById('inpFrames').value = customAnimations[presetName].join(',');
            updateConfigFromInputs();
        };

        const delBtn = document.createElement('div');
        delBtn.className = 'del-btn';
        delBtn.innerText = '✖';
        delBtn.title = 'Удалить пресет';
        delBtn.onclick = (e) => {
            e.stopPropagation();
            delete customAnimations[presetName];
            renderPresets();
        };

        badge.appendChild(spanName);
        badge.appendChild(delBtn);
        animPresetsDiv.appendChild(badge);
    }
}

// Рендеринг списка названий кадров
function renderFrameNames() {
    if (!frameNamesListDiv) return;
    
    frameNamesListDiv.innerHTML = '';
    
    // Получаем все существующие кадры (только с customFramesData)
    const frameIndices = Object.keys(customFramesData).map(k => parseInt(k)).sort((a, b) => a - b);
    
    if (frameIndices.length === 0) {
        frameNamesListDiv.innerHTML = '<div style="color:#888;font-size:12px;text-align:center;padding:10px;">Нет кадров. Используйте Auto-Slice или создайте кадр через Shift+клик</div>';
        return;
    }
    
    for (const i of frameIndices) {
        const item = document.createElement('div');
        item.className = 'frame-name-item';
        item.style.position = 'relative';
        
        // Кнопка удаления кадра (слева)
        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '🗑️';
        deleteBtn.title = 'Удалить кадр';
        deleteBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:14px;opacity:0.7;padding:2px 5px;margin-right:5px;';
        deleteBtn.onmouseover = () => deleteBtn.style.opacity = '1';
        deleteBtn.onmouseout = () => deleteBtn.style.opacity = '0.7';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            if (confirm(`Удалить кадр #${i}?`)) {
                const oldData = customFramesData[i] ? { ...customFramesData[i] } : null;
                const oldNames = { ...frameNames };
                delete customFramesData[i];
                delete frameNames[i];
                import('./undo.js').then(({ pushUndo }) => {
                    pushUndo('delete_frame', i, oldData, null, oldNames, { ...frameNames });
                });
                import('./storage.js').then(({ saveToLocalStorage }) => saveToLocalStorage());
                renderFrameNames();
                forceRedraw();
            }
        };
        
        const idxSpan = document.createElement('span');
        idxSpan.className = 'frame-idx';
        idxSpan.innerText = `#${i}`;
        
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.value = frameNames[i] || '';
        nameInput.placeholder = `Название кадра ${i}`;
        
        // При клике на input - выделяем соответствующий кадр
        nameInput.addEventListener('click', () => {
            interactiveState.selectedFrameIndex = i;
            document.getElementById('inpFrames').value = i;
            import('./render.js').then(({ updateConfigFromInputs, forceRedraw }) => {
                forceRedraw();
            });
        });
        
        nameInput.addEventListener('focus', () => {
            interactiveState.selectedFrameIndex = i;
            document.getElementById('inpFrames').value = i;
            import('./render.js').then(({ forceRedraw }) => {
                forceRedraw();
            });
        });
        
        nameInput.onchange = (e) => {
            frameNames[i] = e.target.value.trim();
            import('./storage.js').then(({ saveToLocalStorage }) => saveToLocalStorage());
        };
        
        item.appendChild(deleteBtn);
        item.appendChild(idxSpan);
        item.appendChild(nameInput);
        frameNamesListDiv.appendChild(item);
    }
}

function importJSON() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target.result);
                if (json.frames) {
                    for (let key in json.frames) {
                        const frame = json.frames[key];
                        customFramesData[parseInt(key)] = {
                            x: frame.frame?.x ?? frame.x,
                            y: frame.frame?.y ?? frame.y,
                            w: frame.frame?.w ?? frame.w,
                            h: frame.frame?.h ?? frame.h
                        };
                        // Импортируем названия кадров если есть
                        if (frame.name) {
                            frameNames[parseInt(key)] = frame.name;
                        }
                    }
                }
                if (json.animations) {
                    Object.assign(customAnimations, json.animations);
                    renderPresets();
                }
                renderFrameNames();
                forceRedraw();
                alert('JSON успешно импортирован!');
            } catch (err) {
                alert('Ошибка импорта JSON: ' + err.message);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

function generateJSON(format = 'generic') {
    const totalCells = appState.cols * appState.rows;
    const framesData = {};

    for (let i = 0; i < totalCells; i++) {
        const rect = getFrameRectFromModule(i);
        const frameName = frameNames[i] || `frame_${i}`;
        
        if (format === 'unity') {
            framesData[i] = {
                name: frameName,
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                w: Math.round(rect.w),
                h: Math.round(rect.h)
            };
        } else if (format === 'godot') {
            framesData[i] = {
                name: frameName,
                texture: fileNameForJSON,
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                width: Math.round(rect.w),
                height: Math.round(rect.h)
            };
        } else if (format === 'phaser') {
            framesData[i] = {
                frame: i.toString(),
                name: frameName,
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                w: Math.round(rect.w),
                h: Math.round(rect.h)
            };
        } else {
            framesData[i] = {
                name: frameName,
                frame: {
                    x: Math.round(rect.x),
                    y: Math.round(rect.y),
                    w: Math.round(rect.w),
                    h: Math.round(rect.h)
                },
                spriteSourceSize: { x: 0, y: 0, w: Math.round(rect.w), h: Math.round(rect.h) },
                sourceSize: { w: Math.round(rect.w), h: Math.round(rect.h) }
            };
        }
    }

    let exportObj, extension = '.json';
    
    if (format === 'unity') {
        exportObj = { frames: framesData, animations: customAnimations };
        extension = '_unity.json';
    } else if (format === 'godot') {
        exportObj = { frames: framesData, meta: { image: fileNameForJSON, size: { w: img.width, h: img.height } } };
        extension = '_godot.json';
    } else if (format === 'phaser') {
        exportObj = { frames: framesData, animations: customAnimations, meta: { image: fileNameForJSON, size: { w: img.width, h: img.height } } };
        extension = '_phaser.json';
    } else {
        exportObj = {
            meta: { image: fileNameForJSON, format: "RGBA8888", size: { w: img.width, h: img.height }, scale: "1" },
            frames: framesData,
            animations: customAnimations
        };
        extension = '_atlas.json';
    }

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportObj, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    let outName = fileNameForJSON.split('.')[0] || "sprites";
    downloadAnchorNode.setAttribute("download", outName + extension);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

// Helper to get frame rect synchronously
function getFrameRectFromModule(index) {
    const cols = appState.cols || 1;
    const rows = appState.rows || 1;
    const baseW = img.width / cols;
    const baseH = img.height / rows;
    const col = index % cols;
    const row = Math.floor(index / cols);
    
    if (customFramesData[index]) {
        return customFramesData[index];
    }
    return {
        x: col * baseW,
        y: row * baseH,
        w: baseW,
        h: baseH
    };
}

// Экспорт функции для обновления списка названий при изменении сетки
export function updateFrameNamesList() {
    renderFrameNames();
}

// Делаем функцию доступной глобально для вызова из render.js
window.renderFrameNames = renderFrameNames;

window.onload = init;
