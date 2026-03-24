// ==========================================
// SPRITE EDITOR - STATE MODULE
// ==========================================

export let appState = {
    cols: 4,
    rows: 2,
    scale: 3,
    activeFrames: [0],
    offsets: [],
    fps: 10,
    playMode: 'loop',
    gridVisible: true
};

export let customAnimations = {};
export let customFramesData = {};
export let frameNames = {};

export let img = new Image();
export let fileNameForJSON = "spritesheet.png";

export let interactiveState = {
    selectedFrameIndex: 0,
    isDragging: false,
    action: null,
    startX: 0,
    startY: 0,
    origRect: null
};

// Animation variables - mutable via animationState object
export let animationState = {
    frameIdx: 0,
    isPaused: false,
    pingpongDirection: 1,
    lastFrameTime: 0,
    hasPlayedOnce: false
};

// Zoom & Pan variables
export let viewState = {
    zoom: 1,
    panX: 0,
    panY: 0,
    isPanning: false,
    panStartX: 0,
    panStartY: 0
};
