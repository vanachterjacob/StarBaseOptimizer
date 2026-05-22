/**
 * Timeline Markdown Exporter
 *
 * Exports the full visible Dynamics 365 case timeline to a Markdown file.
 */

class TimelineExporterHandler extends BaseHandler {
  constructor() {
    super({ id: 'timelineExporter', cooldownTime: 1000 });
    this.buttonId = 'starbase-export-timeline-button';
    this.commandItemId = 'starbase-export-timeline-command';
    this.observerId = null;
    this.injectTimer = null;
    this.retryTimer = null;
    this.isExporting = false;
    this.logBuffer = [];
    this._interceptConsole();
  }

  _interceptConsole() {
    const buffer = this.logBuffer;
    ['log', 'warn', 'error', 'info', 'debug'].forEach(method => {
      const original = console[method].bind(console);
      console[method] = (...args) => {
        original(...args);
        const text = args.map(a => {
          if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack || ''}`;
          if (typeof a === 'object' && a !== null) { try { return JSON.stringify(a); } catch { return String(a); } }
          return String(a);
        }).join(' ');
        buffer.push(`[${new Date().toISOString()}] [${method.toUpperCase()}] ${text}`);
        if (buffer.length > 3000) buffer.shift();
      };
    });
  }

  get buttonLabel() {
    return '\uD83D\uDCCB Export Timeline';
  }

  async init(context) {
    if (context.isIframe) {
      return;
    }

    console.log('[TimelineExporter] Starting lightweight timeline watcher');

    this.watchForReRender();
    this.scheduleInjectButton(250);
    this.startRetryTimer();
    this.initialized = true;
    console.log('[TimelineExporter] Timeline exporter initialized');
  }

  async waitForTimeline() {
    return await domObserver.waitForElement(this.getTimelineRootSelector(), 20000);
  }

  watchForReRender() {
    if (this.observerId) {
      domObserver.disconnect(this.observerId);
    }

    this.observerId = domObserver.observeElement(document.body, () => {
      if (!document.getElementById(this.buttonId)) {
        this.scheduleInjectButton(500);
      }
    }, { childList: true, subtree: true, attributes: false, characterData: false });
  }

  scheduleInjectButton(delay = 750) {
    if (this.injectTimer) {
      clearTimeout(this.injectTimer);
    }

    this.injectTimer = setTimeout(() => {
      this.injectTimer = null;
      this.injectButton();
    }, delay);
  }

  startRetryTimer() {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
    }

    this.retryTimer = setInterval(() => {
      if (!document.getElementById(this.buttonId)) {
        this.injectButton();
      }
    }, 5000);
  }

  injectButton() {
    const timeline = this.findTimelineRoot();
    if (!timeline) {
      return;
    }

    let button = document.getElementById(this.buttonId);
    if (button && (button.contains(timeline) || button === timeline)) {
      button.remove();
      button = null;
    }
    button = button || this.createExportButton();
    const toolbar = this.findTimelineToolbar(timeline);

    if (toolbar && !button.contains(toolbar)) {
      this.moveButtonToTimelineToolbar(button, toolbar);
      return;
    }

    const commandBar = this.findCommandBar();
    if (commandBar && commandBar.tagName === 'UL' && !button.contains(commandBar)) {
      if (commandBar.contains(button)) {
        return;
      }

      this.removeButtonWrapper();
      button.dataset.timelineToolbar = 'false';
      const item = document.createElement('li');
      item.id = this.commandItemId;
      item.setAttribute('role', 'presentation');
      item.style.cssText = 'list-style: none; display: flex; align-items: center;';
      item.appendChild(button);
      const firstVisibleCommand = Array.from(commandBar.children)
        .find(child => this.isVisible(child));

      if (firstVisibleCommand) {
        commandBar.insertBefore(item, firstVisibleCommand);
      } else {
        commandBar.appendChild(item);
      }
      return;
    }

    const existingWrapper = document.getElementById(this.commandItemId);
    if (existingWrapper?.nextElementSibling === timeline) {
      return;
    }

    this.removeButtonWrapper();
    button.dataset.timelineToolbar = 'false';
    button.style.background = 'transparent';
    button.style.borderColor = 'transparent';
    button.style.color = '#323130';
    button.style.marginRight = '0';
    button.style.minHeight = '34px';
    button.style.height = '';
    button.style.fontSize = '14px';
    const wrapper = document.createElement('div');
    wrapper.id = this.commandItemId;
    wrapper.style.cssText = `
      display: flex;
      justify-content: flex-start;
      padding: 6px 8px;
      border-bottom: 1px solid #edebe9;
      background: #ffffff;
      position: sticky;
      top: 0;
      z-index: 10;
    `;
    button.remove();
    wrapper.appendChild(button);
    if (!timeline.parentNode || wrapper.contains(timeline) || wrapper.contains(timeline.parentNode)) {
      console.warn('[TimelineExporter] Cannot insert wrapper: hierarchy conflict, will retry');
      return;
    }
    timeline.insertAdjacentElement('beforebegin', wrapper);
  }

  findCommandBar() {
    return document.querySelector('ul[data-id="CommandBar"][data-lp-id="commandbar-Form:incident"]') ||
      document.querySelector('ul[aria-label="Commands"][data-lp-id*="Form:incident"]') ||
      document.querySelector('ul[data-id="CommandBar"][data-lp-id*="Form"]') ||
      document.querySelector('[data-id="commandbar"] ul');
  }

  findTimelineToolbar(timeline = this.findTimelineRoot()) {
    if (!timeline) {
      return null;
    }

    return timeline.querySelector('[data-id="notescontrol-action_bar_add_command"]')?.parentElement ||
      timeline.querySelector('[data-id*="notescontrol-action_bar_add_command"]')?.parentElement ||
      timeline.querySelector('[data-id*="notescontrol-refreshTimeline_flyoutMenuItem"]')?.parentElement ||
      timeline.querySelector('[data-id*="notescontrol-action_bar_more_command"]')?.parentElement ||
      timeline.querySelector('[aria-label="Timeline"]')?.parentElement?.querySelector('.flexbox:last-child') ||
      timeline.querySelector('[aria-label*="Timeline"]')?.parentElement?.querySelector('.flexbox:last-child') ||
      timeline.querySelector('[role="toolbar"]');
  }

  moveButtonToTimelineToolbar(button, toolbar) {
    if (toolbar.contains(button)) {
      return;
    }

    this.removeButtonWrapper();
    button.dataset.timelineToolbar = 'true';
    button.removeAttribute('role');
    button.style.background = '#0f6cbd';
    button.style.borderColor = '#0f6cbd';
    button.style.color = '#ffffff';
    button.style.marginRight = '8px';
    button.style.minHeight = '28px';
    button.style.height = '28px';
    button.style.fontSize = '12px';
    toolbar.insertBefore(button, toolbar.firstChild);
  }

  removeButtonWrapper() {
    const wrapper = document.getElementById(this.commandItemId);
    if (wrapper) {
      wrapper.remove();
    }
  }

  createExportButton() {
    const button = document.createElement('button');
    button.id = this.buttonId;
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    button.setAttribute('aria-label', 'Export Timeline');
    button.title = 'Export Timeline';
    button.textContent = this.buttonLabel;
    button.style.cssText = `
      align-items: center;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 2px;
      color: #323130;
      cursor: pointer;
      display: inline-flex;
      font-family: "Segoe UI", Arial, sans-serif;
      font-size: 14px;
      gap: 6px;
      min-height: 34px;
      padding: 0 10px;
      white-space: nowrap;
    `;

    button.addEventListener('mouseenter', () => {
      if (!button.disabled) {
        button.style.background = button.dataset.timelineToolbar === 'true' ? '#115ea3' : '#f3f2f1';
        button.style.borderColor = button.dataset.timelineToolbar === 'true' ? '#115ea3' : '#edebe9';
      }
    });
    button.addEventListener('mouseleave', () => {
      button.style.background = button.dataset.timelineToolbar === 'true' ? '#0f6cbd' : 'transparent';
      button.style.borderColor = button.dataset.timelineToolbar === 'true' ? '#0f6cbd' : 'transparent';
    });
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.showFilterMenu(button);
    }, true);

    return button;
  }

  showFilterMenu(button) {
    const existingMenu = document.getElementById('starbase-filter-menu');
    if (existingMenu) {
      existingMenu.remove();
      return;
    }

    const filters = [
      { label: 'Vandaag',           type: 'date',  days: 0 },
      { label: 'Laatste 7 dagen',   type: 'date',  days: 7 },
      { label: 'Laatste 30 dagen',  type: 'date',  days: 30 },
      { label: 'Laatste 5 items',   type: 'count', count: 5 },
      { label: 'Laatste 10 items',  type: 'count', count: 10 },
      { label: 'Alles exporteren',  type: 'all' }
    ];

    const menu = document.createElement('div');
    menu.id = 'starbase-filter-menu';
    menu.style.cssText = `
      position: fixed;
      background: #ffffff;
      border: 1px solid #d2d0ce;
      border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 99999;
      min-width: 180px;
      padding: 4px 0;
      font-family: "Segoe UI", Arial, sans-serif;
      font-size: 13px;
    `;

    filters.forEach(filter => {
      const item = document.createElement('div');
      item.textContent = filter.label;
      item.style.cssText = `
        padding: 8px 14px;
        cursor: pointer;
        color: #323130;
        white-space: nowrap;
      `;
      item.addEventListener('mouseenter', () => { item.style.background = '#f3f2f1'; });
      item.addEventListener('mouseleave', () => { item.style.background = ''; });
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.remove();
        this.exportTimeline(button, filter);
      });
      menu.appendChild(item);
    });

    document.body.appendChild(menu);

    const rect = button.getBoundingClientRect();
    const menuHeight = filters.length * 37;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow >= menuHeight ? rect.bottom + 4 : rect.top - menuHeight - 4;
    menu.style.top = `${top}px`;
    menu.style.left = `${rect.left}px`;

    const close = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', close, true);
      }
    };
    setTimeout(() => document.addEventListener('click', close, true), 0);
  }

  parseEntryDate(dateTimeStr) {
    if (!dateTimeStr) return null;
    const s = dateTimeStr.trim();

    // DD/MM/YYYY or DD-MM-YYYY
    let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);

    // MM/DD/YYYY
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return new Date(+m[3], +m[1] - 1, +m[2]);

    const parsed = new Date(s);
    return isNaN(parsed) ? null : parsed;
  }

  applyFilter(entries, filter) {
    if (filter.type === 'all') return entries;

    if (filter.type === 'count') {
      const sorted = [...entries].sort((a, b) => {
        const dateA = this.parseEntryDate(a.dateTime);
        const dateB = this.parseEntryDate(b.dateTime);
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateB - dateA;
      });
      return sorted.slice(0, filter.count);
    }

    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (filter.days > 0) cutoff.setDate(cutoff.getDate() - filter.days);

    return entries.filter(entry => {
      const d = this.parseEntryDate(entry.dateTime);
      return d && d >= cutoff;
    });
  }

  async exportTimeline(button, filter = { type: 'all' }) {
    if (this.isExporting) {
      return;
    }

    this.isExporting = true;
    button.disabled = true;
    button.textContent = 'Exporting...';

    try {
      notificationManager.info('Loading full timeline before export...', 3000);
      const timeline = this.findTimelineRoot();
      if (!timeline) {
        throw new Error('Timeline control was not found');
      }

      await this.loadAllTimelineEntries(timeline);
      await this.expandAttachmentControls(timeline);
      await this.waitForTimelineIdle(timeline, 800, 5000);

      const metadata = this.extractCaseMetadata();
      const allEntries = this.extractTimelineEntries(timeline);
      const entries = this.applyFilter(allEntries, filter);
      await this.hydrateDataverseAttachments(entries);
      const folder = this.buildBaseFolder(metadata);
      const imageList = this.buildImageDownloadList(entries);
      const markdown = this.buildMarkdown(metadata, entries, imageList, filter);

      await this.downloadMarkdown(folder, metadata, markdown);
      const imageDownloadStats = await this.downloadTimelineImages(folder, imageList);
      await this.downloadDebugLog(folder, metadata);

      if (entries.length === 0) {
        notificationManager.warning('Exported case metadata, but no timeline entries were found', 5000);
      } else {
        const imageMessage = imageDownloadStats.total > 0
          ? `, downloaded ${imageDownloadStats.downloaded}/${imageDownloadStats.total} images`
          : '';
        notificationManager.success(`Exported ${entries.length} timeline entries${imageMessage}`, 3000);
      }
    } catch (error) {
      console.error('[TimelineExporter] Export failed:', error);
      notificationManager.error(`Timeline export failed: ${error.message}`, 5000);
      await this.downloadDebugLog(null, null, error);
    } finally {
      this.isExporting = false;
      button.disabled = false;
      button.textContent = this.buttonLabel;
    }
  }

  findTimelineRoot() {
    const notesControl = document.querySelector('[data-id="notescontrol"]');
    if (notesControl) {
      return notesControl;
    }

    const timelineSection = document.querySelector('section[data-id="Timeline"], section[aria-label="Timeline_Section"]');
    if (timelineSection) {
      return timelineSection.querySelector('[data-control-name="notescontrol"], [data-lp-id*="TimelineWall|notescontrol"]') || timelineSection;
    }

    return document.querySelector('[class*="ActivitiesTimeline"]');
  }

  getTimelineRootSelector() {
    return [
      '[data-id="notescontrol"]',
      '[data-control-name="notescontrol"]',
      '[data-lp-id*="TimelineWall|notescontrol"]',
      'section[data-id="Timeline"]',
      'section[aria-label="Timeline_Section"]',
      '[class*="ActivitiesTimeline"]'
    ].join(',');
  }

  async loadAllTimelineEntries(timeline) {
    const maxAttempts = 30;
    let previousSignature = this.getTimelineSignature(timeline);
    let stableAttempts = 0;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const loadMore = this.findLoadMoreButton(timeline);

      if (loadMore) {
        this.scrollElementIntoTimelineView(timeline, loadMore);
        loadMore.click();
      } else {
        this.scrollTimelineToEnd(timeline);
      }

      await this.waitForTimelineChange(timeline, previousSignature, loadMore ? 10000 : 2500);
      await this.waitForTimelineIdle(timeline, 400, 5000);

      const currentSignature = this.getTimelineSignature(timeline);
      const stillHasLoadMore = Boolean(this.findLoadMoreButton(timeline));

      if (currentSignature === previousSignature && !stillHasLoadMore) {
        stableAttempts++;
      } else {
        stableAttempts = 0;
      }

      previousSignature = currentSignature;

      if (stableAttempts >= 2) {
        break;
      }
    }
  }

  getTimelineSignature(timeline) {
    const records = this.getTimelineRecords(timeline);
    const scrollHeight = this.getTimelineScrollTargets(timeline)
      .map(target => target.scrollHeight || 0)
      .join(':');
    return `${records.length}:${scrollHeight}`;
  }

  findLoadMoreButton(timeline) {
    const candidates = Array.from(timeline.querySelectorAll(
      '[data-id="notescontrol-seeMoreRecords"] a, [data-id="notescontrol-seeMoreRecords"] button, [id*="seeMoreRecords"] a, [id*="seeMoreRecords"] button'
    ));

    return candidates.find(element => {
      if (!this.isVisible(element) || element.disabled || element.getAttribute('aria-disabled') === 'true') {
        return false;
      }

      const text = this.normalizeText([
        element.getAttribute('aria-label'),
        element.getAttribute('title'),
        element.textContent
      ].filter(Boolean).join(' ')).toLowerCase();

      return text.includes('load more') ||
        text.includes('meer laden');
    }) || null;
  }

  scrollTimelineToEnd(timeline) {
    const target = this.getPrimaryTimelineScrollTarget(timeline);
    if (target) {
      target.scrollTop = target.scrollHeight;
    }
  }

  getTimelineScrollTargets(timeline) {
    const selectors = [
      '[data-id="notescontrol-mainTimeline"]',
      '[data-id="notescontrol-timeline_wall_container"]',
      '[data-id*="timeline_wall_container"]',
      '[class*="ActivitiesTimeline"]'
    ];

    const targets = selectors
      .map(selector => timeline.querySelector(selector))
      .filter(Boolean);

    let current = timeline;
    while (current && current !== document.body) {
      const style = window.getComputedStyle(current);
      if (/(auto|scroll)/.test(`${style.overflowY} ${style.overflow}`)) {
        targets.push(current);
      }
      current = current.parentElement;
    }

    targets.push(timeline);
    return [...new Set(targets)];
  }

  getPrimaryTimelineScrollTarget(timeline) {
    return this.getTimelineScrollTargets(timeline)
      .find(target => target.scrollHeight > target.clientHeight) || timeline;
  }

  scrollElementIntoTimelineView(timeline, element) {
    const target = this.getPrimaryTimelineScrollTarget(timeline);
    if (!target || target === element) {
      return;
    }

    if (target === timeline || timeline.contains(target)) {
      const targetRect = target.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      target.scrollTop += elementRect.top - targetRect.top - Math.max(0, target.clientHeight - elementRect.height - 24);
      return;
    }

    element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  waitForTimelineChange(timeline, previousSignature, timeout) {
    return new Promise(resolve => {
      const start = Date.now();
      const observer = new MutationObserver(() => {
        if (this.getTimelineSignature(timeline) !== previousSignature) {
          cleanup();
        }
      });

      const cleanup = () => {
        observer.disconnect();
        clearInterval(interval);
        clearTimeout(timer);
        setTimeout(resolve, 300);
      };

      const interval = setInterval(() => {
        if (this.getTimelineSignature(timeline) !== previousSignature) {
          cleanup();
        }
      }, 250);

      const timer = setTimeout(() => {
        cleanup();
      }, timeout);

      observer.observe(timeline, { childList: true, subtree: true });

      if (Date.now() - start >= timeout) {
        cleanup();
      }
    });
  }

  async waitForTimelineIdle(timeline, idleMs = 500, timeout = 8000) {
    const start = Date.now();
    let idleStart = Date.now();

    while (Date.now() - start < timeout) {
      if (this.isTimelineLoading(timeline)) {
        idleStart = Date.now();
      } else if (Date.now() - idleStart >= idleMs) {
        return;
      }

      await this.sleep(150);
    }
  }

  isTimelineLoading(timeline) {
    const loadingElement = timeline.querySelector(
      '.indeterminateProgressRing, [role="progressbar"], [aria-label*="Loading"], [aria-label*="loading"]'
    );
    return Boolean(loadingElement && this.isVisible(loadingElement));
  }

  async expandAttachmentControls(timeline) {
    const selectors = [
      'button[aria-label*="attachments"]',
      'button[aria-label*="Attachments"]',
      'button[title*="attachments"]',
      'button[title*="Attachments"]'
    ];

    for (let round = 0; round < 2; round++) {
      const buttons = Array.from(timeline.querySelectorAll(selectors.join(',')))
        .filter(button => this.isVisible(button) && button.getAttribute('aria-expanded') !== 'true');

      if (buttons.length === 0) {
        break;
      }

      for (const button of buttons) {
        button.click();
        await this.sleep(150);
      }

      await this.waitForTimelineIdle(timeline, 300, 3000);
    }
  }

  getTimelineRecords(timeline) {
    const records = Array.from(timeline.querySelectorAll([
      '[id^="timeline_record_control"]',
      '[data-id^="timeline_record_control"]',
      '[id*="timeline_record_control"][id*="notescontrol"]',
      '[data-id*="timeline_record"][data-id*="notescontrol"]'
    ].join(',')));

    return [...new Set(records)]
      .filter(record => record.closest('[data-id="notescontrol"], [class*="ActivitiesTimeline"]') || timeline.contains(record))
      .filter(record => !records.some(other => other !== record && other.contains(record)));
  }

  extractCaseMetadata() {
    const metadata = {
      title: this.getFieldValue(['title', 'header_title'], ['Case Title', 'Title']),
      caseNumber: this.getFieldValue(['header_ticketnumber', 'ticketnumber'], ['Case Number']) || this.findCaseNumberInPage(),
      status: this.getFieldValue(['header_statuscode', 'statuscode', 'statecode'], ['Status', 'Status Reason']),
      priority: this.getFieldValue(['prioritycode', 'header_prioritycode'], ['Priority']),
      owner: this.getFieldValue(['ownerid', 'header_ownerid'], ['Owner']),
      contact: this.getFieldValue(['primarycontactid', 'contactid', 'customerid'], ['Contact', 'Customer']),
      caseType: this.getFieldValue(['nit_casetype', 'casetypecode', 'case_type', 'casetype'], ['Case Type']),
      origin: this.getFieldValue(['caseorigincode', 'origin'], ['Origin', 'Case Origin']),
      totalTimeSpent: this.getFieldValue([
        'nit_totaltimespentonacase',
        'nit_totaltimespentoncase',
        'totaltimespent',
        'total_time_spent'
      ], ['Total Time Spent', 'Total Time']),
      lastUpdated: this.getFieldValue(['modifiedon', 'header_modifiedon'], ['Last Updated', 'Modified On'])
    };

    metadata.title = metadata.title || this.extractTitleFromHeader() || document.title || 'Case';
    metadata.caseNumber = metadata.caseNumber || 'Unknown Case';
    return metadata;
  }

  getFieldValue(fieldNames, labels = []) {
    for (const fieldName of fieldNames) {
      const value = this.readFieldByName(fieldName);
      if (value) {
        return value;
      }
    }

    for (const label of labels) {
      const value = this.readFieldByLabel(label);
      if (value) {
        return value;
      }
    }

    return '';
  }

  readFieldByName(fieldName) {
    const selectors = [
      `[data-control-name="${fieldName}"]`,
      `[data-id="${fieldName}"]`,
      `[data-id="${fieldName}-FieldSectionItemContainer"]`,
      `[data-id^="${fieldName}.fieldControl"]`,
      `[data-id*="${fieldName}.fieldControl-LookupResultsDropdown"][data-id$="_selected_tag_text"]`
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      const root = element?.closest('[data-control-name], [data-id$="-FieldSectionItemContainer"], [data-id]') || element;
      const value = root ? this.readValueFromElement(root, fieldName) : '';
      if (value) {
        return value;
      }
    }

    return '';
  }

  readFieldByLabel(labelText) {
    const labels = Array.from(document.querySelectorAll('label, [role="label"], [id$="-field-label"]'));
    const label = labels.find(element => this.normalizeText(element.textContent).toLowerCase() === labelText.toLowerCase());
    if (!label) {
      return '';
    }

    const container = label.closest('[data-control-name], [data-id$="-FieldSectionItemContainer"]') ||
      label.closest('[role="presentation"]')?.parentElement;

    return container ? this.readValueFromElement(container, '') : '';
  }

  readValueFromElement(element, fieldName) {
    const directValue = this.readDirectControlValue(element);
    if (directValue) {
      return this.cleanFieldValue(directValue, fieldName);
    }

    const selectedLookup = element.querySelector('[data-id$="_selected_tag_text"], [data-id*="selected_tag_text"]');
    if (selectedLookup) {
      return this.cleanFieldValue(selectedLookup.textContent, fieldName);
    }

    const link = Array.from(element.querySelectorAll('[role="link"], a, [title]'))
      .map(candidate => candidate.getAttribute('title') || candidate.textContent)
      .map(value => this.cleanFieldValue(value, fieldName))
      .find(Boolean);

    if (link) {
      return link;
    }

    return this.cleanFieldValue(element.textContent, fieldName);
  }

  readDirectControlValue(element) {
    const controls = element.matches('input, textarea, select')
      ? [element]
      : Array.from(element.querySelectorAll('input, textarea, select'));

    for (const control of controls) {
      const value = control.value ||
        control.getAttribute('title') ||
        control.getAttribute('aria-label') ||
        control.textContent;

      if (this.normalizeText(value)) {
        return value;
      }
    }

    const combobox = element.matches('[role="combobox"], button[role="combobox"]')
      ? element
      : element.querySelector('[role="combobox"], button[role="combobox"]');

    if (combobox) {
      return combobox.getAttribute('title') ||
        combobox.getAttribute('aria-label') ||
        combobox.textContent;
    }

    return '';
  }

  cleanFieldValue(value, fieldName) {
    let text = this.normalizeText(value)
      .replace(/^Delete\s+/i, '')
      .replace(/^Locked\s+/i, '')
      .replace(/\s+Lookup results$/i, '')
      .replace(/\s+selected$/i, '');

    if (fieldName) {
      const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      text = text.replace(new RegExp(`^${escaped}\\s*:?\\s*`, 'i'), '');
    }

    return text === '---' ? '' : text;
  }

  extractTitleFromHeader() {
    const candidates = [
      '[data-id="formHeaderTitle"]',
      '[data-id*="header_title"] input',
      'h1[title]',
      'h1'
    ];

    for (const selector of candidates) {
      const element = document.querySelector(selector);
      const value = element ? this.normalizeText(element.getAttribute('title') || element.textContent || element.value) : '';
      if (value) {
        return value;
      }
    }

    return '';
  }

  findCaseNumberInPage() {
    const match = document.body.innerText.match(/\bCAS-[A-Z0-9]+-[A-Z0-9]+\b/i);
    return match ? match[0].toUpperCase() : '';
  }

  extractTimelineEntries(timeline) {
    return this.getTimelineRecords(timeline).map(record => this.extractTimelineEntry(record));
  }

  extractTimelineEntry(record) {
    const activityLabel = this.extractActivityLabel(record);
    const type = this.extractType(record, activityLabel);
    const direction = type === 'Email' ? this.extractDirection(record, activityLabel) : '';
    const attachmentFiles = this.extractAttachmentFiles(record);
    const activityIds = this.extractActivityIds(record);

    return {
      type,
      direction,
      activityIds,
      dateTime: this.extractDateTime(record),
      from: this.extractParty(record, ['from', 'sender', 'author', 'owner', 'createdby', 'modifiedby']),
      to: this.extractParty(record, ['to', 'recipient', 'recipients']),
      subject: this.extractSubject(record),
      body: this.extractBody(record),
      attachments: attachmentFiles.map(file => file.filename),
      attachmentFiles
    };
  }

  extractActivityLabel(record) {
    const labelled = Array.from(record.querySelectorAll('[aria-label], [title]'))
      .map(element => element.getAttribute('aria-label') || element.getAttribute('title') || '')
      .map(value => this.normalizeText(value))
      .find(value => /email|note|phone|task|appointment|activity|letter|fax/i.test(value) &&
        !/reply|open record|more commands|view more|load more/i.test(value));

    if (labelled) {
      return labelled;
    }

    const className = record.innerHTML;
    if (/EmailIncoming-symbol/i.test(className)) return 'Incoming Email';
    if (/EmailOutgoing-symbol/i.test(className)) return 'Outgoing Email';
    if (/Note-symbol/i.test(className)) return 'Note';
    if (/PhoneCall-symbol/i.test(className)) return 'Phone Call';
    return '';
  }

  extractType(record, activityLabel) {
    const header = record.querySelector('[data-id*="timeline_record_header_title"], [id*="timeline_record_header_title"]');
    const headerText = header ? this.normalizeText(header.textContent) : '';
    const label = headerText || activityLabel || record.closest('li')?.getAttribute('aria-label') || record.textContent || 'Activity';

    if (/phone/i.test(label)) return 'Phone Call';
    if (/email|EmailIncoming-symbol|EmailOutgoing-symbol/i.test(`${label} ${record.innerHTML}`)) return 'Email';
    if (/note/i.test(label)) return 'Note';
    if (/task/i.test(label)) return 'Task';
    if (/appointment/i.test(label)) return 'Appointment';
    if (/fax/i.test(label)) return 'Fax';
    if (/letter/i.test(label)) return 'Letter';

    return this.toTitleCase(label.replace(/^(received|sent|outgoing|incoming)\s+/i, '')) || 'Activity';
  }

  extractDirection(record, activityLabel) {
    const text = [
      activityLabel,
      record.closest('li')?.getAttribute('aria-label') || '',
      record.innerHTML.match(/EmailIncoming-symbol|EmailOutgoing-symbol/i)?.[0] || ''
    ].join(' ');

    if (/EmailIncoming|incoming|received/i.test(text)) return 'Inbound';
    if (/EmailOutgoing|outgoing|sent/i.test(text)) return 'Outbound';
    return '';
  }

  extractDateTime(record) {
    const exact = Array.from(record.querySelectorAll('[title], [aria-label]'))
      .map(element => element.getAttribute('title') || element.getAttribute('aria-label') || '')
      .map(value => this.normalizeText(value))
      .find(value => /actual end|modified on|created on|due|completed|sent|received|posted on/i.test(value) && /\d/.test(value));

    if (exact) {
      return exact.replace(/^(Actual end|Created on|Modified on|Due|Completed|Sent|Received|Posted on):\s*/i, '');
    }

    const dateFields = Array.from(record.querySelectorAll([
      '[id*="timeline_field_actualend"]',
      '[id*="timeline_field_createdon"]',
      '[id*="timeline_field_modifiedon"]',
      '[data-id*="timeline_field_actualend"]',
      '[data-id*="timeline_field_createdon"]'
    ].join(',')));

    for (const field of dateFields) {
      const value = this.normalizeText(field.textContent || field.getAttribute('title'));
      if (value && /\d/.test(value)) {
        return value;
      }
    }

    const text = this.normalizeText(record.textContent);
    const dateMatch = text.match(/\b(?:today|yesterday|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{2,4})\b(?:[, ]+\d{1,2}:\d{2}(?:\s?[AP]M)?)?/i);
    if (dateMatch) {
      return dateMatch[0];
    }

    const timeMatch = text.match(/\b\d{1,2}:\d{2}(?:\s?[AP]M)?\b/i);
    return timeMatch ? timeMatch[0] : '';
  }

  extractParty(record, names) {
    for (const name of names) {
      const field = Array.from(record.querySelectorAll([
        `[data-id*="timeline_field_${name}"]`,
        `[id*="timeline_field_${name}"]`,
        `[aria-label^="${name}:"]`
      ].join(',')))[0];
      const value = field ? this.extractPartyValue(field, name) : '';
      if (value) {
        return value;
      }
    }

    return '';
  }

  extractPartyValue(field, name) {
    const values = Array.from(field.querySelectorAll('[role="link"], a, [title], [aria-label]'))
      .map(element => element.getAttribute('title') || element.getAttribute('aria-label') || element.textContent)
      .map(value => this.cleanPartyValue(value, name))
      .filter(Boolean);

    if (values.length > 0) {
      return [...new Set(values)].join(', ');
    }

    return this.cleanPartyValue(field.textContent, name);
  }

  cleanPartyValue(value, name) {
    return this.normalizeText(value)
      .replace(new RegExp(`^${name}:?\\s*`, 'i'), '')
      .replace(/^Delete\s+/i, '')
      .replace(/\s+selected$/i, '');
  }

  extractSubject(record) {
    const selectors = [
      '[id^="timeline_record_title_text"]',
      '[data-id*="timeline_record_title_text"]',
      '[id^="timeline_field_subject"] label',
      '[data-id*="timeline_field_subject"] label'
    ];

    for (const selector of selectors) {
      const element = record.querySelector(selector);
      const text = element ? this.normalizeText(element.textContent || element.getAttribute('title')) : '';
      if (text) {
        return text;
      }
    }

    return '(No subject)';
  }

  extractBody(record) {
    const candidates = [
      '[data-id*="timeline_record_content_preview"]',
      '[id*="timeline_record_content_preview"]',
      '[id^="timeline_field_description"]',
      '[data-id*="timeline_field_description"]',
      '[data-id*="description"]',
      '[data-id*="body"]'
    ];

    for (const selector of candidates) {
      const element = record.querySelector(selector);
      const text = element ? this.getPlainText(element) : '';
      if (text) {
        return text;
      }
    }

    const iframeText = this.extractIframeText(record);
    if (iframeText) {
      return iframeText;
    }

    return '';
  }

  extractIframeText(record) {
    const iframes = Array.from(record.querySelectorAll('iframe'));
    for (const iframe of iframes) {
      try {
        const text = iframe.contentDocument?.body ? this.getPlainText(iframe.contentDocument.body) : '';
        if (text) {
          return text;
        }
      } catch (error) {
        console.debug('[TimelineExporter] Could not read iframe body:', error);
      }
    }

    return '';
  }

  extractAttachments(record) {
    return this.extractAttachmentFiles(record).map(file => file.filename);
  }

  extractActivityIds(record) {
    return this.extractEntityIdsFromElement(record)
      .filter(id => record.id?.toLowerCase().includes(id) || record.getAttribute('data-id')?.toLowerCase().includes(id));
  }

  extractAttachmentFiles(record) {
    const files = [];
    const addFile = (filename, url = '', source = '', entityIds = []) => {
      const cleanFilename = this.sanitizeAttachmentFilename(filename);
      if (!cleanFilename) {
        return;
      }

      const resolvedUrl = this.resolveDownloadUrl(url);
      const uniqueEntityIds = [...new Set(entityIds.filter(Boolean))];
      const key = `${cleanFilename.toLowerCase()}|${resolvedUrl}|${uniqueEntityIds.join(':')}`;
      if (files.some(file => file.key === key)) {
        return;
      }

      files.push({
        key,
        filename: cleanFilename,
        url: resolvedUrl,
        source,
        entityIds: uniqueEntityIds
      });
    };

    const attachmentElements = Array.from(record.querySelectorAll([
      '[data-id*="attachment"]',
      '[id*="attachment"]',
      '[aria-label*="attachment"]',
      '[title*="attachment"]',
      'a[download]'
    ].join(',')));

    for (const element of attachmentElements) {
      const name = this.extractFilenameFromElement(element);
      const url = this.extractDownloadUrlFromElement(element);
      const entityIds = this.extractEntityIdsFromElement(element);
      if (name) {
        addFile(name, url, 'attachment', entityIds);
      }
    }

    const inlineImages = this.extractInlineImages(record);
    inlineImages.forEach((image, index) => {
      const filename = image.filename || `inline-image-${String(index + 1).padStart(2, '0')}${this.getExtensionFromUrl(image.url) || '.png'}`;
      addFile(filename, image.url, 'inline-image');
    });

    const attachmentFiles = files.filter(file => file.entityIds.length > 0);
    this.extractCidFilenames(record.innerHTML).forEach(filename => {
      const matchingAttachment = attachmentFiles.find(file => file.filename.toLowerCase() === filename.toLowerCase());
      addFile(filename, '', 'cid', matchingAttachment?.entityIds || []);
    });

    return files.map(({ key, ...file }) => file);
  }

  extractFilenameFromElement(element) {
    const values = [
      element.getAttribute('download'),
      element.getAttribute('title'),
      element.getAttribute('aria-label'),
      element.getAttribute('alt'),
      element.textContent,
      element.querySelector('[download]')?.getAttribute('download'),
      element.querySelector('[title]')?.getAttribute('title'),
      element.querySelector('[aria-label]')?.getAttribute('aria-label'),
      element.querySelector('img')?.getAttribute('alt'),
      this.filenameFromUrl(this.extractDownloadUrlFromElement(element))
    ];

    return values
      .filter(Boolean)
      .flatMap(value => this.extractFilenamesFromText(value))
      .find(Boolean) || '';
  }

  extractDownloadUrlFromElement(element) {
    const candidate = element.matches('a[href], img[src], [src]')
      ? element
      : element.querySelector('a[href], img[src], [src]');

    return candidate?.getAttribute('href') || candidate?.getAttribute('src') || '';
  }

  extractEntityIdsFromElement(element) {
    const values = [
      element.id,
      element.getAttribute('data-id'),
      element.getAttribute('data-lp-id'),
      element.closest('[id]')?.id,
      element.closest('[data-id]')?.getAttribute('data-id')
    ].filter(Boolean);

    const guidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
    return [...new Set(values.flatMap(value => Array.from(String(value).matchAll(guidPattern), match => match[0].toLowerCase())))];
  }

  extractInlineImages(record) {
    const images = Array.from(record.querySelectorAll([
      '.image-inline img',
      '[data-id*="timeline_record_content"] img',
      '[id*="timeline_record_content"] img'
    ].join(',')));

    record.querySelectorAll('iframe').forEach(iframe => {
      try {
        iframe.contentDocument?.querySelectorAll('img').forEach(image => images.push(image));
      } catch (error) {
        console.debug('[TimelineExporter] Could not read iframe images:', error);
      }
    });

    return images
      .map(image => {
        const url = image.currentSrc || image.getAttribute('src') || '';
        return {
          url,
          filename: this.extractFilenameFromElement(image) || this.filenameFromUrl(url)
        };
      })
      .filter(image => image.url && this.isDownloadableImageUrl(image.url));
  }

  extractFilenamesFromText(value) {
    const text = this.decodeHtmlEntities(String(value || ''));
    const filenames = [];
    const genericMatches = text.matchAll(/(?:^|[\s"'(<\[])([A-Za-z0-9_ .()[\]&+,#'-]{1,120}\.(?:png|jpe?g|gif|bmp|webp|svg|pdf|docx?|xlsx?|pptx?|txt|csv|zip|rar|7z|xml|json|eml|msg))(?=$|[,;:\s"')>\]])/gi);

    for (const match of genericMatches) {
      filenames.push(match[1]);
    }

    return filenames
      .map(filename => filename.trim().replace(/^[,;:\s"'(<\[]+|[,;:\s"')>\]]+$/g, ''))
      .filter(filename => filename && !/^data\./i.test(filename));
  }

  extractCidFilenames(value) {
    const text = this.decodeHtmlEntities(String(value || ''));
    return Array.from(text.matchAll(/cid:([A-Za-z0-9_ .()[\]&+,#'-]+\.[A-Za-z0-9]{2,10})(?:@[^"'<>\s)]+)?/gi))
      .map(match => match[1])
      .map(filename => this.sanitizeAttachmentFilename(filename))
      .filter(Boolean);
  }

  decodeHtmlEntities(value) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = value;
    return textarea.value;
  }

  buildMarkdown(metadata, entries, imageList = [], filter = { type: 'all' }) {
    const dash = '\u2014';
    const lines = [
      `# ${this.escapeMarkdownInline(metadata.title)} ${dash} ${this.escapeMarkdownInline(metadata.caseNumber)}`,
      '',
      '## Metadata',
      '| Field | Value |',
      '|---|---|',
      `| Status | ${this.escapeTableValue(metadata.status)} |`,
      `| Priority | ${this.escapeTableValue(metadata.priority)} |`,
      `| Owner | ${this.escapeTableValue(metadata.owner)} |`,
      `| Contact | ${this.escapeTableValue(metadata.contact)} |`,
      `| Case Type | ${this.escapeTableValue(metadata.caseType)} |`,
      `| Origin | ${this.escapeTableValue(metadata.origin)} |`,
      `| Total Time Spent | ${this.escapeTableValue(metadata.totalTimeSpent)} |`,
      `| Last Updated | ${this.escapeTableValue(metadata.lastUpdated)} |`,
      `| Filter | ${this.escapeTableValue(filter.label || 'Alles')} |`,
      '',
      '## Timeline',
      ''
    ];

    if (entries.length === 0) {
      lines.push('_No timeline entries found._');
      lines.push('');
      return lines.join('\n');
    }

    entries.forEach(entry => {
      const headingParts = [entry.dateTime, entry.direction ? `${entry.type} (${entry.direction})` : entry.type, entry.subject]
        .filter(Boolean)
        .map(part => this.escapeMarkdownInline(part));

      lines.push(`### ${headingParts.join(` ${dash} `)}`);
      if (entry.from) lines.push(`**From:** ${this.escapeMarkdownInline(entry.from)}  `);
      if (entry.to) lines.push(`**To:** ${this.escapeMarkdownInline(entry.to)}  `);
      if (entry.attachmentFiles?.length) {
        const attachmentParts = entry.attachmentFiles.map(file => {
          const downloaded = imageList.find(img => img.filename.toLowerCase() === file.filename.toLowerCase());
          return downloaded
            ? `![${this.escapeMarkdownInline(file.filename)}](${downloaded.numberedName})`
            : this.escapeMarkdownInline(file.filename);
        });
        lines.push(`**Attachments:** ${attachmentParts.join(', ')}`);
      } else {
        lines.push('**Attachments:** None');
      }
      lines.push('');
      lines.push(this.escapeBodyText(entry.body) || '_No body text found._');
      lines.push('');
      lines.push('---');
      lines.push('');
    });

    return lines.join('\n');
  }

  buildImageDownloadList(entries) {
    const allImageFiles = entries.flatMap(entry =>
      (entry.attachmentFiles || [])
        .filter(file => (file.url || file.entityIds?.length) && this.isImageAttachmentFile(file))
        .filter(file => this.isLikelyCustomerScreenshot(file))
        .map(file => ({ ...file }))
    );

    const contentFingerprint = (file) => {
      if (file.dataUrl) {
        const base64Part = file.dataUrl.split(',')[1] || '';
        return `dataurl|${base64Part.length}|${base64Part.substring(0, 64)}`;
      }
      if (file.url) return `url|${file.url}`;
      return `ref|${file.filename}|${file.entityIds?.join(':')}`;
    };

    const uniqueByContent = [];
    const seenFingerprints = new Set();
    for (const file of allImageFiles) {
      const fp = contentFingerprint(file);
      if (!seenFingerprints.has(fp)) {
        seenFingerprints.add(fp);
        uniqueByContent.push(file);
      }
    }

    return uniqueByContent.map((file, index) => ({
      ...file,
      numberedName: `${String(index + 1).padStart(3, '0')}-${this.sanitizeAttachmentFilename(file.filename)}`
    }));
  }

  buildBaseFolder(metadata) {
    const caseNumber = this.sanitizeFilename(metadata.caseNumber || 'case');
    const title = this.sanitizeFilename(metadata.title || 'timeline');
    return `${caseNumber}-${title}`;
  }

  async downloadDebugLog(folder, metadata, exportError = null) {
    const header = [
      'StarBase Optimizer - Debug Log',
      `Export time : ${new Date().toISOString()}`,
      `URL         : ${window.location.href}`,
      metadata ? `Case        : ${metadata.caseNumber || '?'} — ${metadata.title || '?'}` : 'Case        : (export failed before metadata)',
      exportError ? `\n*** EXPORT ERROR ***\n${exportError.stack || exportError.message}` : '',
      '',
      '--- Console Output ---',
      ''
    ].filter(line => line !== undefined).join('\n');

    const content = header + this.logBuffer.join('\n');
    const baseName = folder || `starbase-debug-${Date.now()}`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const dataUrl = await this.blobToDataUrl(blob);
    await this.sendDownload(`${baseName}/${baseName}-debug.log`, dataUrl);
  }

  async downloadMarkdown(folder, metadata, markdown) {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const dataUrl = await this.blobToDataUrl(blob);
    await this.sendDownload(`${folder}/${folder}.md`, dataUrl);
  }

  sendDownload(filename, url) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'DOWNLOAD_FILE', filename, url }, response => {
        if (chrome.runtime.lastError) {
          console.warn('[TimelineExporter] Download failed:', chrome.runtime.lastError.message);
        }
        resolve(Boolean(response?.success));
      });
    });
  }

  async downloadTimelineImages(folder, imageList) {
    let downloaded = 0;
    for (const file of imageList) {
      const filename = `${folder}/${file.numberedName}`;
      const success = await this.downloadFile(filename, file);
      if (success) {
        downloaded++;
      }
      await this.sleep(100);
    }

    return {
      total: imageList.length,
      downloaded
    };
  }

  async downloadFile(filename, file) {
    const downloadableUrl = file.dataUrl || (file.url
      ? await this.prepareDownloadUrl(file.url)
      : await this.fetchDataverseAttachmentAsDataUrl(file));

    if (!downloadableUrl) {
      return false;
    }

    return this.sendDownload(filename, downloadableUrl);
  }

  async prepareDownloadUrl(url) {
    if (/^blob:/i.test(url)) {
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        return await this.blobToDataUrl(blob);
      } catch (error) {
        console.warn('[TimelineExporter] Could not read blob image:', error);
        return '';
      }
    }

    return url;
  }

  async fetchDataverseAttachmentAsDataUrl(file) {
    const entityIds = [...(file.entityIds || [])].reverse();
    for (const id of entityIds) {
      const activityMimeAttachment = await this.fetchDataverseAttachment(
        `activitymimeattachments(${id})`,
        'body',
        file.filename
      );
      if (activityMimeAttachment) {
        return activityMimeAttachment;
      }

      const annotation = await this.fetchDataverseAttachment(
        `annotations(${id})`,
        'documentbody',
        file.filename
      );
      if (annotation) {
        return annotation;
      }
    }

    return '';
  }

  async hydrateDataverseAttachments(entries) {
    const seenActivityIds = new Set();

    for (const entry of entries) {
      if (entry.type !== 'Email') {
        continue;
      }

      const activityIds = (entry.activityIds || []).filter(id => !seenActivityIds.has(id));
      activityIds.forEach(id => seenActivityIds.add(id));

      for (const activityId of activityIds) {
        const attachments = await this.fetchDataverseAttachmentsForActivity(activityId);
        for (const attachment of attachments) {
          if (!this.isImageAttachmentFile(attachment)) {
            continue;
          }

          const duplicate = entry.attachmentFiles.some(file =>
            file.filename.toLowerCase() === attachment.filename.toLowerCase() &&
            (file.dataUrl || file.url || file.entityIds?.join(':')) ===
              (attachment.dataUrl || attachment.url || attachment.entityIds?.join(':'))
          );

          if (!duplicate) {
            entry.attachmentFiles.push(attachment);
          }

          if (!entry.attachments.some(filename => filename.toLowerCase() === attachment.filename.toLowerCase())) {
            entry.attachments.push(attachment.filename);
          }
        }
      }
    }
  }

  async fetchDataverseAttachmentsForActivity(activityId) {
    const attachments = [];
    const queries = [
      {
        entitySet: 'activitymimeattachments',
        idField: 'activitymimeattachmentid',
        bodyField: 'body',
        select: 'activitymimeattachmentid,filename,mimetype,body'
      },
      {
        entitySet: 'annotations',
        idField: 'annotationid',
        bodyField: 'documentbody',
        select: 'annotationid,filename,mimetype,documentbody'
      }
    ];

    for (const query of queries) {
      for (const version of ['v9.2', 'v9.1', 'v9.0']) {
        try {
          const url = `${window.location.origin}/api/data/${version}/${query.entitySet}` +
            `?$select=${query.select}&$filter=_objectid_value eq ${activityId}`;
          const response = await fetch(url, {
            credentials: 'include',
            headers: {
              Accept: 'application/json',
              'OData-MaxVersion': '4.0',
              'OData-Version': '4.0'
            }
          });

          if (!response.ok) {
            continue;
          }

          const data = await response.json();
          for (const item of data.value || []) {
            const filename = this.sanitizeAttachmentFilename(item.filename || '');
            const body = item[query.bodyField];
            const mimeType = item.mimetype || this.mimeTypeFromFilename(filename);

            if (!filename || !body || !/^image\//i.test(mimeType)) {
              continue;
            }

            const candidate = {
              filename,
              url: '',
              dataUrl: `data:${mimeType};base64,${body}`,
              source: 'dataverse-activity',
              entityIds: [item[query.idField]].filter(Boolean)
            };

            if (!this.isLikelyCustomerScreenshot(candidate)) {
              console.debug('[TimelineExporter] Skipping non-screenshot attachment:', filename);
              continue;
            }

            attachments.push(candidate);
          }

          break;
        } catch (error) {
          console.debug('[TimelineExporter] Dataverse activity attachment query failed:', query.entitySet, activityId, error);
        }
      }
    }

    return attachments;
  }

  async fetchDataverseAttachment(entityPath, bodyField, expectedFilename) {
    const select = bodyField === 'body'
      ? 'filename,mimetype,body'
      : 'filename,mimetype,documentbody';

    for (const version of ['v9.2', 'v9.1', 'v9.0']) {
      try {
        const response = await fetch(`${window.location.origin}/api/data/${version}/${entityPath}?$select=${select}`, {
          credentials: 'include',
          headers: {
            Accept: 'application/json',
            'OData-MaxVersion': '4.0',
            'OData-Version': '4.0'
          }
        });

        if (!response.ok) {
          continue;
        }

        const data = await response.json();
        const base64Body = data?.[bodyField];
        if (!base64Body) {
          continue;
        }

        const returnedFilename = this.sanitizeAttachmentFilename(data.filename || '');
        if (returnedFilename &&
            expectedFilename &&
            returnedFilename.toLowerCase() !== expectedFilename.toLowerCase()) {
          continue;
        }

        const mimeType = data.mimetype || this.mimeTypeFromFilename(expectedFilename || returnedFilename);
        if (!/^image\//i.test(mimeType)) {
          continue;
        }

        return `data:${mimeType};base64,${base64Body}`;
      } catch (error) {
        console.debug('[TimelineExporter] Dataverse attachment fetch failed:', entityPath, error);
      }
    }

    return '';
  }

  blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  resolveDownloadUrl(value) {
    const url = String(value || '').trim();
    if (!url || /^(cid:|mailto:|javascript:|#)/i.test(url)) {
      return '';
    }

    if (/^(data:|blob:|https?:)/i.test(url)) {
      return url;
    }

    try {
      return new URL(url, window.location.href).href;
    } catch (error) {
      return '';
    }
  }

  isDownloadableImageUrl(value) {
    const url = String(value || '').trim();
    return /^data:image\//i.test(url) ||
      /^blob:/i.test(url) ||
      /^https?:/i.test(url);
  }

  isImageAttachmentFile(file) {
    const filename = String(file?.filename || '');
    const url = String(file?.url || '');
    return file?.source === 'inline-image' ||
      /\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(filename) ||
      /^data:image\//i.test(url);
  }

  isLikelyCustomerScreenshot(file) {
    const filename = String(file?.filename || '').toLowerCase();
    const source = String(file?.source || '');

    const logoPatterns = /\b(logo|icon|brand|banner|badge|avatar|favicon|header[-_]?img|footer[-_]?img|spacer|pixel|tracking|sig[-_]?img|signature[-_]?img|email[-_]?sig|e[-_]?sign)\b/i;
    if (logoPatterns.test(filename)) return false;

    const commonLogoNames = [
      'image001.png', 'image002.png', 'image003.png', 'image004.png', 'image005.png',
      'image001.jpg', 'image002.jpg', 'image003.jpg', 'image004.jpg', 'image005.jpg'
    ];
    if (commonLogoNames.includes(filename)) return false;

    if (/^inline-image-0[1-2]\./i.test(filename)) return false;

    if (/^image\d{6,}\./i.test(filename)) return false;

    if (/^(cid[-_])/.test(filename) && source === 'cid') return false;

    if (file?.dataUrl) {
      const base64Part = file.dataUrl.split(',')[1] || '';
      const estimatedBytes = Math.floor(base64Part.length * 0.75);
      if (estimatedBytes < 5000) return false;
    }

    return true;
  }

  filenameFromUrl(value) {
    const url = String(value || '').trim();
    if (!url || /^(data:|blob:)/i.test(url)) {
      return '';
    }

    try {
      const pathname = new URL(url, window.location.href).pathname;
      return decodeURIComponent(pathname.split('/').filter(Boolean).pop() || '');
    } catch (error) {
      return '';
    }
  }

  getExtensionFromUrl(value) {
    const filename = this.filenameFromUrl(value);
    const match = filename.match(/\.(png|jpe?g|gif|bmp|webp|svg)$/i);
    return match ? match[0].toLowerCase() : '';
  }

  mimeTypeFromFilename(value) {
    const extension = String(value || '').split('.').pop()?.toLowerCase();
    const types = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      bmp: 'image/bmp',
      webp: 'image/webp',
      svg: 'image/svg+xml'
    };

    return types[extension] || 'application/octet-stream';
  }

  getPlainText(element) {
    const clone = element.cloneNode(true);
    clone.querySelectorAll('script, style, svg, button, [role="button"]').forEach(node => node.remove());
    clone.querySelectorAll('br').forEach(br => br.replaceWith(document.createTextNode('\n')));
    clone.querySelectorAll('p, div, li, tr, h1, h2, h3, h4, h5, h6, blockquote').forEach(node => {
      node.appendChild(document.createTextNode('\n'));
    });

    return this.normalizeMultiline(clone.textContent);
  }

  normalizeText(value) {
    return String(value || '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  normalizeMultiline(value) {
    return String(value || '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\u00A0/g, ' ')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  escapeTableValue(value) {
    const text = this.escapeMarkdownInline(value || '');
    return text.replace(/\|/g, '\\|').replace(/\n/g, '<br>');
  }

  escapeMarkdownInline(value) {
    return this.normalizeText(value).replace(/\\/g, '\\\\').replace(/`/g, '\\`');
  }

  escapeBodyText(value) {
    return this.normalizeMultiline(value).replace(/```/g, '\\`\\`\\`');
  }

  sanitizeFilename(value) {
    return this.normalizeText(value)
      .replace(/[<>:"/\\|?*]+/g, '-')
      .replace(/\s+/g, ' ')
      .replace(/\.+$/g, '')
      .slice(0, 120) || 'timeline';
  }

  sanitizeAttachmentFilename(value) {
    const filename = this.normalizeText(value)
      .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '-')
      .replace(/\s+/g, ' ')
      .replace(/\.+$/g, '')
      .slice(0, 160);

    return /\.[A-Za-z0-9]{2,10}$/.test(filename) ? filename : '';
  }

  toTitleCase(value) {
    return this.normalizeText(value).replace(/\w\S*/g, word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
  }

  isVisible(element) {
    if (!element || !(element instanceof Element)) {
      return false;
    }

    const style = window.getComputedStyle(element);
    return style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      (element.offsetParent !== null || style.position === 'fixed');
  }

  destroy() {
    if (this.injectTimer) {
      clearTimeout(this.injectTimer);
      this.injectTimer = null;
    }

    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }

    if (this.observerId) {
      domObserver.disconnect(this.observerId);
      this.observerId = null;
    }

    document.getElementById(this.commandItemId)?.remove();
    document.getElementById(this.buttonId)?.remove();
    super.destroy();
    console.log('[TimelineExporter] Handler destroyed');
  }
}

if (typeof moduleRegistry !== 'undefined') {
  moduleRegistry.register({
    id: 'timelineExporter',
    name: 'Timeline Markdown Exporter',
    description: 'Exports the full case timeline to a Markdown file',
    handler: new TimelineExporterHandler(),
    enabled: true
  });

  console.log('[TimelineExporter] Module registered with registry');
} else {
  console.error('[TimelineExporter] Module registry not available - module not registered');
}
