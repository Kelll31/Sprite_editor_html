// ==========================================
// SPRITE EDITOR - TOOLS MODULE (Auto-Crop, Auto-Slice, Remove Background)
// ==========================================

import { img, customFramesData, interactiveState, appState, frameNames } from './state.js';
import { getBaseGridRect, forceRedraw, updateConfigFromInputs } from './render.js';
import { pushUndo } from './undo.js';
import { saveToLocalStorage } from './storage.js';

export function autoCrop() {
    if (!img.complete || img.naturalWidth === 0) {
        alert('Сначала загрузите картинку!');
        return;
    }

    const index = interactiveState.selectedFrameIndex;
    const rect = getBaseGridRect(index);
    const oldData = customFramesData[index] ? { ...customFramesData[index] } : null;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = rect.w;
    tempCanvas.height = rect.h;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);

    const imageData = tempCtx.getImageData(0, 0, rect.w, rect.h);
    const data = imageData.data;

    let minX = rect.w, minY = rect.h, maxX = 0, maxY = 0;
    let hasContent = false;

    for (let y = 0; y < rect.h; y++) {
        for (let x = 0; x < rect.w; x++) {
            const alpha = data[(y * rect.w + x) * 4 + 3];
            if (alpha > 0) {
                hasContent = true;
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
            }
        }
    }

    if (hasContent) {
        const newRect = {
            x: rect.x + minX,
            y: rect.y + minY,
            w: maxX - minX + 1,
            h: maxY - minY + 1
        };

        customFramesData[index] = newRect;
        pushUndo('autocrop', index, oldData, { ...newRect });
        forceRedraw();
        saveToLocalStorage();
        alert(`Auto-Crop выполнен для кадра ${index}!\nНовые размеры: ${newRect.w}x${newRect.h}`);
    } else {
        alert('Кадр пустой (полностью прозрачный)');
    }
}

export function autoSlice() {
    if (!img.complete || img.naturalWidth === 0) {
        alert('Сначала загрузите картинку!');
        return;
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = img.width;
    tempCanvas.height = img.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(img, 0, 0);

    const imageData = tempCtx.getImageData(0, 0, img.width, img.height);
    const data = imageData.data;
    const visited = new Uint8Array(img.width * img.height);
    const objects = [];

    for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
            const idx = y * img.width + x;
            const alpha = data[idx * 4 + 3];

            if (alpha > 128 && !visited[idx]) {
                const bounds = floodFill(data, visited, x, y, img.width, img.height);
                if (bounds) {
                    objects.push(bounds);
                }
            }
        }
    }

    if (objects.length === 0) {
        alert('Не найдено объектов на прозрачном фоне');
        return;
    }

    const oldData = { ...customFramesData };
    // Clear instead of reassign
    Object.keys(customFramesData).forEach(key => delete customFramesData[key]);

    objects.forEach((bounds, i) => {
        customFramesData[i] = {
            x: bounds.minX,
            y: bounds.minY,
            w: bounds.maxX - bounds.minX + 1,
            h: bounds.maxY - bounds.minY + 1
        };
    });

    const cols = Math.ceil(Math.sqrt(objects.length));
    const rows = Math.ceil(objects.length / cols);
    document.getElementById('inpCols').value = cols;
    document.getElementById('inpRows').value = rows;

    pushUndo('autoslice', -1, oldData, { ...customFramesData });
    updateConfigFromInputs();
    forceRedraw();
    saveToLocalStorage();
    alert(`Auto-Slice найден ${objects.length} объект(ов)!`);
}

export function floodFill(data, visited, startX, startY, width, height) {
    const stack = [[startX, startY]];
    let minX = startX, minY = startY, maxX = startX, maxY = startY;

    while (stack.length > 0) {
        const [x, y] = stack.pop();
        const idx = y * width + x;

        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        if (visited[idx]) continue;
        if (data[idx * 4 + 3] < 128) continue;

        visited[idx] = 1;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);

        stack.push([x + 1, y]);
        stack.push([x - 1, y]);
        stack.push([x, y + 1]);
        stack.push([x, y - 1]);
    }

    if (maxX >= minX && maxY >= minY) {
        return { minX, minY, maxX, maxY };
    }
    return null;
}

