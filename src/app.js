// app.js - Main Frontend Logic (Redesigned with text selection, merged toolbars, and scroll-preserved zoom)

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = '../node_modules/pdfjs-dist/build/pdf.worker.min.js';

// State
let openDocs = [];
let activeDocId = null;
let currentTool = 'select'; // Default selection mode
let currentColor = '#3b82f6';
let currentThickness = 3;
let zoomLevel = 1.5; // Default 150%
let laserTrailDuration = 800; // Default 800ms
let savedBeforeRightClickTool = null;
let laserTrailPoints = []; // [{ x, y, time, pageNum }]
let laserLoopRunning = false;
let currentRenderTaskId = 0;
let lastActivePageNum = 1;
let pageIndicatorShowTimer = null;
let lastMouseX = 0;
let lastMouseY = 0;
let mouseWasInVicinity = false;
let isNavigatingFromIndicator = false;
let lastTimeInVicinity = 0;

// UI elements
const toolBtns = document.querySelectorAll('.tool-btn[data-tool]');
const colorPicker = document.getElementById('color-picker');
const colorSwatches = document.querySelectorAll('.color-swatch');
const thicknessSlider = document.getElementById('thickness-slider');
const thicknessPreview = document.getElementById('thickness-preview');
const thicknessVal = document.getElementById('thickness-val');

// DOM Elements
const tabsContainer = document.getElementById('tabs-container');
const emptyState = document.getElementById('empty-state');
const scrollContainer = document.getElementById('pdf-scroll-container');
const workspace = document.getElementById('workspace');
const laserDot = document.getElementById('laser-dot');
const revealOverlay = document.getElementById('global-reveal-overlay');
const revealCurtain = document.querySelector('.reveal-curtain');
const revealHandle = document.querySelector('.reveal-handle');

// Flags
let isRevealActive = false;
let isDrawing = false;
let isErasing = false;
let isLaserActive = false;
let currentPath = null;
let tempShape = null;

let appVersion = 'v2.4';

