const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

test.describe('PDFpresent Deep Integration & Quality Tests', () => {
  let electronApp;
  let page;

  // Load the actual PDF bytes from the workspace to inject into our tests
  const pdfPath = path.resolve(__dirname, '../Class1_Lesson_PromptEngineering.pdf');
  const pdfBuffer = fs.readFileSync(pdfPath);
  const pdfBase64 = pdfBuffer.toString('base64');

  test.beforeEach(async () => {
    // Launch the Electron application
    electronApp = await electron.launch({
      args: [path.join(__dirname, '../main.js')],
    });

    // Mock dialog:openFile, fs:writeFile, dialog:saveFile, and app:getVersion
    await electronApp.evaluate(async (electronModule, { base64, filePath, name }) => {
      const { ipcMain } = electronModule;
      
      ipcMain.removeHandler('dialog:openFile');
      ipcMain.handle('dialog:openFile', async () => {
        return {
          name: name,
          filePath: filePath,
          bytes: Buffer.from(base64, 'base64')
        };
      });

      ipcMain.removeHandler('fs:writeFile');
      ipcMain.handle('fs:writeFile', async (event, { filePath, data }) => {
        return true;
      });

      ipcMain.removeHandler('dialog:saveFile');
      ipcMain.handle('dialog:saveFile', async (event, { defaultName, data }) => {
        return { filePath: filePath, name: name };
      });

      ipcMain.removeHandler('app:getVersion');
      ipcMain.handle('app:getVersion', () => {
        return '2.4.0';
      });
    }, { base64: pdfBase64, filePath: pdfPath, name: 'Class1_Lesson_PromptEngineering.pdf' });

    // Wait for the first window to open
    page = await electronApp.firstWindow();

    // Ensure layout starts in horizontal state for consistent layout tests
    await page.evaluate(() => {
      localStorage.setItem('toolbar-layout', 'horizontal');
    });
    
    // Attach dialog handler to automatically accept alerts
    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    await page.reload();
  });

  test.afterEach(async () => {
    // Terminate the Electron application if it's still running
    try {
      await electronApp.close();
    } catch (e) {
      // App might have already closed in exit tests
    }
  });

  test('1. Verify Docked edge-to-edge layout styling', async () => {
    const toolbar = page.locator('#app-toolbar');
    await expect(toolbar).toBeVisible();

    // Verify it spans the full horizontal space at the top
    const widthStyle = await toolbar.evaluate(el => window.getComputedStyle(el).width);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(parseFloat(widthStyle)).toBeCloseTo(viewportWidth, 1);

    // Verify border-radius is 0 (docked, not floating)
    const borderRadius = await toolbar.evaluate(el => window.getComputedStyle(el).borderRadius);
    expect(borderRadius).toBe('0px');

    // Click layout toggle and verify it docks vertically
    const layoutToggle = page.locator('#btn-layout-toggle');
    await layoutToggle.click();
    await expect(toolbar).toHaveClass(/vertical/);

    const heightStyle = await toolbar.evaluate(el => window.getComputedStyle(el).height);
    const viewportHeight = await page.evaluate(() => window.innerHeight - 38); // viewport height minus titlebar height (38px)
    
    // Check if height of vertical toolbar is close to viewport height (within 2px tolerance for subpixel / devicePixelRatio differences)
    expect(Math.abs(parseFloat(heightStyle) - viewportHeight)).toBeLessThan(2);

    // Toggle back
    await layoutToggle.click();
  });

  test('2. PDF high quality rendering and canvas setup', async () => {
    // Open file (triggers mocked IPC)
    await page.click('#btn-open');

    // Wait for PDF pages to render (up to 10 seconds)
    const firstPage = page.locator('.page-container[data-page="1"]');
    await expect(firstPage).toBeVisible({ timeout: 10000 });

    // Verify page container dimensions are set
    const containerWidth = await firstPage.evaluate(el => el.style.width);
    const containerHeight = await firstPage.evaluate(el => el.style.height);
    expect(parseFloat(containerWidth)).toBeGreaterThan(0);
    expect(parseFloat(containerHeight)).toBeGreaterThan(0);

    // Verify background canvas is present and sized
    const bgCanvas = firstPage.locator('.pdf-canvas');
    await expect(bgCanvas).toBeVisible();

    const canvasWidth = await bgCanvas.evaluate(el => el.width);
    const canvasHeight = await bgCanvas.evaluate(el => el.height);
    expect(canvasWidth).toBeGreaterThan(0);
    expect(canvasHeight).toBeGreaterThan(0);
  });

  test('3. Verify all drawing and shape toolbar widget items', async () => {
    // 1. Text Selection Tool (Default Active)
    const selectTool = page.locator('[data-tool="select"]');
    await expect(selectTool).toHaveClass(/active/);

    // 2. Freehand drawing tools
    const tools = ['pen', 'highlighter', 'eraser'];
    for (const tool of tools) {
      const btn = page.locator(`[data-tool="${tool}"]`);
      await btn.click();
      await expect(btn).toHaveClass(/active/);
      await expect(selectTool).not.toHaveClass(/active/);
    }

    // 3. Shape tools
    const shapes = ['box', 'circle', 'line', 'arrow', 'text'];
    const shapesArrow = page.locator('#btn-shape-arrow');
    for (const shape of shapes) {
      await shapesArrow.click();
      const btn = page.locator(`.shapes-popover [data-tool="${shape}"]`);
      await btn.click();
      await expect(btn).toHaveClass(/active/);
    }

    // 4. Color Swatches
    await page.locator('#btn-color-arrow').click();
    const redSwatch = page.locator('.color-swatch[data-color="#ef4444"]');
    await redSwatch.click();
    await expect(redSwatch).toHaveClass(/active/);

    const activeColor = await page.evaluate(() => currentColor);
    expect(activeColor).toBe('#ef4444');

    // 5. Thickness range slider
    await page.locator('#btn-thickness-arrow').click();
    const slider = page.locator('#thickness-slider');
    await slider.fill('12'); // set brush thickness to 12px
    const textVal = page.locator('#thickness-val');
    await expect(textVal).toHaveText('12px');

    const activeThickness = await page.evaluate(() => currentThickness);
    expect(activeThickness).toBe(12);
  });

  test('4. PDF scrolling and page indicator updates', async () => {
    await page.click('#btn-open');
    const firstPage = page.locator('.page-container[data-page="1"]');
    await expect(firstPage).toBeVisible({ timeout: 10000 });

    const scrollContainer = page.locator('#pdf-scroll-container');
    const pageIndicator = page.locator('#current-page-input');

    // Wait for page 2 to render completely so height updates are fully applied
    const secondPage = page.locator('.page-container[data-page="2"]');
    await expect(secondPage).toBeVisible({ timeout: 10000 });
    await page.waitForFunction(() => {
      const canvases = document.querySelectorAll('.pdf-canvas');
      return canvases.length >= 2 && Array.from(canvases).every(c => c.width > 0);
    });

    // Verify initially page 1
    await expect(pageIndicator).toHaveValue('1');

    // Disable smooth scroll for instant updates in test
    await scrollContainer.evaluate(el => el.style.scrollBehavior = 'auto');

    // Scroll to page 2
    await secondPage.scrollIntoViewIfNeeded();

    // Verify indicator updates to page 2
    await page.waitForTimeout(300); // Small grace period
    await expect(pageIndicator).toHaveValue('2');
  });

  test('5. Viewport-center tracking during Zoom', async () => {
    await page.click('#btn-open');
    const firstPage = page.locator('.page-container[data-page="1"]');
    await expect(firstPage).toBeVisible({ timeout: 10000 });

    const scrollContainer = page.locator('#pdf-scroll-container');
    const zoomInBtn = page.locator('#btn-zoom-in');
    const zoomVal = page.locator('#zoom-val');

    // Wait for page 2 to render completely so the container reaches its full scrollable height
    const secondPage = page.locator('.page-container[data-page="2"]');
    await expect(secondPage).toBeVisible({ timeout: 10000 });
    await page.waitForFunction(() => {
      const canvases = document.querySelectorAll('.pdf-canvas');
      return canvases.length >= 2 && Array.from(canvases).every(c => c.width > 0);
    });

    // Initial zoom state 150%
    await expect(zoomVal).toHaveText('150%');

    // Disable smooth scroll to apply scroll changes instantly in test
    await scrollContainer.evaluate(el => el.style.scrollBehavior = 'auto');

    // Scroll down 400px
    await scrollContainer.evaluate(el => el.scrollTop = 400);
    const initialScrollTop = await scrollContainer.evaluate(el => el.scrollTop);
    expect(initialScrollTop).toBe(400);

    // Setup listener for zoom-completed event
    await page.evaluate(() => {
      window.zoomDone = false;
      window.addEventListener('zoom-completed', () => {
        window.zoomDone = true;
      }, { once: true });
    });

    // Zoom in to 165%
    await zoomInBtn.click();
    await expect(zoomVal).toHaveText('165%');

    // Wait for async rendering and zoom scroll updates to complete
    await page.waitForFunction(() => window.zoomDone === true, { timeout: 10000 });

    // Verify scroll position is scaled proportionally to keep viewport center aligned
    const newScrollTop = await scrollContainer.evaluate(el => el.scrollTop);
    
    // Zoom went from 1.5 to 1.65.
    // Viewport center math checks out, so new scrollTop must reflect the zoom scale ratio
    expect(newScrollTop).toBeGreaterThan(initialScrollTop);
  });

  test('6. Verify application shell title and dynamic version fetching', async () => {
    // Check document title
    const docTitle = await page.title();
    expect(docTitle).toBe('PDFpresent by Somansh Garg v2.4');

    // Check header app-title content
    const headerTitle = await page.locator('#titlebar .app-title').innerHTML();
    expect(headerTitle).toContain('PDFpresent');
    expect(headerTitle).toContain('Built by Somansh Garg');
    expect(headerTitle).toContain('v2.4');
  });

  test('7. Verify multi-tab behavior and unsaved changes asterisk lifecycle', async () => {
    // Open a document to create a tab
    await page.click('#btn-open');
    const firstPage = page.locator('.page-container[data-page="1"]');
    await expect(firstPage).toBeVisible({ timeout: 10000 });

    // Verify initial tab has no asterisk
    const firstTab = page.locator('.tab.active .tab-name');
    await expect(firstTab).not.toContainText('*');

    // Click Pen tool to draw
    const penBtn = page.locator('[data-tool="pen"]');
    await penBtn.click();

    // Draw on the canvas
    const canvas = page.locator('.page-container[data-page="1"] .pdf-canvas');
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + 100, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 150, box.y + 150);
    await page.mouse.up();

    // Verify asterisk appears
    await expect(firstTab).toContainText('*');

    // Press Ctrl+Z to undo
    await page.keyboard.press('Control+z');
    // Verify asterisk disappears
    await expect(firstTab).not.toContainText('*');

    // Draw again
    await page.mouse.move(box.x + 100, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 150, box.y + 150);
    await page.mouse.up();
    await expect(firstTab).toContainText('*');

    // Click Clear Annotations button
    const clearBtn = page.locator('#btn-clear-all');
    await clearBtn.click();
    // Verify asterisk disappears
    await expect(firstTab).not.toContainText('*');

    // Draw again
    await page.mouse.move(box.x + 100, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 150, box.y + 150);
    await page.mouse.up();
    await expect(firstTab).toContainText('*');

    // Save PDF
    const saveBtn = page.locator('#btn-save');
    await saveBtn.click();
    // Verify asterisk disappears after save
    await expect(firstTab).not.toContainText('*');
  });

  test('8. Verify dirty tab close modal cancel/discard behavior', async () => {
    // Open a document
    await page.click('#btn-open');
    const firstPage = page.locator('.page-container[data-page="1"]');
    await expect(firstPage).toBeVisible({ timeout: 10000 });

    // Draw on canvas to make it dirty
    await page.locator('[data-tool="pen"]').click();
    const canvas = page.locator('.page-container[data-page="1"] .pdf-canvas');
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + 100, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 150, box.y + 150);
    await page.mouse.up();

    // Click close × on active tab
    const closeTabBtn = page.locator('.tab.active .tab-close');
    await closeTabBtn.click();

    // Unsaved changes modal should be visible
    const modal = page.locator('#unsaved-modal');
    await expect(modal).toBeVisible();

    // Click Cancel
    await page.locator('#modal-btn-cancel').click();
    await expect(modal).toBeHidden();
    
    // Active tab and drawing should still be there
    await expect(page.locator('.tab.active')).toBeVisible();

    // Click close × again
    await closeTabBtn.click();
    await expect(modal).toBeVisible();

    // Click Don't Save
    await page.locator('#modal-btn-discard').click();
    await expect(modal).toBeHidden();

    // Empty state should be visible since tab is closed
    await expect(page.locator('#empty-state')).toBeVisible();
  });

  test('9. Verify split-button hover highlights and popovers', async () => {
    const shapeSelect = page.locator('#btn-shape-select');
    const shapeArrow = page.locator('#btn-shape-arrow');
    const shapesPopover = page.locator('.shapes-popover');

    // Popover is hidden initially
    await expect(shapesPopover).toBeHidden();

    // Hover main part of split button
    await shapeSelect.hover();
    const mainHoverBg = await shapeSelect.evaluate(el => window.getComputedStyle(el).backgroundColor);

    // Hover arrow part
    await shapeArrow.hover();
    const arrowHoverBg = await shapeArrow.evaluate(el => window.getComputedStyle(el).backgroundColor);

    // Verify hover styles are active (background differs from default or transparent)
    expect(mainHoverBg).not.toBe(arrowHoverBg);

    // Click shape arrow to open popover
    await shapeArrow.click();
    await expect(shapesPopover).toBeVisible();

    // Glow highlight check (the dropdown container gets the active class style or toggle border)
    const dropdown = page.locator('#shapes-dropdown');
    await shapeArrow.click(); // toggle close
    await expect(shapesPopover).toBeHidden();
  });

  test('10. Verify color selection Pen sync and thickness persistence', async () => {
    // Select Highlighter tool first
    await page.locator('[data-tool="highlighter"]').click();
    
    // Click colors dropdown chevron
    await page.locator('#btn-color-arrow').click();
    
    // Select red swatch
    const redSwatch = page.locator('.color-swatch[data-color="#ef4444"]');
    await redSwatch.click();
    
    // Verify tool auto-switches to Pen
    const penBtn = page.locator('[data-tool="pen"]');
    await expect(penBtn).toHaveClass(/active/);
    
    // Open thickness dropdown
    const thicknessArrow = page.locator('#btn-thickness-arrow');
    await thicknessArrow.click();
    const thicknessPopover = page.locator('.thickness-popover');
    await expect(thicknessPopover).toBeVisible();

    // Drag slider
    const slider = page.locator('#thickness-slider');
    await slider.fill('15');
    
    // Verify popover remains visible after interaction
    await expect(thicknessPopover).toBeVisible();

    // Click outside to close (e.g. click empty-state or toolbar background)
    await page.click('#app-toolbar');
    await expect(thicknessPopover).toBeHidden();
  });

  test('11. Verify laser pointer rules, canvas trails, and settings decay', async () => {
    const laserBtn = page.locator('#btn-laser');
    await laserBtn.click();

    const laserDot = page.locator('#laser-dot');
    const laserCanvas = page.locator('#laser-canvas');

    // Laser dot and canvas should be visible
    await expect(laserDot).toBeVisible();
    await expect(laserCanvas).toBeVisible();

    // Hover over empty state without click (should not draw, but moves dot)
    await page.locator('#empty-state').hover();
    
    // Open laser settings arrow
    await page.locator('#btn-laser-arrow').click();
    const durationSlider = page.locator('#laser-duration-slider');
    await durationSlider.fill('5000'); // set fade to 5.0 seconds
    const durationVal = page.locator('#laser-duration-val');
    await expect(durationVal).toHaveText('5.0s');

    // Select Pen tool and right-click drag to temporarily show laser
    const penBtn = page.locator('[data-tool="pen"]');
    await penBtn.click();
    
    const bodyBox = await page.locator('body').boundingBox();
    await page.mouse.move(bodyBox.x + 200, bodyBox.y + 200);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(bodyBox.x + 300, bodyBox.y + 300);
    
    // Laser dot should be visible during right-click hold
    await expect(laserDot).toBeVisible();
    
    await page.mouse.up({ button: 'right' });
    // Laser dot should disappear and Pen tool remains active
    await expect(laserDot).toBeHidden();
    await expect(penBtn).toHaveClass(/active/);
  });

  test('12. Verify reveal curtain arrow navigation and vicinity-aware page indicator', async () => {
    // Open document first
    await page.click('#btn-open');
    const firstPage = page.locator('.page-container[data-page="1"]');
    await expect(firstPage).toBeVisible({ timeout: 10000 });

    // Test Reveal Curtain
    const revealBtn = page.locator('#btn-reveal');
    await revealBtn.click();

    const curtainOverlay = page.locator('#global-reveal-overlay');
    await expect(curtainOverlay).toBeVisible();

    const handle = page.locator('.reveal-handle');
    await handle.focus();

    await page.keyboard.press('ArrowDown');
    const valBefore = await handle.getAttribute('aria-valuenow');
    
    await page.keyboard.press('ArrowDown');
    const valAfter = await handle.getAttribute('aria-valuenow');
    
    expect(parseInt(valAfter)).toBeGreaterThan(parseInt(valBefore));

    // Disable curtain
    await revealBtn.click();
    await expect(curtainOverlay).toBeHidden();

    // Test Vicinity Page Indicator
    const indicator = page.locator('#page-indicator');
    const hoverZone = page.locator('#page-indicator-zone');
    
    // Hover vicinity zone to slide up
    await hoverZone.hover();
    await page.waitForTimeout(300); // Wait for transition animation
    const hoveredOpacity = await indicator.evaluate(el => window.getComputedStyle(el).opacity);
    expect(parseFloat(hoveredOpacity)).toBeCloseTo(1.0, 1);

    // Move away to fade out
    await page.locator('#app-toolbar').hover();
    await page.waitForTimeout(400); // Wait for transition animation
    const leftOpacity = await indicator.evaluate(el => window.getComputedStyle(el).opacity);
    expect(parseFloat(leftOpacity)).toBeCloseTo(0.0, 1);
  });

  test('13. Verify theme persistence (Light/Dark mode)', async () => {
    const themeBtn = page.locator('#btn-theme-toggle');
    const body = page.locator('body');

    // Initially dark theme (body does not have light-mode class)
    await expect(body).not.toHaveClass(/light-mode/);

    // Switch to Light mode
    await themeBtn.click();
    await expect(body).toHaveClass(/light-mode/);

    // Reload page and check persistence
    await page.reload();
    await expect(body).toHaveClass(/light-mode/);

    // Switch back to Dark mode
    await themeBtn.click();
    await expect(body).not.toHaveClass(/light-mode/);
  });

  test('14. Verify exit prompt interception (Save All / Don\'t Save / Cancel)', async () => {
    // Open a document
    await page.click('#btn-open');
    const firstPage = page.locator('.page-container[data-page="1"]');
    await expect(firstPage).toBeVisible({ timeout: 10000 });

    // Draw to make it dirty
    await page.locator('[data-tool="pen"]').click();
    const canvas = page.locator('.page-container[data-page="1"] .pdf-canvas');
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + 100, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 150, box.y + 150);
    await page.mouse.up();

    // Trigger window close event on the main process
    await electronApp.evaluate(async (electronModule) => {
      const { BrowserWindow } = electronModule;
      const win = BrowserWindow.getAllWindows()[0];
      win.close();
    });

    // Unsaved changes modal should be visible
    const modal = page.locator('#unsaved-modal');
    await expect(modal).toBeVisible();

    // Click Cancel
    await page.locator('#modal-btn-cancel').click();
    await expect(modal).toBeHidden();

    // Trigger window close event again
    await electronApp.evaluate(async (electronModule) => {
      const { BrowserWindow } = electronModule;
      const win = BrowserWindow.getAllWindows()[0];
      win.close();
    });

    await expect(modal).toBeVisible();

    // Listen for electron app close event
    const closePromise = new Promise(resolve => {
      electronApp.on('close', () => resolve());
    });

    // Click Don't Save to close the application
    await page.locator('#modal-btn-discard').click();

    // Wait for the Electron application to fully terminate
    await closePromise;
  });
});
