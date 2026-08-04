// ROI-Optimized Staff Engineer Handbook Modules (00 to 15)
const modules = [
  { id: '00-start-here', title: 'START HERE (30 Min Essentials)', prob: '95%', time: '30m', diff: 'Easy', nightMode: true },
  { id: '01-high-probability-questions', title: '95% Probability Questions', prob: '95%', time: '45m', diff: 'Medium', nightMode: true },
  { id: '02-repository-explorer', title: 'Repository Explorer', prob: '95%', time: '40m', diff: 'Hard', nightMode: false },
  { id: '03-execution-flow', title: 'End-to-End Execution Flow', prob: '95%', time: '30m', diff: 'Medium', nightMode: false },
  { id: '04-architecture-deep-dive', title: 'Architecture Deep Dive', prob: '95%', time: '35m', diff: 'Hard', nightMode: false },
  { id: '05-code-deep-dive', title: 'Code Deep Dive (Crucial Lines)', prob: '80%', time: '40m', diff: 'Hard', nightMode: false },
  { id: '06-production-thinking', title: 'Production Thinking & Scaling', prob: '80%', time: '35m', diff: 'Hard', nightMode: false },
  { id: '07-tech-stack-encyclopedia', title: 'Tech Stack Encyclopedia', prob: '80%', time: '30m', diff: 'Medium', nightMode: false },
  { id: '08-interview-questions', title: 'Interview Question Bank', prob: '80%', time: '40m', diff: 'Medium', nightMode: false },
  { id: '09-live-modifications', title: 'Live Modifications Guide', prob: '80%', time: '25m', diff: 'Hard', nightMode: false },
  { id: '10-staff-engineer-notes', title: 'Staff Engineer Voluntary Notes', prob: '80%', time: '20m', diff: 'Medium', nightMode: false },
  { id: '11-outbox-factcheck', title: 'Outbox Fact-Check (Local Backup)', prob: '95%', time: '10m', diff: 'Medium', nightMode: true },
  { id: '11-cheat-sheet', title: 'Master Cheat Sheet', prob: '95%', time: '15m', diff: 'Easy', nightMode: true },
  { id: '12-rapid-review', title: 'Rapid Review (Night Before)', prob: '95%', time: '15m', diff: 'Easy', nightMode: true },
  { id: '13-appendix', title: 'Appendix & CS Fundamentals', prob: '10%', time: '20m', diff: 'Easy', nightMode: false },
  { id: '14-code-navigation', title: '📂 Code Navigation (Explain This File)', prob: '95%', time: '45m', diff: 'Hard', nightMode: true }
];

// The 11 Core Repository Files for Code Navigation Mode
const coreFiles = [
  { name: 'ConversationManager.ts', anchor: 'conversationmanager-ts' },
  { name: 'server.ts', anchor: 'server-ts' },
  { name: 'gemini.ts', anchor: 'gemini-ts' },
  { name: 'extractClaimData.ts', anchor: 'extractclaimdata-ts' },
  { name: 'verifyPolicy.ts', anchor: 'verifypolicy-ts' },
  { name: 'claimLogger.ts', anchor: 'claimlogger-ts' },
  { name: 'googleSheets.ts', anchor: 'googlesheets-ts' },
  { name: 'notificationService.ts', anchor: 'notificationservice-ts' },
  { name: 'runtime.ts', anchor: 'runtime-ts' },
  { name: 'ConversationState.ts', anchor: 'conversationstate-ts' },
  { name: 'types.ts', anchor: 'types-ts' }
];

// Dictionary of acronyms for automated tooltips
const acronyms = {
  'FSM': 'Finite State Machine: Deterministic state engine governing conversation steps.',
  'TTFT': 'Time-To-First-Token: Latency from prompt end to first generated LLM token.',
  'SSE': 'Server-Sent Events: Monodirectional HTTP streaming protocol used by Gemini API.',
  'STT': 'Speech-to-Text: Audio transcription engine (managed by Retell AI).',
  'TTS': 'Text-to-Speech: Voice audio synthesis engine (managed by Retell AI).',
  'AHT': 'Average Handle Time: Key insurance metric measuring call duration.',
  'FNOL': 'First Notice of Loss: Initial reporting of an insurance claim after an incident.',
  'VAD': 'Voice Activity Detection: Detects when a caller starts or stops speaking.',
  'DI': 'Dependency Injection: Decoupling components by passing services into constructors.',
  'P95': '95th Percentile: Latency threshold where 95% of calls perform faster.',
  'WebRTC': 'Web Real-Time Communication: Peer-to-peer audio streaming standard.'
};