// Initialize UI
async function init() {
  // Load dynamic app version from package.json
  try {
    if (window.api && typeof window.api.getAppVersion === 'function') {
      const fullVer = await window.api.getAppVersion();
      if (fullVer) {
        const parts = fullVer.split('.');
        appVersion = 'v' + parts[0] + '.' + parts[1];
      }
    }
  } catch (e) {
    console.error('Failed to load app version:', e);
  }

  // Initialize Theme
  const themeToggleBtn = document.getElementById('btn-theme-toggle');
  const savedTheme = localStorage.getItem('theme') || 'dark';
  
  if (savedTheme === 'light') {
    document.body.classList.add('light-mode');
    if (themeToggleBtn) {
      themeToggleBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
      themeToggleBtn.setAttribute('title', 'Switch to Dark Theme');
    }
  } else {
    document.body.classList.remove('light-mode');
    if (themeToggleBtn) {
      themeToggleBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
      themeToggleBtn.setAttribute('title', 'Switch to Light Theme');
    }
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const isLight = document.body.classList.toggle('light-mode');
      localStorage.setItem('theme', isLight ? 'light' : 'dark');
      
      if (isLight) {
        themeToggleBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
        themeToggleBtn.setAttribute('title', 'Switch to Dark Theme');
      } else {
        themeToggleBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
        themeToggleBtn.setAttribute('title', 'Switch to Light Theme');
      }
    });
  }

  const shapesDropdown = document.getElementById('shapes-dropdown');
  const shapeItems = shapesDropdown.querySelectorAll('.dropdown-item');
  const shapeActiveIcon = document.getElementById('shape-active-icon');
  const btnShapeSelect = document.getElementById('btn-shape-select');
  const btnShapeArrow = document.getElementById('btn-shape-arrow');

  const colorsDropdown = document.getElementById('colors-dropdown');
  const btnColorSelect = document.getElementById('btn-color-select');
  const btnColorArrow = document.getElementById('btn-color-arrow');

  const laserDropdown = document.getElementById('laser-dropdown');
  const btnLaser = document.getElementById('btn-laser');
  const btnLaserArrow = document.getElementById('btn-laser-arrow');
  const laserDurationSlider = document.getElementById('laser-duration-slider');
  const laserDurationVal = document.getElementById('laser-duration-val');

  const thicknessDropdown = document.getElementById('thickness-dropdown');
  const btnThicknessSelect = document.getElementById('btn-thickness-select');
  const btnThicknessArrow = document.getElementById('btn-thickness-arrow');

  // Bind tool buttons
  toolBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      toolBtns.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      currentTool = btn.dataset.tool;

      // Deactivate the shape selector trigger button and shape items
      btnShapeSelect.classList.remove('active');
      btnShapeSelect.setAttribute('aria-pressed', 'false');
      shapeItems.forEach(si => si.classList.remove('active'));

      // Close all dropdowns
      shapesDropdown.classList.remove('show');
      colorsDropdown.classList.remove('show');
      laserDropdown.classList.remove('show');
      thicknessDropdown.classList.remove('show');

      updateCursor();
    });
  });

  // Shapes Split Button Click Bindings
  btnShapeSelect.addEventListener('click', (e) => {
    e.stopPropagation();
    
    // Activate the active shape tool
    const activeShapeItem = Array.from(shapeItems).find(si => si.classList.contains('active'));
    currentTool = activeShapeItem ? activeShapeItem.dataset.tool : 'box';
    
    // Deactivate other main tools
    toolBtns.forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    });
    
    btnShapeSelect.classList.add('active');
    btnShapeSelect.setAttribute('aria-pressed', 'true');
    
    // Close all dropdowns
    shapesDropdown.classList.remove('show');
    colorsDropdown.classList.remove('show');
    laserDropdown.classList.remove('show');
    thicknessDropdown.classList.remove('show');
    
    updateCursor();
  });

  btnShapeArrow.addEventListener('click', (e) => {
    e.stopPropagation();
    shapesDropdown.classList.toggle('show');
    colorsDropdown.classList.remove('show');
    laserDropdown.classList.remove('show');
    thicknessDropdown.classList.remove('show');
  });

  shapeItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      
      shapeItems.forEach(si => si.classList.remove('active'));
      item.classList.add('active');
      
      currentTool = item.dataset.tool;
      
      // Deactivate other main tools
      toolBtns.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      
      // Activate trigger
      btnShapeSelect.classList.add('active');
      btnShapeSelect.setAttribute('aria-pressed', 'true');
      
      // Copy SVG icon innerHTML to trigger button
      shapeActiveIcon.innerHTML = item.querySelector('svg').innerHTML;
      
      shapesDropdown.classList.remove('show');
      updateCursor();
    });
  });

  // Laser Settings Arrow Click Toggle
  btnLaserArrow.addEventListener('click', (e) => {
    e.stopPropagation();
    laserDropdown.classList.toggle('show');
    shapesDropdown.classList.remove('show');
    colorsDropdown.classList.remove('show');
    thicknessDropdown.classList.remove('show');
  });

  if (laserDurationSlider) {
    laserDurationSlider.addEventListener('input', (e) => {
      laserTrailDuration = parseInt(e.target.value);
      laserDurationVal.innerText = (laserTrailDuration / 1000).toFixed(1) + 's';
    });
  }

  // Colors Split Button Click Bindings
  btnColorSelect.addEventListener('click', (e) => {
    e.stopPropagation();
    
    const drawingTools = ['pen', 'highlighter', 'box', 'circle', 'line', 'arrow', 'text'];
    if (!drawingTools.includes(currentTool)) {
      currentTool = 'pen';
    }
    
    // Close all dropdowns
    shapesDropdown.classList.remove('show');
    colorsDropdown.classList.remove('show');
    laserDropdown.classList.remove('show');
    thicknessDropdown.classList.remove('show');
    
    updateCursor();
  });

  btnColorArrow.addEventListener('click', (e) => {
    e.stopPropagation();
    colorsDropdown.classList.toggle('show');
    shapesDropdown.classList.remove('show');
    laserDropdown.classList.remove('show');
    thicknessDropdown.classList.remove('show');
  });

  // Color Swatch Selection
  colorSwatches.forEach(swatch => {
    swatch.addEventListener('click', (e) => {
      e.stopPropagation();
      colorSwatches.forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
      currentColor = swatch.dataset.color;
      colorPicker.value = currentColor; // Sync native picker
      document.getElementById('color-preview').style.backgroundColor = currentColor;
      currentTool = 'pen';
      updateThicknessPreview();
      colorsDropdown.classList.remove('show');
      updateCursor();
    });
  });

  // Custom Color Input Selection
  colorPicker.addEventListener('input', (e) => {
    currentColor = e.target.value;
    colorSwatches.forEach(s => s.classList.remove('active'));
    document.getElementById('color-preview').style.backgroundColor = currentColor;
    currentTool = 'pen';
    updateThicknessPreview();
    updateCursor();
  });

  // Thickness Split Button Click Bindings
  btnThicknessSelect.addEventListener('click', (e) => {
    e.stopPropagation();
    
    const drawingTools = ['pen', 'highlighter', 'box', 'circle', 'line', 'arrow', 'text'];
    if (!drawingTools.includes(currentTool)) {
      currentTool = 'pen';
    }
    
    // Close all dropdowns
    shapesDropdown.classList.remove('show');
    colorsDropdown.classList.remove('show');
    laserDropdown.classList.remove('show');
    thicknessDropdown.classList.remove('show');
    
    updateCursor();
  });

  btnThicknessArrow.addEventListener('click', (e) => {
    e.stopPropagation();
    thicknessDropdown.classList.toggle('show');
    shapesDropdown.classList.remove('show');
    colorsDropdown.classList.remove('show');
    laserDropdown.classList.remove('show');
  });

  // Close dropdowns on outside click
  document.addEventListener('click', (e) => {
    if (!shapesDropdown.contains(e.target)) {
      shapesDropdown.classList.remove('show');
    }
    if (!colorsDropdown.contains(e.target)) {
      colorsDropdown.classList.remove('show');
    }
    if (laserDropdown && !laserDropdown.contains(e.target)) {
      laserDropdown.classList.remove('show');
    }
    if (thicknessDropdown && !thicknessDropdown.contains(e.target)) {
      thicknessDropdown.classList.remove('show');
    }
  });

  // Thickness slider
  thicknessSlider.addEventListener('input', (e) => {
    currentThickness = parseInt(e.target.value);
    updateThicknessPreview();
  });

  // Page Navigation Listeners
  const pageInput = document.getElementById('current-page-input');
  const btnPagePrev = document.getElementById('btn-page-prev');
  const btnPageNext = document.getElementById('btn-page-next');

  if (pageInput) {
    const navigateToInputPage = () => {
      const doc = openDocs.find(d => d.id === activeDocId);
      if (!doc) return;
      let pageNum = parseInt(pageInput.value);
      if (isNaN(pageNum)) {
        updateCurrentPageOnScroll();
        return;
      }
      pageNum = Math.max(1, Math.min(doc.pageCount, pageNum));
      pageInput.value = pageNum;
      
      const pageEl = document.querySelector(`.page-container[data-page="${pageNum}"]`);
      if (pageEl) {
        isNavigatingFromIndicator = true;
        scrollContainer.scrollTop = pageEl.offsetTop;
        setTimeout(() => { isNavigatingFromIndicator = false; }, 500);
      }
    };

    pageInput.addEventListener('change', navigateToInputPage);
    pageInput.addEventListener('input', navigateToInputPage);
    pageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        pageInput.blur();
      }
    });
  }

  if (btnPagePrev) {
    btnPagePrev.addEventListener('click', () => {
      const doc = openDocs.find(d => d.id === activeDocId);
      if (!doc) return;
      if (!pageInput) return;
      let pageNum = parseInt(pageInput.value) || 1;
      if (pageNum > 1) {
        pageNum--;
        pageInput.value = pageNum;
        const pageEl = document.querySelector(`.page-container[data-page="${pageNum}"]`);
        if (pageEl) {
          isNavigatingFromIndicator = true;
          scrollContainer.scrollTop = pageEl.offsetTop;
          setTimeout(() => { isNavigatingFromIndicator = false; }, 500);
        }
      }
    });
  }

  if (btnPageNext) {
    btnPageNext.addEventListener('click', () => {
      const doc = openDocs.find(d => d.id === activeDocId);
      if (!doc) return;
      if (!pageInput) return;
      let pageNum = parseInt(pageInput.value) || 1;
      if (pageNum < doc.pageCount) {
        pageNum++;
        pageInput.value = pageNum;
        const pageEl = document.querySelector(`.page-container[data-page="${pageNum}"]`);
        if (pageEl) {
          isNavigatingFromIndicator = true;
          scrollContainer.scrollTop = pageEl.offsetTop;
          setTimeout(() => { isNavigatingFromIndicator = false; }, 500);
        }
      }
    });
  }

  // Action Buttons
  document.getElementById('btn-open').addEventListener('click', openPdfDialog);
  document.getElementById('btn-open-empty').addEventListener('click', openPdfDialog);
  document.getElementById('btn-save').addEventListener('click', savePdf);
  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-redo').addEventListener('click', redo);
  document.getElementById('btn-clear-all').addEventListener('click', clearAllAnnotations);

  // Zoom Actions
  document.getElementById('btn-zoom-in').addEventListener('click', zoomIn);
  document.getElementById('btn-zoom-out').addEventListener('click', zoomOut);

  // Reveal Curtain Trigger
  document.getElementById('btn-reveal').addEventListener('click', (e) => {
    isRevealActive = !isRevealActive;
    const btn = e.currentTarget;
    btn.classList.toggle('active', isRevealActive);
    btn.setAttribute('aria-pressed', isRevealActive ? 'true' : 'false');
    revealOverlay.style.display = isRevealActive ? 'block' : 'none';
    if (isRevealActive) {
      revealCurtain.style.height = '100%';
      revealHandle.focus();
    }
  });

  // Fullscreen Mode
  document.getElementById('btn-fullscreen').addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  });

  // Move Laser pointer and create glowing fading trail
  document.addEventListener('mousemove', (e) => {
    if (currentTool === 'laser' || isLaserActive) {
      laserDot.style.left = e.clientX + 'px';
      laserDot.style.top = e.clientY + 'px';
    }

    if (isLaserActive) {
      const now = Date.now();
      const lastPoint = laserTrailPoints[laserTrailPoints.length - 1];
      if (!lastPoint || Math.hypot(e.clientX - lastPoint.x, e.clientY - lastPoint.y) > 2) {
        laserTrailPoints.push({ x: e.clientX, y: e.clientY, time: now });
        runLaserLoop();
      }
    }
  });

  // Drag and drop setup
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      for (const file of e.dataTransfer.files) {
        if (file.name.toLowerCase().endsWith('.pdf')) {
          const reader = new FileReader();
          reader.onload = async (event) => {
            const bytes = new Uint8Array(event.target.result);
            loadPdf({
              name: file.name,
              filePath: file.path,
              bytes: bytes
            });
          };
          reader.readAsArrayBuffer(file);
        }
      }
    }
  });

  // Keyboard accessibility & zoom shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.ctrlKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undo();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redo();
    } else if (e.ctrlKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      savePdf();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      openPdfDialog();
    } else if (e.ctrlKey && (e.key === '=' || e.key === '+')) {
      e.preventDefault();
      zoomIn();
    } else if (e.ctrlKey && e.key === '-') {
      e.preventDefault();
      zoomOut();
    } else if (e.ctrlKey && e.key === '0') {
      e.preventDefault();
      setZoom(1.5);
    } else if (e.key.toLowerCase() === 'p') {
      const btn = document.querySelector('[data-tool="pen"]');
      if (btn) btn.click();
    } else if (e.key.toLowerCase() === 'h') {
      const btn = document.querySelector('[data-tool="highlighter"]');
      if (btn) btn.click();
    } else if (e.key.toLowerCase() === 'e') {
      const btn = document.querySelector('[data-tool="eraser"]');
      if (btn) btn.click();
    } else if (e.key.toLowerCase() === 'v') {
      const btn = document.querySelector('[data-tool="select"]');
      if (btn) btn.click();
    } else if (e.key.toLowerCase() === 't') {
      const btn = document.querySelector('[data-tool="text"]');
      if (btn) btn.click();
    } else if (e.key.toLowerCase() === 'l') {
      const btn = document.getElementById('btn-laser');
      if (btn) btn.click();
    } else if (e.key.toLowerCase() === 'r') {
      const btn = document.getElementById('btn-reveal');
      if (btn) btn.click();
    }
  });

  // Ctrl + Mouse Wheel zoom binding on document
  document.addEventListener('wheel', (e) => {
    if (e.ctrlKey) {
      e.preventDefault();
      if (e.deltaY < 0) {
        zoomIn();
      } else {
        zoomOut();
      }
    }
  }, { passive: false });

  // Merged Toolbar layout switcher (horizontal default, vertical splits into two columns)
  const layoutBtn = document.getElementById('btn-layout-toggle');
  const appToolbar = document.getElementById('app-toolbar');
  
  const savedLayout = localStorage.getItem('toolbar-layout') || 'horizontal';
  if (savedLayout === 'vertical') {
    appToolbar.classList.add('vertical');
    layoutBtn.setAttribute('aria-pressed', 'true');
    layoutBtn.querySelector('svg').innerHTML = '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>';
  } else {
    appToolbar.classList.remove('vertical');
    layoutBtn.setAttribute('aria-pressed', 'false');
    layoutBtn.querySelector('svg').innerHTML = '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/>';
  }

  layoutBtn.addEventListener('click', () => {
    const isVertical = appToolbar.classList.toggle('vertical');
    localStorage.setItem('toolbar-layout', isVertical ? 'vertical' : 'horizontal');
    layoutBtn.setAttribute('aria-pressed', isVertical ? 'true' : 'false');
    
    if (isVertical) {
      layoutBtn.querySelector('svg').innerHTML = '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>';
    } else {
      layoutBtn.querySelector('svg').innerHTML = '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/>';
    }
  });

  // Grab-to-scroll panning on empty space
  let isPanning = false;
  let startX, startY;
  let startScrollLeft, startScrollTop;

  scrollContainer.addEventListener('mousedown', (e) => {
    if (currentTool !== 'select') return;
    
    // Allow text selection if user is clicking on a span inside textLayer
    if (e.target.closest('.textLayer span')) return;
    
    // Only pan on left click
    if (e.button !== 0) return;
    
    isPanning = true;
    document.body.classList.add('grabbing');
    
    startX = e.clientX;
    startY = e.clientY;
    startScrollLeft = scrollContainer.scrollLeft;
    startScrollTop = scrollContainer.scrollTop;
    
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!isPanning) return;
    
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    
    scrollContainer.scrollLeft = startScrollLeft - dx;
    scrollContainer.scrollTop = startScrollTop - dy;
  });

  window.addEventListener('mouseup', () => {
    if (isPanning) {
      isPanning = false;
      document.body.classList.remove('grabbing');
    }
    isErasing = false;
    isDrawing = false; // Reset drawing flag globally on mouseup
  });

  setupRevealDrag();
  updateThicknessPreview();
  updateCursor();
  scrollContainer.addEventListener('scroll', updateCurrentPageOnScroll);

  // Right-click automatically gets the Laser tool temporarily
  document.addEventListener('mousedown', (e) => {
    if (e.button === 2 && workspace.contains(e.target)) { // Right click inside PDF area
      e.preventDefault();
      if (currentTool !== 'laser' && !savedBeforeRightClickTool) {
        savedBeforeRightClickTool = currentTool;
        currentTool = 'laser';
      }
      isLaserActive = true;
      laserTrailPoints = [];
      updateCursor();
      
      // Position laser dot immediately
      laserDot.style.left = e.clientX + 'px';
      laserDot.style.top = e.clientY + 'px';
      laserTrailPoints.push({ x: e.clientX, y: e.clientY, time: Date.now() });
      runLaserLoop();
    } else if (e.button === 0 && currentTool === 'laser' && workspace.contains(e.target)) { // Left click laser inside PDF area
      isLaserActive = true;
      laserTrailPoints = [];
      updateCursor();
      
      // Position laser dot immediately
      laserDot.style.left = e.clientX + 'px';
      laserDot.style.top = e.clientY + 'px';
      laserTrailPoints.push({ x: e.clientX, y: e.clientY, time: Date.now() });
      runLaserLoop();
    }
  });

  document.addEventListener('mouseup', (e) => {
    if (e.button === 2) { // Right click release
      if (savedBeforeRightClickTool) {
        currentTool = savedBeforeRightClickTool;
        savedBeforeRightClickTool = null;
      }
      isLaserActive = false;
      updateCursor();
    } else if (e.button === 0 && currentTool === 'laser') { // Left click laser release
      isLaserActive = false;
      updateCursor();
    }
  });

  document.addEventListener('contextmenu', (e) => {
    e.preventDefault(); // Disable default context menu globally for presentations
  });

  if (window.api && typeof window.api.onTryClose === 'function') {
    window.api.onTryClose(async () => {
      const hasUnsaved = openDocs.some(d => d.hasUnsavedChanges);
      if (!hasUnsaved) {
        setTimeout(() => {
          window.api.closeApp();
        }, 150);
        return;
      }
      
      const choice = await showUnsavedChangesAppCloseModal();
      if (choice === 'save') {
        const saved = await saveAllUnsavedDocs();
        document.getElementById('unsaved-modal').style.display = 'none';
        if (saved) {
          setTimeout(() => {
            window.api.closeApp();
          }, 150);
        }
      } else if (choice === 'discard') {
        document.getElementById('unsaved-modal').style.display = 'none';
        setTimeout(() => {
          window.api.closeApp();
        }, 150);
      }
      // if choice === 'cancel', we do nothing and stay in the app
    });
  }

  updateAppTitle();

  // Vicinity hover page-indicator trigger
  const pageIndicator = document.getElementById('page-indicator');
  if (pageIndicator) {
    document.addEventListener('mousemove', (e) => {
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      updatePageIndicatorVisibility(lastMouseX, lastMouseY);
    });
  }
}