// Авто-определение сетки по количеству объектов
export function autoDetectGrid() {
    if (!img.complete || img.naturalWidth === 0) {
        return { cols: 4, rows: 2 };
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = img.width;
    tempCanvas.height = img.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(img, 0, 0);

    const imageData = tempCtx.getImageData(0, 0, img.width, img.height);
    const data = imageData.data;
    const visited = new Uint8Array(img.width * img.height);
    const objects = [];

    for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
            const idx = y * img.width + x;
            const alpha = data[idx * 4 + 3];

            if (alpha > 128 && !visited[idx]) {
                const bounds = floodFill(data, visited, x, y, img.width, img.height);
                if (bounds) {
                    objects.push(bounds);
                }
            }
        }
    }

    if (objects.length === 0) {
        return { cols: 4, rows: 2 };
    }

    // Находим среднюю ширину и высоту объектов
    let totalWidth = 0;
    let totalHeight = 0;
    let minX = img.width;
    let maxX = 0;

    objects.forEach(bounds => {
        totalWidth += bounds.maxX - bounds.minX + 1;
        totalHeight += bounds.maxY - bounds.minY + 1;
        minX = Math.min(minX, bounds.minX);
        maxX = Math.max(maxX, bounds.maxX);
    });

    const avgWidth = totalWidth / objects.length;
    const avgHeight = totalHeight / objects.length;

    // Вычисляем количество колонок на основе ширины изображения и средней ширины объекта
    const estimatedCols = Math.round(img.width / avgWidth);
    const estimatedRows = Math.ceil(objects.length / estimatedCols);

    // Проверяем различные варианты сетки
    let bestCols = estimatedCols;
    let bestRows = estimatedRows;
    let bestFit = Infinity;

    for (let cols = 1; cols <= objects.length; cols++) {
        const rows = Math.ceil(objects.length / cols);
        const cellWidth = img.width / cols;
        const cellHeight = img.height / rows;

        // Оцениваем насколько хорошо сетка подходит под объекты
        let fit = 0;
        objects.forEach(bounds => {
            const objW = bounds.maxX - bounds.minX + 1;
            const objH = bounds.maxY - bounds.minY + 1;
            fit += Math.abs(cellWidth - objW) + Math.abs(cellHeight - objH);
        });

        if (fit < bestFit) {
            bestFit = fit;
            bestCols = cols;
            bestRows = rows;
        }
    }

    return { cols: bestCols, rows: bestRows, objectCount: objects.length, isGridPattern: false };
}

// Удаление фона (хромакей)
export function removeBackground(colorRgb, tolerance) {
    if (!img.complete || img.naturalWidth === 0) {
        alert('Сначала загрузите картинку!');
        return null;
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = img.width;
    tempCanvas.height = img.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(img, 0, 0);

    const imageData = tempCtx.getImageData(0, 0, img.width, img.height);
    const data = imageData.data;

    const [targetR, targetG, targetB] = colorRgb;

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Вычисляем разницу цвета
        const diff = Math.sqrt(
            Math.pow(r - targetR, 2) +
            Math.pow(g - targetG, 2) +
            Math.pow(b - targetB, 2)
        );

        // Если цвет в пределах допуска, делаем пиксель прозрачным
        if (diff <= tolerance * 2.55) {
            data[i + 3] = 0;
        }
    }

    tempCtx.putImageData(imageData, 0, 0);

    // Создаем новое изображение
    const newImg = new Image();
    newImg.src = tempCanvas.toDataURL();
    return newImg;
}