let nightBeforeMode = false;

// Configure Marked renderer extension for alerts, hotspots, recaps
marked.use({
  renderer: {
    blockquote(token) {
      const rawText = typeof token === 'string' ? token : (token.text || token.raw || '');
      
      const hotspotMatch = rawText.match(/\[!HOTSPOT\]/i);
      const recapMatch = rawText.match(/\[!RECAP\]/i);
      const alertMatch = rawText.match(/\[!(NOTE|IMPORTANT|WARNING|TIP|CAUTION)\]/i);

      // Clean lines: strip leading '>' and callout tags
      const cleanMarkdown = rawText
        .replace(/^\s*>\s?/gm, '')
        .replace(/\[!(HOTSPOT|RECAP|NOTE|IMPORTANT|WARNING|TIP|CAUTION)\]/gi, '')
        .trim();

      const innerHtml = marked.parse(cleanMarkdown);

      if (hotspotMatch) {
        return `
          <div class="hotspot-box">
            <div class="hotspot-title">🔥 Interview Hotspots</div>
            <div class="hotspot-body">${innerHtml}</div>
          </div>
        `;
      }

      if (recapMatch) {
        return `
          <div class="recap-box">
            <div class="recap-title">🧠 30-Second Recap: 5 Things to Remember</div>
            <div class="recap-body">${innerHtml}</div>
          </div>
        `;
      }

      if (alertMatch) {
        const type = alertMatch[1].toLowerCase();
        let cssClass = 'alert-note';
        let icon = 'ℹ️';
        if (type === 'important') { cssClass = 'alert-important'; icon = '⭐'; }
        if (type === 'warning' || type === 'caution') { cssClass = 'alert-warning'; icon = '⚠️'; }
        if (type === 'tip') { cssClass = 'alert-note'; icon = '💡'; }

        return `
          <div class="alert ${cssClass}">
            <div class="alert-title"><span>${icon}</span><span>${type.toUpperCase()}</span></div>
            <div class="alert-body">${innerHtml}</div>
          </div>
        `;
      }
      return `<blockquote>${innerHtml}</blockquote>`;
    }
  }
});

// Helper function to apply acronym tooltips to text nodes safely
function applyAcronymTooltips(container) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
  const nodesToReplace = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const parentTag = node.parentElement ? node.parentElement.tagName : '';
    if (!['SCRIPT', 'STYLE', 'ABBR', 'CODE', 'PRE', 'A'].includes(parentTag)) {
      let text = node.nodeValue;
      let matched = false;
      Object.keys(acronyms).forEach(acr => {
        if (new RegExp(`\\b${acr}\\b`).test(text)) {
          matched = true;
        }
      });
      if (matched) {
        nodesToReplace.push(node);
      }
    }
  }

  nodesToReplace.forEach(node => {
    let html = node.nodeValue;
    Object.keys(acronyms).forEach(acr => {
      const regex = new RegExp(`\\b(${acr})\\b`, 'g');
      html = html.replace(regex, `<abbr title="${acronyms[acr]}">$1</abbr>`);
    });
    const span = document.createElement('span');
    span.innerHTML = html;
    node.parentNode.replaceChild(span, node);
  });
}

// DOM Elements
const navContainer = document.getElementById('nav-container');
const contentDiv = document.getElementById('content');
const searchInput = document.getElementById('search-input');
const sidebar = document.getElementById('sidebar');
const menuBtn = document.getElementById('menu-btn');
const nightModeBtn = document.getElementById('night-mode-btn');
const nightModeBtnMobile = document.getElementById('night-mode-btn-mobile');
const modeBanner = document.getElementById('mode-banner');