// Thickness indicator dot resizing
function updateThicknessPreview() {
  if (thicknessPreview) {
    thicknessPreview.style.width = Math.max(3, currentThickness) + 'px';
    thicknessPreview.style.height = Math.max(3, currentThickness) + 'px';
    thicknessPreview.style.backgroundColor = currentColor;
  }
  if (thicknessVal) {
    thicknessVal.innerText = currentThickness + 'px';
  }
}

// Reveal Curtain sliding and keyboard control
function setupRevealDrag() {
  let isDraggingCurtain = false;
  
  // Mouse drag control
  revealHandle.addEventListener('mousedown', () => isDraggingCurtain = true);
  document.addEventListener('mousemove', (e) => {
    if (isDraggingCurtain) {
      revealCurtain.style.height = e.clientY + 'px';
      updateCurtainAria(e.clientY);
    }
  });
  document.addEventListener('mouseup', () => isDraggingCurtain = false);

  // Keyboard control
  revealHandle.addEventListener('keydown', (e) => {
    const step = 25;
    const currentHeight = revealCurtain.offsetHeight;
    let newHeight = currentHeight;
    
    if (e.key === 'ArrowDown') {
      newHeight = currentHeight + step;
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      newHeight = Math.max(0, currentHeight - step);
      e.preventDefault();
    }
    
    revealCurtain.style.height = newHeight + 'px';
    updateCurtainAria(newHeight);
  });
}

function updateCurtainAria(height) {
  const totalHeight = window.innerHeight;
  const percentage = Math.round((height / totalHeight) * 100);
  revealHandle.setAttribute('aria-valuenow', percentage);
}

// Cursor and pointer-events toggles to enable text selection under drawings
function updateCursor() {
  const canvases = document.querySelectorAll('.drawing-canvas');
  const textLayers = document.querySelectorAll('.textLayer');
  const appContainer = document.getElementById('app-container');

  // Synchronize toolbar button active states
  syncToolbarButtons();

  if (currentTool === 'select') {
    appContainer.classList.add('select-tool-active');
  } else {
    appContainer.classList.remove('select-tool-active');
  }

  let cursor = 'crosshair';
  let drawingPointerEvents = 'auto';
  let textPointerEvents = 'none';

  if (currentTool === 'select') {
    cursor = 'grab';
    drawingPointerEvents = 'none'; // Let click events fall through drawing canvas
    textPointerEvents = 'auto'; // Enable selectable PDF text elements
  } else if (currentTool === 'eraser') {
    cursor = ''; // Overridden by eraser-cursor class
  } else if (currentTool === 'text') {
    cursor = 'text';
  } else if (currentTool === 'laser') {
    cursor = isLaserActive ? 'none' : 'default'; // Hide native cursor in laser mode only when active
    drawingPointerEvents = 'none';
    textPointerEvents = 'none';
  }

  canvases.forEach(c => {
    if (currentTool === 'eraser') {
      c.classList.add('eraser-cursor');
    } else {
      c.classList.remove('eraser-cursor');
    }
    c.style.cursor = cursor;
    c.style.pointerEvents = drawingPointerEvents;
  });
  textLayers.forEach(tl => {
    tl.style.pointerEvents = textPointerEvents;
  });

  // Toggle laser dot and canvas visibility and match selected active color
  const laserCanvas = document.getElementById('laser-canvas');
  if (currentTool === 'laser' || isLaserActive) {
    laserDot.style.display = 'block';
    laserDot.style.backgroundColor = currentColor;
    laserDot.style.boxShadow = `0 0 15px 6px ${currentColor}, 0 0 30px 15px ${currentColor}`;
    if (laserCanvas) laserCanvas.style.display = 'block';
  } else {
    laserDot.style.display = 'none';
    // Let the animation loop finish rendering/fading existing points.
    // Do not instantly hide the canvas or clear the trail here.
  }
}

