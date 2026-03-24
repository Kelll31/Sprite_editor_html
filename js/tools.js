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
    const oldNames = { ...frameNames };

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
        pushUndo('autocrop', index, oldData, { ...newRect }, oldNames, { ...frameNames });
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

// Удаление фона (хромакей) - предпросмотр
export function previewRemoveBackground(colorRgb, tolerance, previewCanvas) {
    if (!img.complete || img.naturalWidth === 0 || !previewCanvas) {
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

    // Отображаем на preview canvas
    const maxWidth = 300;
    const scale = Math.min(1, maxWidth / img.width);
    previewCanvas.width = img.width * scale;
    previewCanvas.height = img.height * scale;
    const previewCtx = previewCanvas.getContext('2d');
    previewCtx.imageSmoothingEnabled = false;
    previewCtx.drawImage(tempCanvas, 0, 0, previewCanvas.width, previewCanvas.height);

    return tempCanvas;
}

// Удаление фона (хромакей) - финальное применение
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

// Получить цвет пикселя из canvas
export function pickColorFromCanvas(canvas, x, y) {
    if (!img.complete || img.naturalWidth === 0) {
        return null;
    }

    const rect = canvas.getBoundingClientRect();
    const scaleX = img.width / rect.width;
    const scaleY = img.height / rect.height;

    const pixelX = Math.floor((x - rect.left) * scaleX);
    const pixelY = Math.floor((y - rect.top) * scaleY);

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = img.width;
    tempCanvas.height = img.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(img, 0, 0);

    const imageData = tempCtx.getImageData(pixelX, pixelY, 1, 1);
    const data = imageData.data;

    return {
        r: data[0],
        g: data[1],
        b: data[2],
        rgb: `${data[0]},${data[1]},${data[2]}`
    };
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
    
    // Предварительная обработка - бинаризация и шумоподавление
    const binaryMask = preprocessImage(data, img.width, img.height);
    
    // Морфологическая операция - замыкание для соединения близких частей
    const closedMask = morphologicalClose(binaryMask, img.width, img.height, 2);
    
    const visited = new Uint8Array(img.width * img.height);
    const objects = [];

    // Минимальная площадь объекта (8x8 пикселей)
    const minArea = 64;
    const minDimension = 6;

    for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
            const idx = y * img.width + x;
            
            if (closedMask[idx] && !visited[idx]) {
                const bounds = floodFillImproved(closedMask, visited, x, y, img.width, img.height);
                if (bounds) {
                    const width = bounds.maxX - bounds.minX + 1;
                    const height = bounds.maxY - bounds.minY + 1;
                    const area = width * height;

                    // Фильтруем мелкие объекты
                    if (area >= minArea && width >= minDimension && height >= minDimension) {
                        // Добавляем небольшой padding (2px) для захвата краёв
                        objects.push({
                            minX: Math.max(0, bounds.minX - 2),
                            minY: Math.max(0, bounds.minY - 2),
                            maxX: Math.min(img.width - 1, bounds.maxX + 2),
                            maxY: Math.min(img.height - 1, bounds.maxY + 2)
                        });
                    }
                }
            }
        }
    }

    if (objects.length === 0) {
        alert('Не найдено объектов подходящего размера (мин. 8x8 px)');
        return { success: false, gridVisible: false };
    }

    // Сортируем объекты слева-направо, сверху-вниз для лучшего соответствия сетке
    objects.sort((a, b) => {
        const rowA = Math.floor(a.minY / 10);
        const rowB = Math.floor(b.minY / 10);
        if (rowA !== rowB) return rowA - rowB;
        return a.minX - b.minX;
    });

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
    const gridInfo = analyzeGridPatternImproved(objects, img.width, img.height);
    
    // Всегда выставляем количество колонок и строк
    document.getElementById('inpCols').value = gridInfo.cols;
    document.getElementById('inpRows').value = gridInfo.rows;
    
    if (gridInfo.isGridPattern) {
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

// Предварительная обработка изображения - бинаризация
function preprocessImage(data, width, height) {
    const mask = new Uint8Array(width * height);
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const alpha = data[idx + 3];
            // Учитываем также яркость для полу-прозрачных пикселей
            const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
            const hasContent = alpha > 100 || (alpha > 50 && brightness < 200);
            mask[y * width + x] = hasContent ? 1 : 0;
        }
    }
    
    return mask;
}

// Морфологическое замыкание (дилатация + эрозия)
function morphologicalClose(mask, width, height, radius) {
    const dilated = new Uint8Array(width * height);
    const closed = new Uint8Array(width * height);
    
    // Дилатация
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let hasNeighbor = false;
            for (let dy = -radius; dy <= radius && !hasNeighbor; dy++) {
                for (let dx = -radius; dx <= radius && !hasNeighbor; dx++) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                        if (mask[ny * width + nx]) {
                            hasNeighbor = true;
                        }
                    }
                }
            }
            dilated[y * width + x] = hasNeighbor ? 1 : 0;
        }
    }
    
    // Эрозия
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let allFilled = true;
            for (let dy = -radius; dy <= radius && allFilled; dy++) {
                for (let dx = -radius; dx <= radius && allFilled; dx++) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                        if (!dilated[ny * width + nx]) {
                            allFilled = false;
                        }
                    }
                }
            }
            closed[y * width + x] = allFilled ? 1 : 0;
        }
    }
    
    return closed;
}