// Render Navigation with Badges, Night Before Filter, & File Shortcuts
function renderNav() {
  const visibleModules = nightBeforeMode ? modules.filter(m => m.nightMode) : modules;
  
  let html = `
    <div class="nav-section">
      <div class="nav-section-title">${nightBeforeMode ? 'Night-Before High-Yield Modules' : 'Staff Curriculum'}</div>
  `;
  
  visibleModules.forEach(mod => {
    const badgeClass = `badge-${mod.prob.replace('%', '')}`;
    html += `
      <a href="#${mod.id}" class="nav-link" data-id="${mod.id}">
        <span>${mod.id.split('-')[0]}. ${mod.title}</span>
        <span class="nav-badge ${badgeClass}">${mod.prob}</span>
      </a>
    `;
  });
  
  html += `</div>`;
  
  // Add "Explain This File" Section
  html += `
    <div class="nav-section" style="margin-top: 16px;">
      <div class="nav-section-title">⚡ Explain This File (Code Nav)</div>
  `;
  
  coreFiles.forEach(file => {
    html += `
      <a href="#14-code-navigation?file=${file.anchor}" class="nav-link file-nav-link" data-file="${file.anchor}">
        <span>📄 ${file.name}</span>
      </a>
    `;
  });
  
  html += `</div>`;
  
  navContainer.innerHTML = html;
}

// Toggle Night Before Mode
function toggleNightMode() {
  nightBeforeMode = !nightBeforeMode;
  nightModeBtn.classList.toggle('active', nightBeforeMode);
  if (nightModeBtnMobile) nightModeBtnMobile.classList.toggle('active', nightBeforeMode);
  if (modeBanner) modeBanner.classList.toggle('hidden', !nightBeforeMode);
  renderNav();
}

if (nightModeBtn) nightModeBtn.addEventListener('click', toggleNightMode);
if (nightModeBtnMobile) nightModeBtnMobile.addEventListener('click', toggleNightMode);

// Update Active Link
function updateActiveLink(id, fileAnchor) {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
    if (fileAnchor && link.dataset.file === fileAnchor) {
      link.classList.add('active');
    } else if (!fileAnchor && link.dataset.id === id) {
      link.classList.add('active');
    }
  });
}

// Load Content & Handle File Jump Anchors
async function loadContent(id, fileAnchor) {
  contentDiv.innerHTML = '<div class="loading">Loading Chapter Content...</div>';
  updateActiveLink(id, fileAnchor);
  
  const modMeta = modules.find(m => m.id === id);
  
  try {
    const response = await fetch(`content/${id}.md`);
    if (!response.ok) throw new Error(`Failed to load ${id}.md`);
    
    let markdown = await response.text();
    
    // Inject Metadata Chips below H1 header
    let metaChipsHtml = '';
    if (modMeta) {
      const probClass = `prob-${modMeta.prob.replace('%', '')}`;
      metaChipsHtml = `<div class="module-meta-bar"><span class="meta-chip ${probClass}">🎯 ${modMeta.prob} Probability</span><span class="meta-chip time">⏱️ Est. ${modMeta.time}</span><span class="meta-chip diff">🧠 ${modMeta.diff}</span></div>`;
    }
    
    markdown = markdown.replace(/(#\s+.*?\n)/, `$1\n${metaChipsHtml}\n\n`);
    
    const html = marked.parse(markdown);
    contentDiv.innerHTML = html;
    
    // Apply acronym tooltips safely to text nodes
    applyAcronymTooltips(contentDiv);
    
    Prism.highlightAllUnder(contentDiv);
    
    // Scroll to specific file anchor if present
    if (fileAnchor) {
      setTimeout(() => {
        const el = document.getElementById(fileAnchor);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          window.scrollTo(0, 0);
        }
      }, 100);
    } else {
      window.scrollTo(0, 0);
    }
    
    sidebar.classList.remove('open');
    
  } catch (error) {
    contentDiv.innerHTML = `
      <div class="alert alert-warning">
        <div class="alert-title">Chapter Content Loading</div>
        <p>The module <code>${id}.md</code> is unavailable. Please select another module.</p>
      </div>
    `;
  }
}

// Search Engine
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    document.querySelectorAll('.nav-link').forEach(link => {
      const text = link.textContent.toLowerCase();
      link.style.display = text.includes(query) ? 'flex' : 'none';
    });
  });
}

if (menuBtn) menuBtn.addEventListener('click', () => sidebar.classList.toggle('open'));

function handleRoute() {
  const fullHash = window.location.hash.substring(1);
  const parts = fullHash.split('?file=');
  let id = parts[0];
  const fileAnchor = parts[1] || null;
  
  if (!id || !modules.find(m => m.id === id)) {
    id = modules[0].id;
    window.location.hash = id;
  }
  loadContent(id, fileAnchor);
}

window.addEventListener('hashchange', handleRoute);

renderNav();
handleRoute();