// Find the page container closest to the vertical center of the scroll container
function findViewportCenterPage() {
  const containers = document.querySelectorAll('.page-container');
  if (containers.length === 0) return null;
  
  const viewportCenterX = scrollContainer.scrollLeft + scrollContainer.clientWidth / 2;
  const viewportCenterY = scrollContainer.scrollTop + scrollContainer.clientHeight / 2;
  
  let closestContainer = null;
  let minDistance = Infinity;
  
  containers.forEach(container => {
    const cLeft = container.offsetLeft;
    const cTop = container.offsetTop;
    const cWidth = container.offsetWidth;
    const cHeight = container.offsetHeight;
    
    const cCenterX = cLeft + cWidth / 2;
    const cCenterY = cTop + cHeight / 2;
    
    const distance = Math.abs(viewportCenterY - cCenterY);
    if (distance < minDistance) {
      minDistance = distance;
      closestContainer = container;
    }
  });
  
  if (closestContainer) {
    const pageNum = parseInt(closestContainer.dataset.page);
    const cLeft = closestContainer.offsetLeft;
    const cTop = closestContainer.offsetTop;
    const cWidth = closestContainer.offsetWidth;
    const cHeight = closestContainer.offsetHeight;
    
    // Normalized position of viewport center relative to this page container
    const normX = (viewportCenterX - cLeft) / cWidth;
    const normY = (viewportCenterY - cTop) / cHeight;
    
    return {
      pageNum,
      normX: Math.max(0, Math.min(1, normX)),
      normY: Math.max(0, Math.min(1, normY))
    };
  }
  
  return null;
}

// Zoom Handlers preserving viewport center relative to the active page
function zoomIn() {
  setZoom(zoomLevel + 0.15);
}

function zoomOut() {
  setZoom(zoomLevel - 0.15);
}

async function setZoom(newZoom) {
  const doc = openDocs.find(d => d.id === activeDocId);
  if (!doc) return;

  // Find page closest to center of viewport
  const centerPage = findViewportCenterPage();
  let normCenterX = 0.5;
  let normCenterY = 0.5;
  let centerPageNum = 1;
  
  if (centerPage) {
    centerPageNum = centerPage.pageNum;
    normCenterX = centerPage.normX;
    normCenterY = centerPage.normY;
  }

  zoomLevel = Math.max(0.5, Math.min(4.0, newZoom));
  
  const zoomVal = document.getElementById('zoom-val');
  if (zoomVal) {
    zoomVal.innerText = Math.round(zoomLevel * 100) + '%';
  }
  
  // Temporarily disable smooth scroll behavior during zoom layout rendering
  const oldScrollBehavior = scrollContainer.style.scrollBehavior;
  scrollContainer.style.scrollBehavior = 'auto';
  
  await renderActiveDocument();
  
  // Restore scroll centered on the same normalized coordinates
  const newPageContainer = document.querySelector(`.page-container[data-page="${centerPageNum}"]`);
  if (newPageContainer) {
    const newWidth = parseFloat(newPageContainer.style.width);
    const newHeight = parseFloat(newPageContainer.style.height);
    
    const targetCenterX = newPageContainer.offsetLeft + (normCenterX * newWidth);
    const targetCenterY = newPageContainer.offsetTop + (normCenterY * newHeight);
    
    scrollContainer.scrollLeft = targetCenterX - scrollContainer.clientWidth / 2;
    scrollContainer.scrollTop = targetCenterY - scrollContainer.clientHeight / 2;
  }
  
  // Restore scroll behavior
  scrollContainer.style.scrollBehavior = oldScrollBehavior;
  
  document.getElementById('total-pages').innerText = doc.pageCount;
  updateCurrentPageOnScroll();
  
  // Dispatch custom event for testing sync
  window.dispatchEvent(new CustomEvent('zoom-completed', { detail: zoomLevel }));
}

// IPC trigger open dialog
async function openPdfDialog() {
  if (!window.api || typeof window.api.openFileDialog !== 'function') {
    alert('File dialogs are only supported in desktop mode.');
    return;
  }
  const fileInfo = await window.api.openFileDialog();
  if (fileInfo) {
    loadPdf(fileInfo);
  }
}

// Load Document bytes
async function loadPdf(fileInfo) {
  const docId = 'doc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  
  // Normalize byte representation
  let dataBytes = fileInfo.bytes;
  if (dataBytes && dataBytes.type === 'Buffer') {
    dataBytes = new Uint8Array(dataBytes.data);
  } else if (!(dataBytes instanceof Uint8Array)) {
    dataBytes = new Uint8Array(dataBytes);
  }

  const loadingTask = pdfjsLib.getDocument({ data: dataBytes.slice() });
  const pdfDoc = await loadingTask.promise;

  const newDoc = {
    id: docId,
    name: fileInfo.name,
    filePath: fileInfo.filePath,
    bytes: dataBytes,
    pdfDoc: pdfDoc,
    pageCount: pdfDoc.numPages,
    annotations: {},
    undoStack: [],
    redoStack: [],
    hasUnsavedChanges: false
  };

  for (let i = 1; i <= newDoc.pageCount; i++) {
    newDoc.annotations[i] = [];
  }
  newDoc.baselineState = JSON.stringify(newDoc.annotations);

  openDocs.push(newDoc);
  setActiveDoc(docId);
  renderTabs();
}

// Renders open tabs with accessibility keyboard traversal
function renderTabs() {
  tabsContainer.innerHTML = '';
  openDocs.forEach(doc => {
    const tab = document.createElement('div');
    tab.className = `tab ${doc.id === activeDocId ? 'active' : ''}`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', doc.id === activeDocId ? 'true' : 'false');
    tab.setAttribute('tabindex', '0');
    
    // Keyboard activation for accessibility
    tab.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setActiveDoc(doc.id);
      }
    });

    const nameSpan = document.createElement('span');
    nameSpan.className = 'tab-name';
    nameSpan.innerHTML = `${doc.hasUnsavedChanges ? '<span class="tab-unsaved" aria-label="Unsaved changes">*</span>' : ''}${doc.name}`;
    
    const closeBtn = document.createElement('span');
    closeBtn.className = 'tab-close';
    closeBtn.innerText = '×';
    closeBtn.setAttribute('role', 'button');
    closeBtn.setAttribute('aria-label', `Close ${doc.name}`);
    closeBtn.setAttribute('tabindex', '0');
    
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      closeDoc(doc.id);
    };

    closeBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.stopPropagation();
        e.preventDefault();
        closeDoc(doc.id);
      }
    });

    tab.onclick = () => setActiveDoc(doc.id);
    tab.appendChild(nameSpan);
    tab.appendChild(closeBtn);
    tabsContainer.appendChild(tab);
  });

  if (openDocs.length === 0) {
    emptyState.style.display = 'flex';
    scrollContainer.style.display = 'none';
    const indicatorZone = document.getElementById('page-indicator-zone');
    if (indicatorZone) indicatorZone.style.display = 'none';
  } else {
    emptyState.style.display = 'none';
    scrollContainer.style.display = 'flex';
    const indicatorZone = document.getElementById('page-indicator-zone');
    if (indicatorZone) indicatorZone.style.display = 'block';
    scrollContainer.focus();
  }
  updateUndoRedoButtons();
}

function setActiveDoc(id) {
  activeDocId = id;
  renderTabs();
  renderActiveDocument();
  
  const doc = openDocs.find(d => d.id === activeDocId);
  const indicatorZone = document.getElementById('page-indicator-zone');
  if (doc && indicatorZone) {
    document.getElementById('total-pages').innerText = doc.pageCount;
    const pageInput = document.getElementById('current-page-input');
    if (pageInput) {
      pageInput.value = 1;
    }
    lastActivePageNum = 1;
    indicatorZone.style.display = 'block';
    
    // Sync UI zoom text
    const zoomVal = document.getElementById('zoom-val');
    if (zoomVal) {
      zoomVal.innerText = Math.round(zoomLevel * 100) + '%';
    }
  } else if (indicatorZone) {
    indicatorZone.style.display = 'none';
  }
  updateAppTitle();
}

let activeModalResolve = null;

