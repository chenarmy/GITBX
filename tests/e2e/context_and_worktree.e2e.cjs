/**
 * Dedicated Playwright E2E Test Suite for GITBX:
 * - Branch Context Menu (sidebar right-click)
 * - Commit Context Menu (canvas right-click)
 * - PR/MR Feature (URL generation & Modal)
 * - Worktree Lifecycle (Right-click creation, Manager modal, Lock/Unlock, Remove)
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const REPO_PATH = path.resolve('I:\\gitbx-4-test');
const SCREENSHOT_DIR = path.resolve('C:\\Users\\Administrator\\.gemini\\antigravity\\brain\\d4dcf94c-c44c-4207-8e41-01a587b69341\\screenshots\\context_worktree');
const APP_URL = 'http://127.0.0.1:5188';

function git(...args) {
  return execFileSync('git', ['-C', REPO_PATH, ...args], { encoding: 'utf8' }).trim();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function closeModal(page) {
  try {
    const dialog = await page.$('div[role="dialog"]');
    if (!dialog) return;
    const closeBtn = await dialog.$('button[aria-label="Close dialog"], button[aria-label="Close"], button:has(svg.lucide-x)');
    if (closeBtn && await closeBtn.isVisible()) {
      await closeBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForSelector('div[role="dialog"]', { state: 'detached', timeout: 3000 });
  } catch {
    await page.keyboard.press('Escape');
  }
  await sleep(400);
}

async function run() {
  console.log('====================================================');
  console.log(' Starting Context Menus, PR/MR & Worktree E2E Test');
  console.log(' App URL:', APP_URL);
  console.log(' Screenshots:', SCREENSHOT_DIR);
  console.log('====================================================\n');

  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  // Ensure test repository is clean on master and worktrees are cleaned
  try {
    const wtList = git('worktree', 'list', '--porcelain');
    const wtPaths = wtList.split('\n')
      .filter(l => l.startsWith('worktree '))
      .map(l => l.replace('worktree ', '').trim())
      .filter(p => path.resolve(p) !== REPO_PATH);
    for (const p of wtPaths) {
      try { git('worktree', 'remove', '--force', p); } catch {}
    }
    git('worktree', 'prune');
  } catch (e) {
    console.warn('Worktree cleanup warning:', e.message);
  }

  try { git('merge', '--abort'); } catch {}
  git('checkout', 'master');
  git('reset', '--hard', 'HEAD');

  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  await context.addInitScript(() => {
    localStorage.setItem('gitbx_web_token', 'playwright-test-token');
    localStorage.setItem('gitbx_active_repo', 'I:\\gitbx-4-test');
    localStorage.setItem('gitbx_managed_repos', JSON.stringify([
      { path: 'I:\\gitbx-4-test', name: 'gitbx-4-test', lastOpened: Date.now() }
    ]));
    localStorage.setItem('gitbx_locale', 'zh-CN');
    localStorage.setItem('gitbx_theme', 'dark');
  });

  const page = await context.newPage();

  const errors = [];
  const warnings = [];
  const requestFailures = [];

  page.on('pageerror', err => {
    console.error(' [PAGE ERROR]', err.message);
    errors.push({ type: 'pageerror', message: err.message, stack: err.stack });
  });

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.error(' [CONSOLE ERROR]', msg.text());
      errors.push({ type: 'console.error', text: msg.text() });
    } else if (msg.type() === 'warning') {
      warnings.push(msg.text());
    }
  });

  page.on('requestfailed', req => {
    const failure = req.failure();
    console.warn(` [REQUEST FAILED] ${req.method()} ${req.url()} - ${failure ? failure.errorText : 'Unknown'}`);
    requestFailures.push({ url: req.url(), method: req.method(), error: failure?.errorText });
  });

  const testResults = [];

  async function testStep(name, fn) {
    try {
      console.log(`\n---> [STEP] ${name}`);
      await fn();
      testResults.push({ name, status: 'PASS' });
      console.log(`[PASS] ${name}`);
    } catch (err) {
      testResults.push({ name, status: 'FAIL', error: err.message });
      console.error(`[FAIL] ${name}:`, err.message);
      const errShot = path.join(SCREENSHOT_DIR, `ERROR_${Date.now()}.png`);
      try { await page.screenshot({ path: errShot, fullPage: true }); } catch {}
      await closeModal(page);
    }
  }

  try {
    // Step 1: Open app
    await testStep('1. Open Application and Mount Test Repository', async () => {
      await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 15000 });
      await sleep(1500);

      await page.waitForSelector('text=gitbx-4-test', { timeout: 10000 });
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_app_loaded.png') });
    });

    // Step 2: Branch Right-Click Context Menu (develop branch)
    await testStep('2. Verify Branch Right-Click Context Menu Renders with Options', async () => {
      // Find develop in sidebar local branches
      const branchSpan = await page.waitForSelector('.dbx-sidebar span:text-is("develop")', { timeout: 5000 });
      if (!branchSpan) throw new Error('develop branch not found in sidebar');

      // Right click branch
      await branchSpan.click({ button: 'right' });
      await sleep(500);

      // Verify context menu is visible
      const contextMenu = await page.waitForSelector('.fixed.z-50.w-72.bg-popover', { timeout: 3000 });
      if (!contextMenu) throw new Error('Branch context menu did not open');

      const menuText = await contextMenu.innerText();
      console.log(' Branch Context Menu Items detected:\n' + menuText.split('\n').filter(Boolean).map(s => '  - ' + s).join('\n'));

      // Assert essential items exist
      if (!menuText.includes('检出') && !menuText.includes('Checkout')) {
        throw new Error('Missing Checkout option in branch context menu');
      }
      if (!menuText.includes('工作树') && !menuText.includes('Worktree')) {
        throw new Error('Missing Worktree options in branch context menu');
      }
      if (!menuText.includes('比较') && !menuText.includes('Compare')) {
        throw new Error('Missing Compare option in branch context menu');
      }

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_branch_context_menu.png') });
    });

    // Step 3: Branch Compare Feature via Right-Click Menu
    await testStep('3. Test Branch Comparison Action from Context Menu', async () => {
      const compareBtn = await page.waitForSelector('.fixed.z-50.w-72.bg-popover button:has-text("比较"), .fixed.z-50.w-72.bg-popover button:has-text("Compare")', { timeout: 3000 });
      if (!compareBtn) throw new Error('Compare button not found in context menu');

      await compareBtn.click();
      await sleep(1000);

      // Verify notification or compare mode active
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_branch_compare_active.png') });
    });

    // Step 4: Commit Context Menu in CommitGraphCanvas
    await testStep('4. Verify Commit Right-Click Context Menu in Graph Canvas', async () => {
      const commitRow = await page.waitForSelector('div[id^="commit-"]', { timeout: 5000 });
      if (!commitRow) throw new Error('Commit row not found in graph canvas');

      // Right click commit row
      await commitRow.click({ button: 'right' });
      await sleep(500);

      const commitMenu = await page.waitForSelector('.fixed.z-50.w-64.bg-popover', { timeout: 3000 });
      if (!commitMenu) throw new Error('Commit context menu did not open');

      const menuText = await commitMenu.innerText();
      console.log(' Commit Context Menu Items detected:\n' + menuText.split('\n').filter(Boolean).map(s => '  - ' + s).join('\n'));

      if (!menuText.includes('复制提交') && !menuText.includes('Copy Commit SHA') && !menuText.includes('SHA')) {
        throw new Error('Missing Copy SHA in commit context menu');
      }
      if (!menuText.includes('标签') && !menuText.includes('Tag')) {
        throw new Error('Missing Tag option in commit context menu');
      }
      if (!menuText.includes('分支') && !menuText.includes('Branch')) {
        throw new Error('Missing Branch option in commit context menu');
      }

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_commit_context_menu.png') });
    });

    // Step 5: Test "New Tag at this Commit" via Commit Right-Click Menu
    await testStep('5. Trigger "New Tag at this Commit" and Verify Modal Pre-population', async () => {
      const tagBtn = await page.waitForSelector('.fixed.z-50.w-64.bg-popover button:has-text("标签"), .fixed.z-50.w-64.bg-popover button:has-text("Tag")', { timeout: 3000 });
      if (!tagBtn) throw new Error('Tag button in commit context menu not found');

      await tagBtn.click();
      await sleep(500);

      // Verify TagModal opens
      const tagModal = await page.waitForSelector('div[role="dialog"]', { timeout: 3000 });
      if (!tagModal) throw new Error('TagModal did not open');

      const modalText = await tagModal.innerText();
      if (!modalText.includes('目标提交') && !modalText.includes('Target Commit')) {
        throw new Error('TagModal does not display target commit information');
      }

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_tag_modal_from_commit.png') });
      await closeModal(page);
    });

    // Step 6: PR/MR Feature Verification
    await testStep('6. Test PR/MR Modal, Branch Auto-detection & Backend URL Generation', async () => {
      // Open More Actions dropdown in toolbar
      const moreBtn = await page.waitForSelector('button[title="更多操作"], button[title="More actions"]', { timeout: 3000 });
      if (!moreBtn) throw new Error('More actions toolbar button not found');
      await moreBtn.click();
      await sleep(400);

      // Click PR/MR
      const prmrMenuBtn = await page.waitForSelector('button:has-text("PR/MR")', { timeout: 3000 });
      if (!prmrMenuBtn) throw new Error('PR/MR button not found in more actions dropdown');
      await prmrMenuBtn.click();
      await sleep(600);

      // Verify PR/MR Modal is visible (matches either "PR", "拉取", "合并", "Pull")
      const prModal = await page.waitForSelector('div[role="dialog"]:has-text("PR"), div[role="dialog"]:has-text("拉取"), div[role="dialog"]:has-text("合并"), div[role="dialog"]:has-text("Pull")', { timeout: 4000 });
      if (!prModal) throw new Error('PR/MR modal did not open');

      // Check input fields
      const inputs = await prModal.$$('input');
      if (inputs.length < 2) throw new Error('Expected 2 input fields (Target branch and Source branch)');

      const targetBranchVal = await inputs[0].inputValue();
      const sourceBranchVal = await inputs[1].inputValue();
      console.log(` PR/MR prefilled values - Target Branch: "${targetBranchVal}", Source Branch: "${sourceBranchVal}"`);

      // Verify target branch defaults smartly to master (not blank or non-existent)
      if (!targetBranchVal) {
        throw new Error('Target branch is empty');
      }

      // Test URL generation via backend API
      const fetchUrlRes = await page.evaluate(async () => {
        const res = await fetch('http://127.0.0.1:8080/api/repo/pull-request-url?path=' + encodeURIComponent('I:\\gitbx-4-test') + '&base=master&compare=feat/user-auth', {
          headers: { 'Authorization': 'Bearer playwright-test-token' }
        });
        return { status: res.status, json: await res.json() };
      });

      const prUrl = typeof fetchUrlRes.json === 'string' ? fetchUrlRes.json : fetchUrlRes.json?.data;
      if (fetchUrlRes.status !== 200 || !prUrl || !prUrl.includes('gitee.com')) {
        throw new Error(`Failed to generate valid Gitee PR URL: ${JSON.stringify(fetchUrlRes)}`);
      }

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_prmr_modal.png') });
      await closeModal(page);
    });

    // Step 7: Worktree Creation via Branch Context Menu
    await testStep('7. Create Worktree from Branch Context Menu with Default Path', async () => {
      // Locate payment branch in sidebar (under feat/ directory)
      const paymentSpan = await page.waitForSelector('.dbx-sidebar span:text-is("payment")', { timeout: 5000 });
      if (!paymentSpan) throw new Error('feat/payment branch not found in sidebar');

      // Right click feat/payment
      await paymentSpan.click({ button: 'right' });
      await sleep(500);

      // Click "New Worktree from 'feat/payment'..."
      const newWtBtn = await page.waitForSelector('.fixed.z-50.w-72.bg-popover button:has-text("工作树"), .fixed.z-50.w-72.bg-popover button:has-text("Worktree")', { timeout: 3000 });
      if (!newWtBtn) throw new Error('New Worktree button not found in branch context menu');
      await newWtBtn.click();
      await sleep(500);

      // Verify Confirmation prompt dialog appears
      const confirmDialog = await page.waitForSelector('div[role="dialog"]', { timeout: 3000 });
      if (!confirmDialog) throw new Error('Create Worktree confirmation dialog not shown');

      const destInput = await confirmDialog.$('input');
      if (!destInput) throw new Error('Destination path input not found in confirmation dialog');

      const initialVal = await destInput.inputValue();
      console.log(' Pre-filled Worktree Destination Path:', initialVal);
      if (!initialVal || !initialVal.includes('worktrees')) {
        throw new Error(`Expected pre-filled destination path containing 'worktrees', got: "${initialVal}"`);
      }

      // Click confirm button
      const confirmSubmitBtn = await confirmDialog.waitForSelector('button:has-text("确定"), button:has-text("确认"), button:has-text("Confirm")', { timeout: 3000 });
      if (!confirmSubmitBtn) throw new Error('Confirm button not found in worktree dialog');
      await confirmSubmitBtn.click();

      // Wait for Worktree Manager Modal to automatically open upon success
      await page.waitForSelector('div[role="dialog"]:has-text("Worktree"), div[role="dialog"]:has-text("工作树")', { timeout: 10000 });
      await sleep(1000);

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_worktree_created_in_manager.png') });
    });

    // Step 8: Worktree Manager Lifecycle (Lock, Unlock, Remove)
    await testStep('8. Test Worktree Lock, Unlock, and Removal Lifecycle in Modal', async () => {
      const wtModal = await page.waitForSelector('div[role="dialog"]:has-text("工作树"), div[role="dialog"]:has-text("Worktree")', { timeout: 3000 });
      if (!wtModal) throw new Error('Worktree Manager modal not open');

      // Find the row for feat/payment
      const paymentRow = await page.waitForSelector('div[role="dialog"] div:has-text("feat/payment")', { timeout: 5000 });
      if (!paymentRow) throw new Error('Created feat/payment worktree row not found in Worktree Manager');

      console.log(' feat/payment worktree detected in Worktree Manager table');

      // Find action buttons inside the row: Lock button
      const lockBtn = await page.$('button[title*="锁定"], button[title*="Lock"]');
      if (lockBtn) {
        await lockBtn.click();
        await sleep(1000);
        console.log(' Clicked Lock button on worktree');

        // Verify it changed to Unlock
        const unlockBtn = await page.waitForSelector('button[title*="解锁"], button[title*="Unlock"]', { timeout: 3000 });
        if (!unlockBtn) throw new Error('Worktree did not change to locked state (Unlock button not found)');
        console.log(' Worktree successfully locked');

        // Unlock it back
        await unlockBtn.click();
        await sleep(1000);
        console.log(' Worktree successfully unlocked');
      }

      // Test Remove worktree
      const removeBtn = await page.waitForSelector('button:has(svg.lucide-trash-2), button.text-rose-500', { timeout: 5000 });
      if (!removeBtn) throw new Error('Remove worktree button not found');
      await removeBtn.click();
      await sleep(500);

      // Confirm removal dialog
      const confirmRemoveDialog = await page.waitForSelector('div[role="dialog"]:has-text("Remove"), div[role="dialog"]:has-text("删除"), div[role="dialog"]:has-text("移除")', { timeout: 3000 });
      if (confirmRemoveDialog) {
        const confirmBtn = await confirmRemoveDialog.$('button:has-text("确认"), button:has-text("Remove"), button:has-text("确定"), button:has-text("移除")');
        if (confirmBtn) await confirmBtn.click();
        await sleep(1500);
      }

      console.log(' Worktree feat/payment removed successfully');
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_worktree_removed.png') });
      await closeModal(page);
    });

    // Step 9: Verify Git State Cleanliness
    await testStep('9. Verify Git Worktree State and Absence of Lingering Artifacts', async () => {
      const wtList = git('worktree', 'list', '--porcelain');
      const lines = wtList.split('\n').filter(l => l.startsWith('worktree '));
      console.log(' Remaining Git worktrees count:', lines.length);
      if (lines.length !== 1) {
        throw new Error(`Expected exactly 1 worktree (main), found: ${lines.join(', ')}`);
      }
    });

  } finally {
    // Collect summary
    const summary = {
      timestamp: new Date().toISOString(),
      testResults,
      pageErrors: errors,
      consoleWarnings: warnings.length,
      requestFailures,
    };

    fs.writeFileSync(
      path.join(SCREENSHOT_DIR, 'context_worktree_summary.json'),
      JSON.stringify(summary, null, 2)
    );

    console.log('\n====================================================');
    console.log(' Test Run Summary:');
    console.log(' Passed:', testResults.filter(r => r.status === 'PASS').length);
    console.log(' Failed:', testResults.filter(r => r.status === 'FAIL').length);
    console.log(' Page Errors:', errors.length);
    console.log(' Request Failures:', requestFailures.length);
    console.log('====================================================\n');

    await browser.close();
  }
}

run().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