// Улучшенный flood fill с 8-связностью
function floodFillImproved(mask, visited, startX, startY, width, height) {
    const stack = [[startX, startY]];
    let minX = startX, minY = startY, maxX = startX, maxY = startY;
    let pixelCount = 0;

    while (stack.length > 0) {
        const [x, y] = stack.pop();
        const idx = y * width + x;

        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        if (visited[idx]) continue;
        if (!mask[idx]) continue;

        visited[idx] = 1;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        pixelCount++;

        // 8-связность вместо 4-связности
        stack.push([x + 1, y]);
        stack.push([x - 1, y]);
        stack.push([x, y + 1]);
        stack.push([x, y - 1]);
        stack.push([x + 1, y + 1]);
        stack.push([x - 1, y - 1]);
        stack.push([x + 1, y - 1]);
        stack.push([x - 1, y + 1]);
    }

    if (pixelCount > 0) {
        return { minX, minY, maxX, maxY };
    }
    return null;
}

// Улучшенный анализ сетки с кластеризацией
function analyzeGridPatternImproved(objects, canvasWidth, canvasHeight) {
    if (objects.length < 2) {
        return { isGridPattern: false, cols: 1, rows: 1 };
    }

    // Кластеризация по X координатам с допуском
    const colTolerance = 15;
    const rowTolerance = 15;
    
    // Собираем все X и Y центры объектов
    const centers = objects.map(obj => ({
        x: (obj.minX + obj.maxX) / 2,
        y: (obj.minY + obj.maxY) / 2,
        w: obj.maxX - obj.minX + 1,
        h: obj.maxY - obj.minY + 1
    }));

    // Группируем по Y координатам (строки)
    const rowGroups = [];
    centers.forEach((center, i) => {
        let foundRow = -1;
        for (let r = 0; r < rowGroups.length; r++) {
            if (Math.abs(center.y - rowGroups[r].y) <= rowTolerance) {
                foundRow = r;
                break;
            }
        }
        if (foundRow >= 0) {
            rowGroups[foundRow].objects.push({ ...center, origIdx: i });
            rowGroups[foundRow].y = (rowGroups[foundRow].y * rowGroups[foundRow].count + center.y) / (rowGroups[foundRow].count + 1);
            rowGroups[foundRow].count++;
        } else {
            rowGroups.push({ y: center.y, objects: [{ ...center, origIdx: i }], count: 1 });
        }
    });

    // Группируем по X координатам (колонки)
    const colGroups = [];
    centers.forEach((center, i) => {
        let foundCol = -1;
        for (let c = 0; c < colGroups.length; c++) {
            if (Math.abs(center.x - colGroups[c].x) <= colTolerance) {
                foundCol = c;
                break;
            }
        }
        if (foundCol >= 0) {
            colGroups[foundCol].objects.push({ ...center, origIdx: i });
            colGroups[foundCol].x = (colGroups[foundCol].x * colGroups[foundCol].count + center.x) / (colGroups[foundCol].count + 1);
            colGroups[foundCol].count++;
        } else {
            colGroups.push({ x: center.x, objects: [{ ...center, origIdx: i }], count: 1 });
        }
    });

    const rows = rowGroups.length;
    const cols = colGroups.length;
    const expectedCells = cols * rows;
    const fillRatio = objects.length / expectedCells;

    // Проверяем регулярность сетки
    let regularity = 0;
    
    // Проверяем равномерность строк
    if (rows > 1) {
        const rowHeights = [];
        for (let r = 0; r < rows - 1; r++) {
            rowHeights.push(rowGroups[r + 1].y - rowGroups[r].y);
        }
        const avgHeight = rowHeights.reduce((a, b) => a + b, 0) / rowHeights.length;
        const heightVariance = rowHeights.reduce((sum, h) => sum + Math.pow(h - avgHeight, 2), 0) / rowHeights.length;
        regularity += Math.sqrt(heightVariance) < avgHeight * 0.5 ? 1 : 0;
    }
    
    // Проверяем равномерность колонок
    if (cols > 1) {
        const colWidths = [];
        for (let c = 0; c < cols - 1; c++) {
            colWidths.push(colGroups[c + 1].x - colGroups[c].x);
        }
        const avgWidth = colWidths.reduce((a, b) => a + b, 0) / colWidths.length;
        const widthVariance = colWidths.reduce((sum, w) => sum + Math.pow(w - avgWidth, 2), 0) / colWidths.length;
        regularity += Math.sqrt(widthVariance) < avgWidth * 0.5 ? 1 : 0;
    }

    // Определяем если это сетка
    const isGridPattern = (fillRatio >= 0.4 && (cols >= 2 || rows >= 2)) || 
                          fillRatio >= 0.7 || 
                          (regularity >= 1 && objects.length >= 4);

    return {
        isGridPattern: isGridPattern,
        cols: cols,
        rows: rows,
        fillRatio: fillRatio,
        regularity: regularity
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