// Promise-based unsaved changes confirm modal
function showUnsavedModal(docName) {
  if (activeModalResolve) {
    activeModalResolve('cancel');
  }
  return new Promise((resolve) => {
    activeModalResolve = resolve;

    const modal = document.getElementById('unsaved-modal');
    const message = document.getElementById('modal-message');
    const title = document.getElementById('modal-title');
    
    title.innerText = 'Unsaved Changes';
    message.innerText = `"${docName}" has unsaved changes. Do you want to save them before closing?`;
    
    modal.style.display = 'flex';
    
    // Clone buttons to purge any existing event listeners from previous modal activations
    const btnSaveOrig = document.getElementById('modal-btn-save');
    const btnDiscardOrig = document.getElementById('modal-btn-discard');
    const btnCancelOrig = document.getElementById('modal-btn-cancel');
    const btnCloseOrig = document.getElementById('modal-close');

    const btnSave = btnSaveOrig.cloneNode(true);
    const btnDiscard = btnDiscardOrig.cloneNode(true);
    const btnCancel = btnCancelOrig.cloneNode(true);
    const btnClose = btnCloseOrig.cloneNode(true);

    btnSaveOrig.parentNode.replaceChild(btnSave, btnSaveOrig);
    btnDiscardOrig.parentNode.replaceChild(btnDiscard, btnDiscardOrig);
    btnCancelOrig.parentNode.replaceChild(btnCancel, btnCancelOrig);
    btnCloseOrig.parentNode.replaceChild(btnClose, btnCloseOrig);
    
    btnSave.disabled = false;
    btnDiscard.disabled = false;
    btnCancel.disabled = false;
    btnClose.disabled = false;

    const cleanup = (value) => {
      btnSave.removeEventListener('click', handleSave);
      btnDiscard.removeEventListener('click', handleDiscard);
      btnCancel.removeEventListener('click', handleCancel);
      btnClose.removeEventListener('click', handleCancel);
      
      if (value === 'save') {
        btnSave.disabled = true;
        btnDiscard.disabled = true;
        btnCancel.disabled = true;
        btnClose.disabled = true;
        message.innerText = 'Saving changes, please wait...';
      } else {
        modal.style.display = 'none';
      }
      activeModalResolve = null;
      resolve(value);
    };
    
    const handleSave = () => cleanup('save');
    const handleDiscard = () => cleanup('discard');
    const handleCancel = () => cleanup('cancel');
    
    btnSave.innerText = 'Save';
    btnDiscard.innerText = "Don't Save";
    btnCancel.innerText = 'Cancel';
    
    btnSave.addEventListener('click', handleSave);
    btnDiscard.addEventListener('click', handleDiscard);
    btnCancel.addEventListener('click', handleCancel);
    btnClose.addEventListener('click', handleCancel);
  });
}

function showUnsavedChangesAppCloseModal() {
  if (activeModalResolve) {
    activeModalResolve('cancel');
  }
  return new Promise((resolve) => {
    activeModalResolve = resolve;

    const modal = document.getElementById('unsaved-modal');
    const message = document.getElementById('modal-message');
    const title = document.getElementById('modal-title');
    
    title.innerText = 'Unsaved Changes';
    message.innerText = 'You have unsaved documents. Do you want to save them before exiting?';
    
    modal.style.display = 'flex';
    
    // Clone buttons to purge any existing event listeners from previous modal activations
    const btnSaveOrig = document.getElementById('modal-btn-save');
    const btnDiscardOrig = document.getElementById('modal-btn-discard');
    const btnCancelOrig = document.getElementById('modal-btn-cancel');
    const btnCloseOrig = document.getElementById('modal-close');

    const btnSave = btnSaveOrig.cloneNode(true);
    const btnDiscard = btnDiscardOrig.cloneNode(true);
    const btnCancel = btnCancelOrig.cloneNode(true);
    const btnClose = btnCloseOrig.cloneNode(true);

    btnSaveOrig.parentNode.replaceChild(btnSave, btnSaveOrig);
    btnDiscardOrig.parentNode.replaceChild(btnDiscard, btnDiscardOrig);
    btnCancelOrig.parentNode.replaceChild(btnCancel, btnCancelOrig);
    btnCloseOrig.parentNode.replaceChild(btnClose, btnCloseOrig);
    
    btnSave.disabled = false;
    btnDiscard.disabled = false;
    btnCancel.disabled = false;
    btnClose.disabled = false;

    const cleanup = (value) => {
      btnSave.removeEventListener('click', handleSave);
      btnDiscard.removeEventListener('click', handleDiscard);
      btnCancel.removeEventListener('click', handleCancel);
      btnClose.removeEventListener('click', handleCancel);
      
      if (value === 'save') {
        btnSave.disabled = true;
        btnDiscard.disabled = true;
        btnCancel.disabled = true;
        btnClose.disabled = true;
        message.innerText = 'Saving changes, please wait...';
      } else {
        modal.style.display = 'none';
      }
      activeModalResolve = null;
      resolve(value);
    };
    
    const handleSave = () => cleanup('save');
    const handleDiscard = () => cleanup('discard');
    const handleCancel = () => cleanup('cancel');
    
    btnSave.innerText = 'Save All';
    btnDiscard.innerText = "Don't Save";
    btnCancel.innerText = 'Cancel';
    
    btnSave.addEventListener('click', handleSave);
    btnDiscard.addEventListener('click', handleDiscard);
    btnCancel.addEventListener('click', handleCancel);
    btnClose.addEventListener('click', handleCancel);
  });
}

async function saveAllUnsavedDocs() {
  for (const doc of openDocs) {
    if (doc.hasUnsavedChanges) {
      setActiveDoc(doc.id);
      const saved = await savePdf();
      if (!saved) {
        return false; // Abort if any save fails or is cancelled
      }
    }
  }
  return true;
}

async function closeDoc(id) {
  const doc = openDocs.find(d => d.id === id);
  if (doc && doc.hasUnsavedChanges) {
    const choice = await showUnsavedModal(doc.name);
    if (choice === 'cancel') {
      return;
    } else if (choice === 'save') {
      // Set as active doc so save can execute on it
      setActiveDoc(id);
      const saved = await savePdf();
      document.getElementById('unsaved-modal').style.display = 'none';
      if (!saved) {
        return; // Abort tab closure if save failed or was cancelled
      }
    }
  }
  openDocs = openDocs.filter(d => d.id !== id);
  if (activeDocId === id) {
    activeDocId = openDocs.length > 0 ? openDocs[0].id : null;
  }
  renderTabs();
  updateAppTitle();
  if (activeDocId) renderActiveDocument();
}

// Render active doc pages taking into account high DPI pixelRatio, zoom, and textLayer rendering
async function renderActiveDocument() {
  const doc = openDocs.find(d => d.id === activeDocId);
  if (!doc) {
    scrollContainer.innerHTML = '';
    scrollContainer.removeAttribute('data-active-doc-id');
    return;
  }

  const taskId = ++currentRenderTaskId;

  const isSameDoc = (scrollContainer.getAttribute('data-active-doc-id') === activeDocId) &&
                    (scrollContainer.querySelectorAll('.page-container').length === doc.pageCount);
  scrollContainer.setAttribute('data-active-doc-id', activeDocId);

  if (!isSameDoc) {
    scrollContainer.innerHTML = '';
  }

  for (let i = 1; i <= doc.pageCount; i++) {
    if (taskId !== currentRenderTaskId) return;

    let pageContainer;
    let bgCanvas;
    let textLayerDiv;
    let drawCanvas;

    if (!isSameDoc) {
      pageContainer = document.createElement('div');
      pageContainer.className = 'page-container';
      pageContainer.dataset.page = i;
      pageContainer.setAttribute('role', 'region');
      pageContainer.setAttribute('aria-label', `Page ${i} of ${doc.pageCount}`);

      bgCanvas = document.createElement('canvas');
      bgCanvas.className = 'pdf-canvas';
      
      textLayerDiv = document.createElement('div');
      textLayerDiv.className = 'textLayer';
      
      drawCanvas = document.createElement('canvas');
      drawCanvas.className = 'drawing-canvas';
      
      pageContainer.appendChild(bgCanvas);
      pageContainer.appendChild(textLayerDiv);
      pageContainer.appendChild(drawCanvas);
      scrollContainer.appendChild(pageContainer);
    } else {
      pageContainer = scrollContainer.querySelector(`.page-container[data-page="${i}"]`);
      bgCanvas = pageContainer.querySelector('.pdf-canvas');
      textLayerDiv = pageContainer.querySelector('.textLayer');
      drawCanvas = pageContainer.querySelector('.drawing-canvas');
    }

    const page = await doc.pdfDoc.getPage(i);
    if (taskId !== currentRenderTaskId) return;

    const viewport = page.getViewport({ scale: zoomLevel });
    const pixelRatio = window.devicePixelRatio || 1;
    
    // Immediately size CSS dimensions to scale existing canvas visual buffers (prevents white flicker!)
    pageContainer.style.width = viewport.width + 'px';
    pageContainer.style.height = viewport.height + 'px';
    bgCanvas.style.width = viewport.width + 'px';
    bgCanvas.style.height = viewport.height + 'px';
    drawCanvas.style.width = viewport.width + 'px';
    drawCanvas.style.height = viewport.height + 'px';

    // Double buffering: render PDF contents onto offscreen canvas first
    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = viewport.width * pixelRatio;
    offscreenCanvas.height = viewport.height * pixelRatio;
    const offCtx = offscreenCanvas.getContext('2d');

    const renderContext = {
      canvasContext: offCtx,
      viewport: viewport,
      transform: [pixelRatio, 0, 0, pixelRatio, 0, 0] // High DPI scale transform
    };
    
    const renderTask = page.render(renderContext);
    await renderTask.promise;
    if (taskId !== currentRenderTaskId) {
      renderTask.cancel();
      return;
    }

    // Draw offscreen canvas to main canvas once rendering is complete
    bgCanvas.width = viewport.width * pixelRatio;
    bgCanvas.height = viewport.height * pixelRatio;
    const bgCtx = bgCanvas.getContext('2d');
    bgCtx.drawImage(offscreenCanvas, 0, 0);

    // Also update drawing canvas backing store
    drawCanvas.width = viewport.width * pixelRatio;
    drawCanvas.height = viewport.height * pixelRatio;

    // Render Text Layer
    textLayerDiv.innerHTML = '';
    const textContent = await page.getTextContent();
    if (taskId !== currentRenderTaskId) return;

    await pdfjsLib.renderTextLayer({
      textContent: textContent,
      container: textLayerDiv,
      viewport: viewport,
      textDivs: []
    }).promise;
    if (taskId !== currentRenderTaskId) return;

    if (!isSameDoc) {
      setupDrawingEvents(drawCanvas, i, doc);
    }
    redrawAnnotations(drawCanvas, i, doc);
  }
  updateCursor();
}