// Улучшенный Auto-Slice с фильтрацией мелких объектов
export function autoSliceImproved() {
    if (!img.complete || img.naturalWidth === 0) {
        alert('Сначала загрузите картинку!');
        return { success: false, gridVisible: false };
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = img.width;
    tempCanvas.height = img.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(img, 0, 0);

    const imageData = tempCtx.getImageData(0, 0, img.width, img.height);
    const data = imageData.data;
    const visited = new Uint8Array(img.width * img.height);
    const objects = [];

    // Минимальная площадь объекта (10x10 пикселей)
    const minArea = 100;
    const minDimension = 8;

    for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
            const idx = y * img.width + x;
            const alpha = data[idx * 4 + 3];

            if (alpha > 128 && !visited[idx]) {
                const bounds = floodFill(data, visited, x, y, img.width, img.height);
                if (bounds) {
                    const width = bounds.maxX - bounds.minX + 1;
                    const height = bounds.maxY - bounds.minY + 1;
                    const area = width * height;

                    // Фильтруем мелкие объекты
                    if (area >= minArea && width >= minDimension && height >= minDimension) {
                        objects.push(bounds);
                    }
                }
            }
        }
    }

    if (objects.length === 0) {
        alert('Не найдено объектов подходящего размера (мин. 10x10 px)');
        return { success: false, gridVisible: false };
    }

    const oldData = { ...customFramesData };
    Object.keys(customFramesData).forEach(key => delete customFramesData[key]);

    objects.forEach((bounds, i) => {
        customFramesData[i] = {
            x: bounds.minX,
            y: bounds.minY,
            w: bounds.maxX - bounds.minX + 1,
            h: bounds.maxY - bounds.minY + 1
        };
    });

    // Анализируем закономерность для авто-включения сетки
    const gridInfo = analyzeGridPattern(objects, img.width, img.height);
    
    if (gridInfo.isGridPattern) {
        document.getElementById('inpCols').value = gridInfo.cols;
        document.getElementById('inpRows').value = gridInfo.rows;
        document.getElementById('chkShowGrid').checked = true;
    } else {
        // Если нет закономерности, не включаем сетку
        document.getElementById('chkShowGrid').checked = false;
    }

    pushUndo('autoslice', -1, oldData, { ...customFramesData });
    updateConfigFromInputs();
    forceRedraw();
    saveToLocalStorage();
    
    return { 
        success: true, 
        objectCount: objects.length, 
        gridVisible: gridInfo.isGridPattern,
        cols: gridInfo.cols,
        rows: gridInfo.rows
    };
}

// Анализ закономерности сетки
function analyzeGridPattern(objects, canvasWidth, canvasHeight) {
    if (objects.length < 2) {
        return { isGridPattern: false, cols: 1, rows: 1 };
    }

    // Собираем все уникальные X и Y координаты
    const xCoords = [...new Set(objects.map(o => o.minX).sort((a, b) => a - b))];
    const yCoords = [...new Set(objects.map(o => o.minY).sort((a, b) => a - b))];

    // Проверяем, выровнены ли объекты по колонкам
    const colTolerance = 10;
    const rowTolerance = 10;
    
    // Группируем объекты по X координатам (колонки)
    const colGroups = {};
    objects.forEach(obj => {
        let foundCol = false;
        for (const colX of Object.keys(colGroups)) {
            if (Math.abs(obj.minX - parseInt(colX)) <= colTolerance) {
                colGroups[colX].push(obj);
                foundCol = true;
                break;
            }
        }
        if (!foundCol) {
            colGroups[obj.minX] = [obj];
        }
    });

    // Группируем объекты по Y координатам (строки)
    const rowGroups = {};
    objects.forEach(obj => {
        let foundRow = false;
        for (const rowY of Object.keys(rowGroups)) {
            if (Math.abs(obj.minY - parseInt(rowY)) <= rowTolerance) {
                rowGroups[rowY].push(obj);
                foundRow = true;
                break;
            }
        }
        if (!foundRow) {
            rowGroups[obj.minY] = [obj];
        }
    });

    const cols = Object.keys(colGroups).length;
    const rows = Object.keys(rowGroups).length;

    // Проверяем, заполняет ли сетка большинство ячеек
    const expectedCells = cols * rows;
    const fillRatio = objects.length / expectedCells;

    // Если заполнено более 50% ячеек и есть хотя бы 2 колонки или 2 строки - это сетка
    const isGridPattern = (fillRatio >= 0.5 && (cols >= 2 || rows >= 2)) || fillRatio >= 0.8;

    return {
        isGridPattern: isGridPattern,
        cols: cols,
        rows: rows,
        fillRatio: fillRatio
    };
}