// Update current page counter during vertical scroll
function updateCurrentPageOnScroll() {
  const doc = openDocs.find(d => d.id === activeDocId);
  if (!doc) return;

  const containers = document.querySelectorAll('.page-container');
  let activePage = 1;
  let minDiff = Infinity;
  
  const viewportCenter = scrollContainer.scrollTop + (scrollContainer.clientHeight / 2);
  
  containers.forEach(container => {
    const pageNum = parseInt(container.dataset.page);
    const containerTop = container.offsetTop;
    const containerCenter = containerTop + (container.offsetHeight / 2);
    const diff = Math.abs(viewportCenter - containerCenter);
    
    if (diff < minDiff) {
      minDiff = diff;
      activePage = pageNum;
    }
  });
  
  const pageInput = document.getElementById('current-page-input');
  if (pageInput && document.activeElement !== pageInput && !isNavigatingFromIndicator) {
    pageInput.value = activePage;
  }

  if (activePage !== lastActivePageNum) {
    lastActivePageNum = activePage;
    if (!isNavigatingFromIndicator && (Date.now() - lastTimeInVicinity > 1000)) {
      triggerPageIndicatorTemporaryShow(2000);
    }
  }
}

// Change Tracking
function checkUnsavedChanges(doc) {
  if (!doc) return;
  const currentState = JSON.stringify(doc.annotations);
  const hasChanges = (currentState !== doc.baselineState);
  if (doc.hasUnsavedChanges !== hasChanges) {
    doc.hasUnsavedChanges = hasChanges;
    renderTabs();
    updateAppTitle();
  }
  updateUndoRedoButtons();
}

// Undo/Redo Engine Helpers
function addUndoAction(doc, action) {
  doc.undoStack.push(action);
  doc.redoStack = []; // Clear redo stack on new action
  updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
  const doc = openDocs.find(d => d.id === activeDocId);
  const undoBtn = document.getElementById('btn-undo');
  const redoBtn = document.getElementById('btn-redo');
  const saveBtn = document.getElementById('btn-save');
  
  if (doc) {
    undoBtn.disabled = doc.undoStack.length === 0;
    redoBtn.disabled = doc.redoStack.length === 0;
    saveBtn.disabled = !doc.hasUnsavedChanges;
  } else {
    undoBtn.disabled = true;
    redoBtn.disabled = true;
    saveBtn.disabled = true;
  }
}

function undo() {
  const doc = openDocs.find(d => d.id === activeDocId);
  if (!doc || doc.undoStack.length === 0) return;

  const action = doc.undoStack.pop();
  doc.redoStack.push(action);

  if (action.type === 'add') {
    const idx = doc.annotations[action.pageNum].indexOf(action.annotation);
    if (idx !== -1) doc.annotations[action.pageNum].splice(idx, 1);
  } else if (action.type === 'delete') {
    doc.annotations[action.pageNum].splice(action.index, 0, action.annotation);
  } else if (action.type === 'clear') {
    doc.annotations = JSON.parse(JSON.stringify(action.annotationsSnapshot));
  }

  checkUnsavedChanges(doc);
  refreshAllPages();
}

function redo() {
  const doc = openDocs.find(d => d.id === activeDocId);
  if (!doc || doc.redoStack.length === 0) return;

  const action = doc.redoStack.pop();
  doc.undoStack.push(action);

  if (action.type === 'add') {
    doc.annotations[action.pageNum].push(action.annotation);
  } else if (action.type === 'delete') {
    const idx = doc.annotations[action.pageNum].indexOf(action.annotation);
    if (idx !== -1) doc.annotations[action.pageNum].splice(idx, 1);
  } else if (action.type === 'clear') {
    doc.annotations = {};
    for (let i = 1; i <= doc.pageCount; i++) {
      doc.annotations[i] = [];
    }
  }

  checkUnsavedChanges(doc);
  refreshAllPages();
}

function refreshAllPages() {
  const doc = openDocs.find(d => d.id === activeDocId);
  if (!doc) return;
  
  const pageContainers = document.querySelectorAll('.page-container');
  pageContainers.forEach(container => {
    const pageNum = parseInt(container.dataset.page);
    const canvas = container.querySelector('.drawing-canvas');
    if (canvas) {
      redrawAnnotations(canvas, pageNum, doc);
    }
  });
}

function clearAllAnnotations() {
  const doc = openDocs.find(d => d.id === activeDocId);
  if (!doc) return;

  const hasItems = Object.values(doc.annotations).some(arr => arr.length > 0);
  if (!hasItems) return;

  const snapshot = JSON.parse(JSON.stringify(doc.annotations));
  
  doc.annotations = {};
  for (let i = 1; i <= doc.pageCount; i++) {
    doc.annotations[i] = [];
  }
  
  addUndoAction(doc, { type: 'clear', annotationsSnapshot: snapshot });
  checkUnsavedChanges(doc);
  refreshAllPages();
}

// Drawing Canvas Event Listeners (Normalizing display pixels to PDF Points)
function setupDrawingEvents(canvas, pageNum, doc) {
  const ctx = canvas.getContext('2d');
  
  if (!doc.annotations[pageNum]) {
    doc.annotations[pageNum] = [];
  }

  const getPos = (e) => {
    const rect = canvas.getBoundingClientRect();
    let rawX = (e.clientX - rect.left) / zoomLevel;
    let rawY = (e.clientY - rect.top) / zoomLevel;
    let thickness = currentThickness;
    
    if (currentTool === 'highlighter') {
      const snapped = snapToNearestTextSpan(pageNum, rawX, rawY);
      if (snapped) {
        rawY = snapped.y;
        thickness = snapped.height * 1.25;
      } else {
        // Default highlighter thickness is thicker by default
        thickness = Math.max(16, currentThickness * 2.5);
      }
    }
    
    return { x: rawX, y: rawY, thickness };
  };

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // ONLY left click starts drawing/erasing/text placement!
    if (currentTool === 'text' || currentTool === 'select' || currentTool === 'laser') return;
    
    const pos = getPos(e);
    if (currentTool === 'eraser') {
      isErasing = true;
      eraseAtPos(pageNum, doc, pos.x, pos.y);
      redrawAnnotations(canvas, pageNum, doc);
      return;
    }

    isDrawing = true;
    if (currentTool === 'pen' || currentTool === 'highlighter') {
      currentPath = {
        type: currentTool,
        color: currentColor,
        thickness: pos.thickness || currentThickness,
        points: [{ x: pos.x, y: pos.y }]
      };
    } else {
      tempShape = {
        type: currentTool,
        color: currentColor,
        thickness: currentThickness,
        startX: pos.x,
        startY: pos.y,
        endX: pos.x,
        endY: pos.y
      };
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    const pos = getPos(e);

    if (currentTool === 'eraser') {
      if (isErasing) {
        eraseAtPos(pageNum, doc, pos.x, pos.y);
        redrawAnnotations(canvas, pageNum, doc);
      }
      return;
    }

    if (!isDrawing) return;

    if (currentPath) {
      currentPath.points.push({ x: pos.x, y: pos.y });
      if (pos.thickness) {
        currentPath.thickness = pos.thickness; // update thickness in case it snaps mid-draw
      }
      redrawAnnotations(canvas, pageNum, doc, currentPath);
    } else if (tempShape) {
      tempShape.endX = pos.x;
      tempShape.endY = pos.y;
      redrawAnnotations(canvas, pageNum, doc, null, tempShape);
    }
  });

  canvas.addEventListener('mouseup', () => {
    if (isErasing) {
      isErasing = false;
      return;
    }
    if (!isDrawing) return;
    isDrawing = false;
    
    if (currentPath) {
      doc.annotations[pageNum].push(currentPath);
      addUndoAction(doc, { type: 'add', pageNum: pageNum, annotation: currentPath });
      currentPath = null;
      checkUnsavedChanges(doc);
    } else if (tempShape) {
      doc.annotations[pageNum].push(tempShape);
      addUndoAction(doc, { type: 'add', pageNum: pageNum, annotation: tempShape });
      tempShape = null;
      checkUnsavedChanges(doc);
    }
    redrawAnnotations(canvas, pageNum, doc);
  });

  canvas.addEventListener('click', (e) => {
    if (currentTool === 'text') {
      const pos = getPos(e);
      spawnTextInput(canvas, pageNum, doc, pos.x, pos.y);
    } else if (currentTool === 'eraser') {
      const pos = getPos(e);
      eraseAtPos(pageNum, doc, pos.x, pos.y);
      redrawAnnotations(canvas, pageNum, doc);
    }
  });
}

// Spawn contenteditable text annotation in PDF points, scaling text area visual boundaries
function spawnTextInput(canvas, pageNum, doc, x, y) {
  const container = canvas.parentElement;
  const input = document.createElement('textarea');
  input.className = 'text-annotation-input';
  input.style.color = currentColor;
  input.setAttribute('aria-label', 'Text annotation field. Type your text here and click away to bake it.');
  
  // Sizing relative to viewport CSS pixels
  const computedSize = currentThickness * 1.5 + 12; // Base size in PDF Points
  const displaySize = computedSize * zoomLevel;
  
  input.style.left = (x * zoomLevel) + 'px';
  input.style.top = ((y - 10) * zoomLevel) + 'px';
  input.style.fontSize = displaySize + 'px';
  input.style.width = (200 * zoomLevel) + 'px';
  input.style.height = (displaySize + 10) + 'px';
  
  container.appendChild(input);
  input.focus();

  input.addEventListener('blur', () => {
    if (input.value.trim() !== '') {
      const textAnnot = {
        type: 'text',
        text: input.value,
        x: x, // PDF points
        y: y, // PDF points
        color: currentColor,
        fontSize: computedSize // PDF points
      };
      doc.annotations[pageNum].push(textAnnot);
      addUndoAction(doc, { type: 'add', pageNum: pageNum, annotation: textAnnot });
      checkUnsavedChanges(doc);
      redrawAnnotations(canvas, pageNum, doc);
    }
    input.remove();
  });
}

// Click to erase check (scaled by zoom)
function eraseAtPos(pageNum, doc, x, y) {
  const annots = doc.annotations[pageNum];
  const tolerance = 20 / zoomLevel; // Screen distance 20px normalized to PDF points
  let changed = false;

  for (let i = annots.length - 1; i >= 0; i--) {
    const ann = annots[i];
    if (ann.type === 'pen' || ann.type === 'highlighter') {
      for (const pt of ann.points) {
        const dist = Math.hypot(pt.x - x, pt.y - y);
        if (dist < tolerance) {
          const deletedAnnot = annots.splice(i, 1)[0];
          addUndoAction(doc, { type: 'delete', pageNum: pageNum, annotation: deletedAnnot, index: i });
          changed = true;
          break;
        }
      }
    } else if (ann.type === 'text') {
      if (Math.abs(ann.x - x) < (60 / zoomLevel) && Math.abs(ann.y - y) < (15 / zoomLevel)) {
        const deletedAnnot = annots.splice(i, 1)[0];
        addUndoAction(doc, { type: 'delete', pageNum: pageNum, annotation: deletedAnnot, index: i });
        changed = true;
      }
    } else {
      // Shapes boundary check
      const cx = (ann.startX + ann.endX) / 2;
      const cy = (ann.startY + ann.endY) / 2;
      if (Math.hypot(cx - x, cy - y) < Math.max(Math.abs(ann.startX - ann.endX) / 2 + (10 / zoomLevel), tolerance)) {
        const deletedAnnot = annots.splice(i, 1)[0];
        addUndoAction(doc, { type: 'delete', pageNum: pageNum, annotation: deletedAnnot, index: i });
        changed = true;
      }
    }
  }

  if (changed) {
    checkUnsavedChanges(doc);
  }
}

// Renders the annotations vector array onto canvas using transform scale matrix
function redrawAnnotations(canvas, pageNum, doc, activePath = null, activeShape = null, customScale = null) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const drawScale = customScale !== null ? customScale : (zoomLevel * (window.devicePixelRatio || 1));
  
  // Set scale matrix to draw in raw 1.0 scale PDF Points
  ctx.setTransform(drawScale, 0, 0, drawScale, 0, 0);

  const all = [...(doc.annotations[pageNum] || [])];
  if (activePath) all.push(activePath);
  if (activeShape) all.push(activeShape);

  all.forEach(ann => {
    ctx.beginPath();
    
    if (ann.type === 'pen' || ann.type === 'highlighter') {
      ctx.globalCompositeOperation = ann.type === 'highlighter' ? 'multiply' : 'source-over';
      ctx.strokeStyle = ann.color;
      ctx.lineWidth = ann.thickness;
      ctx.globalAlpha = ann.type === 'highlighter' ? 0.45 : 1.0;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (ann.points.length > 0) {
        ctx.moveTo(ann.points[0].x, ann.points[0].y);
        for (let i = 1; i < ann.points.length; i++) {
          ctx.lineTo(ann.points[i].x, ann.points[i].y);
        }
        ctx.stroke();
      }
    } 
    else if (ann.type === 'text') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1.0;
      ctx.fillStyle = ann.color;
      ctx.font = `${ann.fontSize}px 'Plus Jakarta Sans', system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      
      const lines = ann.text.split('\n');
      lines.forEach((l, idx) => {
        ctx.fillText(l, ann.x, ann.y + (idx * ann.fontSize * 1.2));
      });
    }
    else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1.0;
      ctx.strokeStyle = ann.color;
      ctx.lineWidth = ann.thickness;

      if (ann.type === 'box') {
        ctx.rect(ann.startX, ann.startY, ann.endX - ann.startX, ann.endY - ann.startY);
        ctx.stroke();
      } else if (ann.type === 'line') {
        ctx.moveTo(ann.startX, ann.startY);
        ctx.lineTo(ann.endX, ann.endY);
        ctx.stroke();
      } else if (ann.type === 'circle') {
        const radius = Math.hypot(ann.endX - ann.startX, ann.endY - ann.startY);
        ctx.arc(ann.startX, ann.startY, radius, 0, Math.PI * 2);
        ctx.stroke();
      } else if (ann.type === 'arrow') {
        ctx.moveTo(ann.startX, ann.startY);
        ctx.lineTo(ann.endX, ann.endY);
        ctx.stroke();
        
        const angle = Math.atan2(ann.endY - ann.startY, ann.endX - ann.startX);
        const headlen = 10 + ann.thickness;
        ctx.beginPath();
        ctx.moveTo(ann.endX, ann.endY);
        ctx.lineTo(ann.endX - headlen * Math.cos(angle - Math.PI / 6), ann.endY - headlen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(ann.endX, ann.endY);
        ctx.lineTo(ann.endX - headlen * Math.cos(angle + Math.PI / 6), ann.endY - headlen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
      }
    }
  });
  
  // Restore transform to default identity
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1.0;
  ctx.globalCompositeOperation = 'source-over';
}

// Bakes drawings onto raw PDF bytes at 3.0x ultra-high resolution and saves
async function savePdf() {
  const doc = openDocs.find(d => d.id === activeDocId);
  if (!doc) return false;

  try {
    const pdfLibDoc = await PDFLib.PDFDocument.load(doc.bytes);
    const pages = pdfLibDoc.getPages();

    const pageContainers = document.querySelectorAll('.page-container');
    
    for (const container of pageContainers) {
      const pageNum = parseInt(container.dataset.page);
      
      if (doc.annotations[pageNum] && doc.annotations[pageNum].length > 0) {
        const page = pages[pageNum - 1];
        const pageWidth = page.getWidth();
        const pageHeight = page.getHeight();
        
        // High-res bake (scale up for PDF crispness)
        const bakeCanvas = document.createElement('canvas');
        const scale = 3.0; 
        
        bakeCanvas.width = pageWidth * scale;
        bakeCanvas.height = pageHeight * scale;
        
        // Render onto high-res canvas at scale 3.0 (removes blurriness)
        redrawAnnotations(bakeCanvas, pageNum, doc, null, null, scale);
        
        const pngUrl = bakeCanvas.toDataURL('image/png');
        const pngImage = await pdfLibDoc.embedPng(pngUrl);
        
        page.drawImage(pngImage, {
          x: 0,
          y: 0,
          width: pageWidth,
          height: pageHeight
        });
      }
    }

    const savedBytes = await pdfLibDoc.save();
    
    // Save to disk
    if (doc.filePath) {
      if (!window.api || typeof window.api.saveFileDirectly !== 'function') {
        alert('Direct saving is only supported in desktop mode.');
        return false;
      }
      await window.api.saveFileDirectly(doc.filePath, savedBytes);
      doc.bytes = savedBytes;
      doc.baselineState = JSON.stringify(doc.annotations);
      checkUnsavedChanges(doc);
      alert('Saved changes successfully!');
      return true;
    } else {
      if (!window.api || typeof window.api.saveFileDialog !== 'function') {
        alert('File dialogs are only supported in desktop mode.');
        return false;
      }
      const result = await window.api.saveFileDialog(doc.name, savedBytes);
      if (result) {
        doc.filePath = result.filePath;
        doc.name = result.name;
        doc.bytes = savedBytes;
        doc.baselineState = JSON.stringify(doc.annotations);
        checkUnsavedChanges(doc);
        alert('Saved changes successfully!');
        return true;
      } else {
        return false;
      }
    }

  } catch(e) {
    console.error('Save error:', e);
    alert('Error saving PDF.');
    return false;
  }
}

// Snapping helper for highlighter tool
function snapToNearestTextSpan(pageNum, x, y) {
  const container = scrollContainer.querySelector(`.page-container[data-page="${pageNum}"]`);
  if (!container) return null;
  
  const textLayer = container.querySelector('.textLayer');
  if (!textLayer) return null;
  
  const spans = textLayer.querySelectorAll('span');
  if (spans.length === 0) return null;
  
  let nearestSpan = null;
  let minDistance = Infinity;
  
  spans.forEach(span => {
    const spanX = span.offsetLeft / zoomLevel;
    const spanY = span.offsetTop / zoomLevel;
    const spanW = span.offsetWidth / zoomLevel;
    const spanH = span.offsetHeight / zoomLevel;
    
    const centerY = spanY + spanH / 2;
    const vDist = Math.abs(y - centerY);
    const isHorizontalOverlap = (x >= spanX - 15) && (x <= spanX + spanW + 15);
    
    if (isHorizontalOverlap && vDist < 20 && vDist < minDistance) {
      minDistance = vDist;
      nearestSpan = { y: centerY, height: spanH };
    }
  });
  
  return nearestSpan;
}

// Synchronize toolbar button active styling based on currentTool
function syncToolbarButtons() {
  const btnShapeSelect = document.getElementById('btn-shape-select');
  const shapesDropdown = document.getElementById('shapes-dropdown');
  const shapeItems = shapesDropdown.querySelectorAll('.dropdown-item');
  const btnLaser = document.getElementById('btn-laser');
  
  // Reset all main tool buttons
  toolBtns.forEach(b => {
    if (b.dataset.tool === currentTool) {
      b.classList.add('active');
      b.setAttribute('aria-pressed', 'true');
    } else {
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    }
  });
  
  // Check if currentTool is a shape
  const activeShapeItem = Array.from(shapeItems).find(si => si.dataset.tool === currentTool);
  if (activeShapeItem) {
    btnShapeSelect.classList.add('active');
    btnShapeSelect.setAttribute('aria-pressed', 'true');
    shapeItems.forEach(si => si.classList.toggle('active', si === activeShapeItem));
    document.getElementById('shape-active-icon').innerHTML = activeShapeItem.querySelector('svg').innerHTML;
  } else {
    btnShapeSelect.classList.remove('active');
    btnShapeSelect.setAttribute('aria-pressed', 'false');
    shapeItems.forEach(si => si.classList.remove('active'));
  }
}

// Dual-pass canvas-based glowing fading laser pen animation loop
function runLaserLoop() {
  if (laserLoopRunning) return;
  laserLoopRunning = true;
  
  const canvas = document.getElementById('laser-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  function tick() {
    const now = Date.now();
    
    // Filter out expired points
    laserTrailPoints = laserTrailPoints.filter(p => now - p.time < laserTrailDuration);
    
    // Resize canvas if needed
    if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (laserTrailPoints.length > 1) {
      // Pass 1: Outer glow aura (thick, lower opacity)
      for (let i = 1; i < laserTrailPoints.length; i++) {
        const p1 = laserTrailPoints[i - 1];
        const p2 = laserTrailPoints[i];
        const age = now - p2.time;
        const ratio = Math.max(0, Math.min(1, age / laserTrailDuration));
        const alpha = (1.0 - ratio) * 0.25;
        
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        
        ctx.strokeStyle = currentColor;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
      
      // Pass 2: Inner glow aura (medium width, higher opacity)
      for (let i = 1; i < laserTrailPoints.length; i++) {
        const p1 = laserTrailPoints[i - 1];
        const p2 = laserTrailPoints[i];
        const age = now - p2.time;
        const ratio = Math.max(0, Math.min(1, age / laserTrailDuration));
        const alpha = (1.0 - ratio) * 0.6;
        
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        
        ctx.strokeStyle = currentColor;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
      
      // Pass 3: Core (bright center core)
      for (let i = 1; i < laserTrailPoints.length; i++) {
        const p1 = laserTrailPoints[i - 1];
        const p2 = laserTrailPoints[i];
        const age = now - p2.time;
        const ratio = Math.max(0, Math.min(1, age / laserTrailDuration));
        const alpha = 1.0 - ratio;
        
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        
        ctx.strokeStyle = '#ffffff';
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
      
      // Reset values
      ctx.globalAlpha = 1.0;
      
      requestAnimationFrame(tick);
    } else {
      laserLoopRunning = false;
      laserTrailPoints = [];
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
  
  requestAnimationFrame(tick);
}

// Dynamic window title and header titlebar updater with unsaved asterisk indicator
function updateAppTitle() {
  const titleEl = document.querySelector('#titlebar .app-title');
  if (titleEl) {
    titleEl.innerHTML = `PDFpresent <span class="app-author">Built by Somansh Garg ${appVersion}</span>`;
  }
  document.title = `PDFpresent by Somansh Garg ${appVersion}`;
}

// Toggle page indicator visibility based on mouse coordinate vicinity
function updatePageIndicatorVisibility(mouseX, mouseY) {
  const pageIndicator = document.getElementById('page-indicator');
  if (!pageIndicator || openDocs.length === 0) return;

  const vicinityY = window.innerHeight - 75; // Small vicinity area (75px from bottom)
  const vicinityXStart = window.innerWidth / 2 - 180;
  const vicinityXEnd = window.innerWidth / 2 + 180;

  const inVicinity = mouseY > vicinityY && mouseX > vicinityXStart && mouseX < vicinityXEnd;

  const rect = pageIndicator.getBoundingClientRect();
  const isOverIndicator = mouseX >= rect.left && mouseX <= rect.right &&
                          mouseY >= rect.top && mouseY <= rect.bottom;

  if (inVicinity || isOverIndicator) {
    pageIndicator.classList.add('visible');
    mouseWasInVicinity = true;
    lastTimeInVicinity = Date.now();
    if (pageIndicatorShowTimer) {
      clearTimeout(pageIndicatorShowTimer);
      pageIndicatorShowTimer = null;
    }
  } else {
    // If the mouse was in the vicinity and has now left, hide immediately
    if (mouseWasInVicinity) {
      mouseWasInVicinity = false;
      
      // Blur the input to commit any changes and release focus
      const pageInput = document.getElementById('current-page-input');
      if (pageInput && document.activeElement === pageInput) {
        pageInput.blur();
      }
      
      pageIndicator.classList.remove('visible');
      if (pageIndicatorShowTimer) {
        clearTimeout(pageIndicatorShowTimer);
        pageIndicatorShowTimer = null;
      }
    } else {
      // If we were just scrolling and never hovered the vicinity, respect the scroll timer
      if (!pageIndicatorShowTimer) {
        pageIndicator.classList.remove('visible');
      }
    }
  }
}

// Show the page indicator temporarily (e.g. on scroll page transition)
function triggerPageIndicatorTemporaryShow(duration = 2000) {
  const pageIndicator = document.getElementById('page-indicator');
  if (!pageIndicator || openDocs.length === 0) return;

  pageIndicator.classList.add('visible');
  if (pageIndicatorShowTimer) clearTimeout(pageIndicatorShowTimer);

  pageIndicatorShowTimer = setTimeout(() => {
    pageIndicatorShowTimer = null;
    updatePageIndicatorVisibility(lastMouseX, lastMouseY);
  }, duration);
}

// Startup
document.addEventListener('DOMContentLoaded', init);
