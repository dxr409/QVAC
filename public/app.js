/**
 * Tether QVAC — AI Client
 *
 * Features:
 *  - File memory: per-session persistent (files survive until user removes them)
 *  - OCR: sends base64 image/PDF data to /v1/ocr; injected into every turn's system context
 *  - STT: Web Speech API (SpeechRecognition) — real-time, zero server overhead
 *  - TTS: Web Speech API (speechSynthesis) — clean markdown stripping, browser-native
 *  - Multi-backend selector & health check in Settings
 */

(function () {
  'use strict';

  const defaultApi =
    window.location.protocol === 'http:' || window.location.protocol === 'https:'
      ? window.location.origin
      : 'http://127.0.0.1:8085';

  const MAX_FILE_CHARS = 24000; // ~6k tokens — guard against localStorage overflow

  // ── State ──────────────────────────────────────────────────────────────────
  const state = {
    apiBase: defaultApi,
    activeModel: 'Nora',
    backendType: 'auto',
    customLlmUrl: '',
    activeProviderName: 'Nora',
    userName: 'Lyazzat',
    systemPrompt:
      'You are Nora, an intelligent, helpful AI assistant running locally. Answer clearly, accurately, and concisely.',
    sessions: [],
    activeSessionId: null,
    isGenerating: false,
    isListening: false,
    recognition: null, // SpeechRecognition instance
    ttsUtterance: null, // Current SpeechSynthesisUtterance
    abortController: null
  };

  // ── DOM Elements ───────────────────────────────────────────────────────────
  const elements = {
    mainContent: document.getElementById('mainContent'),
    sidebar: document.getElementById('sidebar'),
    toggleSidebarBtn: document.getElementById('toggleSidebarBtn'),
    openSidebarBtn: document.getElementById('openSidebarBtn'),
    newChatBtn: document.getElementById('newChatBtn'),
    sessionsList: document.getElementById('sessionsList'),
    nodeStatusText: document.getElementById('nodeStatusText'),
    activeModelName: document.getElementById('activeModelName'),
    clearChatBtn: document.getElementById('clearChatBtn'),

    chatFeed: document.getElementById('chatFeed'),
    chatInput: document.getElementById('chatInput'),
    sendBtn: document.getElementById('sendBtn'),
    attachFileBtn: document.getElementById('attachFileBtn'),
    fileHiddenInput: document.getElementById('fileHiddenInput'),
    micBtn: document.getElementById('micBtn'),
    recordingBar: document.getElementById('recordingBar'),
    stopRecBtn: document.getElementById('stopRecBtn'),
    attachmentStrip: document.getElementById('attachmentStrip'),

    // Mini Logo Popover elements
    miniLogoBtn: document.getElementById('miniLogoBtn'),
    miniLogoPopover: document.getElementById('miniLogoPopover'),
    menuAttachDocBtn: document.getElementById('menuAttachDocBtn'),
    menuAttachImgBtn: document.getElementById('menuAttachImgBtn'),
    menuMicBtn: document.getElementById('menuMicBtn'),
    menuMicIconBox: document.getElementById('menuMicIconBox'),
    menuMicTitle: document.getElementById('menuMicTitle'),
    menuMicDesc: document.getElementById('menuMicDesc'),

    settingsModal: document.getElementById('settingsModal'),
    openSettingsBtn: document.getElementById('openSettingsBtn'),
    closeSettingsBtn: document.getElementById('closeSettingsBtn'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn'),
    cfgApiBase: document.getElementById('cfgApiBase'),
    cfgBackend: document.getElementById('cfgBackend'),
    customLlmRow: document.getElementById('customLlmRow'),
    cfgCustomLlm: document.getElementById('cfgCustomLlm'),
    cfgUserName: document.getElementById('cfgUserName'),
    checkConnBtn: document.getElementById('checkConnBtn'),
    connStatusText: document.getElementById('connStatusText'),
    systemPromptInput: document.getElementById('systemPromptInput'),
    toastContainer: document.getElementById('toastContainer'),

    // Nora Companion & Voice Assistant elements
    noraCompanionDock: document.getElementById('noraCompanionDock'),
    noraCompanionBtn: document.getElementById('noraCompanionBtn'),
    noraSpeechCloud: document.getElementById('noraSpeechCloud'),
    noraShadowPuddle: document.getElementById('noraShadowPuddle'),
    noraSparkles: document.getElementById('noraSparkles'),
    noraClickShockwave: document.getElementById('noraClickShockwave'),
    noraBtnAvatar: document.getElementById('noraBtnAvatar'),
    noraBtnFaceFeatures: document.getElementById('noraBtnFaceFeatures'),
    noraBtnEyeL: document.getElementById('noraBtnEyeL'),
    noraBtnEyeR: document.getElementById('noraBtnEyeR'),
    noraBtnMouth: document.getElementById('noraBtnMouth'),

    noraVoiceOverlay: document.getElementById('noraVoiceOverlay'),
    noraVoiceCloseBtn: document.getElementById('noraVoiceCloseBtn'),
    noraVoiceBackChatBtn: document.getElementById('noraVoiceBackChatBtn'),
    noraVoiceMicBtn: document.getElementById('noraVoiceMicBtn'),
    noraVoiceTtsBtn: document.getElementById('noraVoiceTtsBtn'),
    noraVoiceTtsIcon: document.getElementById('noraVoiceTtsIcon'),
    noraVoiceTtsLabel: document.getElementById('noraVoiceTtsLabel'),
    noraVoiceStatusText: document.getElementById('noraVoiceStatusText'),
    noraFullscreenAvatar: document.getElementById('noraFullscreenAvatar'),
    noraFsFaceFeatures: document.getElementById('noraFsFaceFeatures'),
    noraFsEyeL: document.getElementById('noraFsEyeL'),
    noraFsEyeR: document.getElementById('noraFsEyeR'),
    noraFsMouth: document.getElementById('noraFsMouth'),
    noraSoundWave: document.getElementById('noraSoundWave'),
    noraVoiceUserBubble: document.getElementById('noraVoiceUserBubble'),
    noraVoiceUserText: document.getElementById('noraVoiceUserText'),
    noraVoiceBotBubble: document.getElementById('noraVoiceBotBubble'),
    noraVoiceBotText: document.getElementById('noraVoiceBotText')
  };

  // ══════════════════════════════════════════════════════════════════════════
  // INIT
  // ══════════════════════════════════════════════════════════════════════════

  function init() {
    loadSettings();
    initSessions();
    setupEventListeners();
    initSpeechRecognition();
    initNoraCompanion();
    checkHealth();
    setInterval(checkHealth, 12000);
  }

  function loadSettings() {
    const savedApi = localStorage.getItem('qvac_api_base');
    if (savedApi) state.apiBase = savedApi;

    const savedBackend = localStorage.getItem('qvac_backend');
    if (savedBackend) state.backendType = savedBackend;

    const savedCustomLlm = localStorage.getItem('qvac_custom_llm');
    if (savedCustomLlm) state.customLlmUrl = savedCustomLlm;

    const savedPrompt = localStorage.getItem('qvac_system_prompt');
    if (savedPrompt) state.systemPrompt = savedPrompt;

    const savedUser = localStorage.getItem('qvac_user_name');
    if (savedUser) state.userName = savedUser;

    if (elements.cfgApiBase) elements.cfgApiBase.value = state.apiBase;
    if (elements.cfgBackend) elements.cfgBackend.value = state.backendType;
    if (elements.cfgCustomLlm) elements.cfgCustomLlm.value = state.customLlmUrl;
    if (elements.customLlmRow) {
      elements.customLlmRow.style.display = state.backendType === 'custom' ? 'block' : 'none';
    }
    if (elements.systemPromptInput) elements.systemPromptInput.value = state.systemPrompt;
    if (elements.cfgUserName) elements.cfgUserName.value = state.userName;
  }

  function saveSettings() {
    state.apiBase = elements.cfgApiBase ? elements.cfgApiBase.value.trim().replace(/\/+$/, '') || defaultApi : defaultApi;
    state.backendType = elements.cfgBackend ? elements.cfgBackend.value : 'auto';
    state.customLlmUrl = elements.cfgCustomLlm ? elements.cfgCustomLlm.value.trim() : '';
    state.systemPrompt = elements.systemPromptInput ? elements.systemPromptInput.value.trim() : state.systemPrompt;

    if (elements.cfgUserName) {
      state.userName = elements.cfgUserName.value.trim() || 'Lyazzat';
      localStorage.setItem('qvac_user_name', state.userName);
    }

    localStorage.setItem('qvac_api_base', state.apiBase);
    localStorage.setItem('qvac_backend', state.backendType);
    localStorage.setItem('qvac_custom_llm', state.customLlmUrl);
    localStorage.setItem('qvac_system_prompt', state.systemPrompt);

    const session = getActiveSession();
    if (session && session.messages[0]) {
      session.messages[0].content = state.systemPrompt;
    }
    saveSessions();

    if (elements.settingsModal) elements.settingsModal.classList.remove('open');
    showToast('Settings saved');
    checkHealth();
    renderChat();
  }

  async function checkHealth() {
    const statusDot = document.querySelector('.status-dot');
    try {
      const res = await fetch(`${state.apiBase}/v1/engine/status`, { signal: AbortSignal.timeout(3500) });
      if (res.ok) {
        const data = await res.json();
        const onlineBackends = data.backends ? data.backends.filter(b => b.isOnline) : [];
        const external = onlineBackends.find(b => b.type !== 'native');

        if (external) {
          state.activeProviderName = 'Nora';
          if (elements.activeModelName) elements.activeModelName.textContent = 'Nora';
          if (elements.nodeStatusText) elements.nodeStatusText.textContent = `Подключено: ${external.name}`;
          if (statusDot) statusDot.className = 'status-dot';
        } else {
          state.activeProviderName = 'Nora';
          if (elements.activeModelName) elements.activeModelName.textContent = 'Nora';
          if (elements.nodeStatusText) elements.nodeStatusText.textContent = 'Локальный узел активен';
          if (statusDot) statusDot.className = 'status-dot';
        }
      } else {
        const fallbackRes = await fetch(`${state.apiBase}/health`, { signal: AbortSignal.timeout(2000) });
        if (fallbackRes.ok && elements.nodeStatusText) {
          elements.nodeStatusText.textContent = 'Локальный сервер активен';
          if (statusDot) statusDot.className = 'status-dot';
        }
      }
    } catch {
      if (elements.nodeStatusText) {
        elements.nodeStatusText.textContent = 'Модель в режиме ожидания';
      }
      if (statusDot) {
        statusDot.className = 'status-dot standby';
      }
    }
  }

  async function testBackendConnection() {
    if (!elements.connStatusText) return;
    elements.connStatusText.textContent = 'Testing connection...';
    elements.connStatusText.style.color = 'var(--text-muted)';

    try {
      const res = await fetch(`${state.apiBase}/v1/engine/status`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = await res.json();
        const online = data.backends ? data.backends.filter(b => b.isOnline) : [];
        const ext = online.find(b => b.type !== 'native');
        if (ext) {
          elements.connStatusText.textContent = `🟢 Found: ${ext.name}`;
          elements.connStatusText.style.color = '#34d399';
        } else {
          elements.connStatusText.textContent = `⚡ QVAC Native Engine (${data.hardware || 'CPU'})`;
          elements.connStatusText.style.color = 'var(--accent)';
        }
      } else {
        elements.connStatusText.textContent = '⚠️ Server responded with error';
        elements.connStatusText.style.color = '#f59e0b';
      }
    } catch (err) {
      elements.connStatusText.textContent = '❌ Failed to connect to server';
      elements.connStatusText.style.color = '#ef4444';
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SESSIONS
  // ══════════════════════════════════════════════════════════════════════════

  function initSessions() {
    try {
      const stored = localStorage.getItem('qvac_sessions');
      if (stored) state.sessions = JSON.parse(stored);
    } catch {
      state.sessions = [];
    }

    // Migrate old sessions that lack attachedFiles
    state.sessions.forEach(s => {
      if (!Array.isArray(s.attachedFiles)) s.attachedFiles = [];
    });

    if (state.sessions.length === 0) {
      createNewSession();
    } else {
      state.activeSessionId = state.sessions[0].id;
      renderSessionsList();
      renderChat();
      renderAttachments();
    }
  }

  function saveSessions() {
    localStorage.setItem('qvac_sessions', JSON.stringify(state.sessions));
    renderSessionsList();
  }

  function getActiveSession() {
    return state.sessions.find(s => s.id === state.activeSessionId) || state.sessions[0];
  }

  function createNewSession() {
    const newSession = {
      id: 'session-' + Date.now(),
      title: 'New chat',
      messages: [{ role: 'system', content: state.systemPrompt }],
      attachedFiles: [] // ← persistent per-session file store
    };
    state.sessions.unshift(newSession);
    state.activeSessionId = newSession.id;
    saveSessions();
    renderChat();
    renderAttachments();
  }

  function switchSession(id) {
    state.activeSessionId = id;
    renderSessionsList();
    renderChat();
    renderAttachments();
  }

  function deleteSession(id, e) {
    if (e) e.stopPropagation();
    state.sessions = state.sessions.filter(s => s.id !== id);
    if (state.sessions.length === 0) {
      createNewSession();
    } else {
      state.activeSessionId = state.sessions[0].id;
      saveSessions();
      renderChat();
      renderAttachments();
    }
  }

  function renderSessionsList() {
    if (!elements.sessionsList) return;
    elements.sessionsList.innerHTML = '';
    state.sessions.forEach(s => {
      const item = document.createElement('div');
      item.className = `session-item ${s.id === state.activeSessionId ? 'active' : ''}`;
      item.onclick = () => switchSession(s.id);

      const title = document.createElement('span');
      title.className = 'session-title';
      title.textContent = s.title;

      const del = document.createElement('button');
      del.className = 'session-del-btn';
      del.innerHTML = '✕';
      del.onclick = e => deleteSession(s.id, e);

      item.appendChild(title);
      item.appendChild(del);
      elements.sessionsList.appendChild(item);
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CHAT RENDERING
  // ══════════════════════════════════════════════════════════════════════════

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderChat() {
    if (!elements.chatFeed) return;
    elements.chatFeed.innerHTML = '';

    const session = getActiveSession();
    const visible = session.messages.filter(m => m.role !== 'system');

    if (visible.length === 0) {
      if (elements.mainContent) elements.mainContent.classList.add('welcome-centered-mode');
      elements.chatFeed.appendChild(renderWelcomeScreen());
      return;
    }

    if (elements.mainContent) elements.mainContent.classList.remove('welcome-centered-mode');

    visible.forEach(msg => {
      elements.chatFeed.appendChild(createMessageRow(msg.role, msg.content));
    });

    scrollToBottom();
  }

  function renderWelcomeScreen() {
    const wrap = document.createElement('div');
    wrap.className = 'gemini-welcome-container';
    const userName = state.userName || 'Lyazzat';

    wrap.innerHTML = `
      <div class="gemini-hero-mascot-dock">
        <div class="gemini-hero-shadow-puddle" id="geminiHeroPuddle"></div>
        <div class="gemini-hero-energy-rings">
          <div class="energy-ring ring-1"></div>
          <div class="energy-ring ring-2"></div>
        </div>
        <button type="button" class="gemini-hero-mascot-btn" id="geminiHeroMascotBtn" title="Нажмите для вызова голосового ассистента Nora" aria-label="Nora 3D Ассистент">
          <div class="gemini-mascot-avatar-3d" id="geminiHeroAvatar">
            <div class="nora-3d-stage" id="geminiHero3dStage">
              <div class="nora-3d-glow-halo hero"></div>
              <img src="/nora-3d.png" class="nora-3d-img hero" id="geminiHero3dImg" alt="Nora 3D Assistant">
            </div>
          </div>
        </button>
      </div>

      <div class="gemini-greeting-block">
        <h1 class="gemini-greeting-title">Hello, <span class="gemini-gradient-text">${escapeHtml(userName)}</span></h1>
        <p class="gemini-greeting-sub">Чем я могу помочь вам сегодня?</p>
      </div>
    `;

    const heroBtn = wrap.querySelector('#geminiHeroMascotBtn');
    const heroStage = wrap.querySelector('#geminiHero3dStage');
    if (heroBtn) {
      heroBtn.addEventListener('click', e => {
        e.stopPropagation();
        handleHeroMascotClick(heroBtn, heroStage);
      });
    }

    return wrap;
  }

  function handleHeroMascotClick(heroBtn, heroStage) {
    if (voiceState.isJumping || voiceState.isOpen) return;
    voiceState.isJumping = true;

    if (heroBtn) heroBtn.classList.add('jumping');

    setTimeout(() => {
      openVoiceMode();
      setTimeout(() => {
        if (heroBtn) heroBtn.classList.remove('jumping');
        voiceState.isJumping = false;
      }, 450);
    }, 320);
  }

  function createMessageRow(role, content) {
    const row = document.createElement('div');
    row.className = `message-row ${role}`;

    if (role === 'assistant') {
      const header = document.createElement('div');
      header.className = 'msg-header';
      header.innerHTML = `
        <span class="msg-author-badge">
          <img src="/nora-avatar-3d.png" class="msg-author-avatar-3d" alt="Nora">
          Nora
        </span>
      `;
      row.appendChild(header);
    }

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerHTML = renderMarkdown(content);
    row.appendChild(bubble);

    return row;
  }

  function renderMarkdown(text) {
    if (!text) return '';
    let out = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Code blocks
    out = out.replace(/```([a-zA-Z0-9_\-]+)?\n([\s\S]*?)```/g, (match, lang, code) => {
      const id = 'code-' + Math.random().toString(36).substring(2, 7);
      return `
        <div class="code-box">
          <div class="code-top">
            <span>${lang || 'code'}</span>
            <button class="copy-btn" onclick="window.qvac.copyCode('${id}', this)">Copy</button>
          </div>
          <pre><code id="${id}">${code.trim()}</code></pre>
        </div>
      `;
    });

    out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    out = out.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    out = out.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    out = out.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    out = out.replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>');
    out = out.replace(/^\s*[-*]\s+(.*$)/gim, '<li>$1</li>');
    out = out.replace(/(<li>.*<\/li>)/gims, '<ul>$1</ul>');
    out = out.replace(/\n\n/g, '</p><p>');
    out = '<p>' + out + '</p>';
    out = out.replace(/<p><\/p>/g, '');
    return out;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SEND MESSAGE  (with persistent file context injection)
  // ══════════════════════════════════════════════════════════════════════════

  async function sendMessage(overrideText) {
    const text = overrideText || elements.chatInput.value.trim();
    if (!text || state.isGenerating) return;

    const session = getActiveSession();

    // Build messages array with file context block injected as a system message
    let messagesForApi = [...session.messages];

    if (session.attachedFiles && session.attachedFiles.length > 0) {
      const fileContext = session.attachedFiles
        .map(f => `[File "${f.name}"]:\n${f.content}`)
        .join('\n\n---\n\n');

      const fileContextMsg = {
        role: 'system',
        content: `[Attached Files — use these as your knowledge base to answer questions]\n\n${fileContext}`
      };

      const existingCtxIdx = messagesForApi.findIndex(
        m => m.role === 'system' && m.content.startsWith('[Attached Files')
      );
      if (existingCtxIdx !== -1) {
        messagesForApi[existingCtxIdx] = fileContextMsg;
      } else {
        messagesForApi.splice(1, 0, fileContextMsg);
      }
    }

    // Push the user message into session history
    session.messages.push({ role: 'user', content: text });
    if (session.messages.filter(m => m.role === 'user').length === 1) {
      session.title = text.slice(0, 26) + (text.length > 26 ? '…' : '');
    }
    saveSessions();

    if (!overrideText) {
      elements.chatInput.value = '';
      elements.chatInput.style.height = 'auto';
    }

    renderChat();

    // Streaming placeholder
    state.isGenerating = true;
    elements.sendBtn.disabled = true;

    const streamRow = document.createElement('div');
    streamRow.className = 'message-row assistant';
    streamRow.innerHTML = `
      <div class="bubble" id="streamingBubble">
        <span class="typing-cursor"></span>
      </div>
    `;
    elements.chatFeed.appendChild(streamRow);
    scrollToBottom();

    const bubbleEl = streamRow.querySelector('#streamingBubble');
    let accumulated = '';

    messagesForApi.push({ role: 'user', content: text });

    try {
      state.abortController = new AbortController();

      const requestBody = {
        model: state.activeModel,
        messages: messagesForApi,
        stream: true
      };

      if (state.backendType === 'custom' && state.customLlmUrl) {
        requestBody.baseUrl = state.customLlmUrl;
      } else if (state.backendType === 'ollama') {
        requestBody.baseUrl = 'http://127.0.0.1:11434/v1';
      } else if (state.backendType === 'lmstudio') {
        requestBody.baseUrl = 'http://127.0.0.1:1234/v1';
      }

      const res = await fetch(`${state.apiBase}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: state.abortController.signal,
        body: JSON.stringify(requestBody)
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              const delta =
                data.choices?.[0]?.delta?.content ??
                data.choices?.[0]?.delta?.reasoning_content ??
                '';
              accumulated += delta;
              bubbleEl.innerHTML =
                renderMarkdown(accumulated) + '<span class="typing-cursor"></span>';
              scrollToBottom();
            } catch {}
          }
        }
      }

      session.messages.push({ role: 'assistant', content: accumulated });
      saveSessions();
      renderChat();
    } catch (err) {
      const isConnectionFail =
        err.name === 'TypeError' ||
        err.message.includes('fetch') ||
        err.message.includes('Failed to fetch') ||
        err.message.includes('abort');
      const fallback =
        accumulated ||
        (isConnectionFail
          ? `💡 **Локальная модель в режиме ожидания**\n\nСервер интерфейса Nora работает в штатном режиме, но локальная нейросеть (Ollama, LM Studio или локальный движок) сейчас не запущена на вашем ноутбуке.\n\nЗапустите вашу модель, и чат сразу продолжит работу.`
          : `⚠️ Ошибка соединения (${err.message}). Проверьте статус локального сервера.`);
      session.messages.push({ role: 'assistant', content: fallback });
      saveSessions();
      renderChat();
    } finally {
      state.isGenerating = false;
      elements.sendBtn.disabled = false;
      scrollToBottom();
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FILE ATTACHMENTS  (OCR for images/PDFs, text extraction for docs)
  // ══════════════════════════════════════════════════════════════════════════

  async function handleFileUpload(file) {
    if (!file) return;

    const session = getActiveSession();

    if (file.type === 'application/pdf' || file.type.startsWith('image/')) {
      showToast(`Extracting text from "${file.name}"…`);
      const reader = new FileReader();
      reader.onload = async e => {
        try {
          const res = await fetch(`${state.apiBase}/v1/ocr`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileData: e.target.result, fileName: file.name })
          });
          const data = await res.json();
          const extracted = data.extractedText || 'No text extracted';

          if (extracted.startsWith('[QVAC OCR]') || data.confidence < 0.4) {
            showToast(`⚠️ ${extracted.replace('[QVAC OCR] ', '')}`);
            return;
          }

          const truncated =
            extracted.length > MAX_FILE_CHARS
              ? extracted.slice(0, MAX_FILE_CHARS) + '\n\n[...truncated at 24 000 chars]'
              : extracted;

          addFileToSession(session, `📄 ${file.name}`, truncated);
          showToast(`"${file.name}" added — ${truncated.length.toLocaleString()} chars extracted`);
        } catch (err) {
          showToast(`Could not read "${file.name}": ${err.message}`);
        }
      };
      reader.readAsDataURL(file);
    } else {
      showToast(`Reading "${file.name}"…`);
      const reader = new FileReader();
      reader.onload = e => {
        const text = e.target.result;
        const truncated =
          text.length > MAX_FILE_CHARS
            ? text.slice(0, MAX_FILE_CHARS) + '\n\n[...truncated]'
            : text;
        addFileToSession(session, `📎 ${file.name}`, truncated);
        showToast(`"${file.name}" attached (${truncated.length.toLocaleString()} chars)`);
      };
      reader.readAsText(file);
    }

    if (elements.fileHiddenInput) elements.fileHiddenInput.value = '';
  }

  function addFileToSession(session, name, content) {
    if (!Array.isArray(session.attachedFiles)) session.attachedFiles = [];
    const existing = session.attachedFiles.findIndex(f => f.name === name);
    if (existing !== -1) {
      session.attachedFiles[existing] = { name, content };
    } else {
      session.attachedFiles.push({ name, content });
    }
    saveSessions();
    renderAttachments();
  }

  function renderAttachments() {
    if (!elements.attachmentStrip) return;
    elements.attachmentStrip.innerHTML = '';

    const session = getActiveSession();
    if (!session || !session.attachedFiles || session.attachedFiles.length === 0) return;

    session.attachedFiles.forEach((f, idx) => {
      const tag = document.createElement('div');
      tag.className = 'attach-tag';
      tag.innerHTML = `
        <span title="${f.content.slice(0, 120).replace(/"/g, '&quot;')}">${f.name}</span>
        <button onclick="window.qvac.removeAttach(${idx})" title="Remove file">✕</button>
      `;
      elements.attachmentStrip.appendChild(tag);
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STT — Web Speech API (SpeechRecognition)
  // ══════════════════════════════════════════════════════════════════════════

  function initSpeechRecognition() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      if (elements.micBtn) {
        elements.micBtn.disabled = true;
        elements.micBtn.title = 'Speech recognition not supported — use Chrome or Edge';
      }
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      state.isListening = true;
      if (elements.micBtn) elements.micBtn.classList.add('recording');
      if (elements.menuMicIconBox) elements.menuMicIconBox.classList.add('recording');
      if (elements.menuMicTitle) elements.menuMicTitle.textContent = 'Идет запись...';
      if (elements.recordingBar) {
        elements.recordingBar.style.display = 'flex';
        const label = elements.recordingBar.querySelector('.recording-label') || elements.recordingBar.querySelector('span');
        if (label) label.textContent = '🎙️ Идет запись голоса... Говорите в микрофон';
      }
    };

    recognition.onresult = e => {
      let interimText = '';
      let finalText = '';

      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          finalText += transcript;
        } else {
          interimText += transcript;
        }
      }

      if (elements.chatInput) {
        elements.chatInput.value = finalText || interimText;
      }

      if (elements.recordingBar) {
        const label = elements.recordingBar.querySelector('.recording-label') || elements.recordingBar.querySelector('span');
        if (label) label.textContent = `🎙️ ${interimText || finalText || 'Слушаю…'}`;
      }
    };

    recognition.onerror = e => {
      console.error('[STT] Error:', e.error);
      if (e.error === 'not-allowed') {
        showToast('Microphone access denied — check browser permissions');
      } else if (e.error !== 'aborted') {
        showToast(`STT error: ${e.error}`);
      }
      stopListening();
    };

    recognition.onend = () => {
      stopListening();
      if (elements.chatInput) elements.chatInput.focus();
    };

    state.recognition = recognition;
  }

  function toggleRecording() {
    if (!state.recognition) {
      showToast('Speech recognition not supported — use Chrome or Edge');
      return;
    }

    if (!state.isListening) {
      try {
        state.recognition.start();
      } catch (e) {
        // Already started — ignore
      }
    } else {
      state.recognition.stop();
    }
  }

  function stopListening() {
    state.isListening = false;
    if (elements.micBtn) elements.micBtn.classList.remove('recording');
    if (elements.menuMicIconBox) elements.menuMicIconBox.classList.remove('recording');
    if (elements.menuMicTitle) elements.menuMicTitle.textContent = 'Голосовой ввод';
    if (elements.recordingBar) elements.recordingBar.style.display = 'none';
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TTS — Web Speech API (speechSynthesis)
  // ══════════════════════════════════════════════════════════════════════════

  function speakText(text, btn) {
    if (!('speechSynthesis' in window)) {
      showToast('Text-to-speech not supported in this browser');
      return;
    }

    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      if (btn) btn.innerHTML = '🔊 Speak';
      state.ttsUtterance = null;
      return;
    }

    const clean = text
      .replace(/```[\s\S]*?```/g, '') // remove code blocks
      .replace(/`[^`]+`/g, '')
      .replace(/[#*_\[\]]/g, '')
      .replace(/\n+/g, ' ')
      .trim();

    if (!clean) return;

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = 'en-US';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onstart = () => {
      if (btn) btn.innerHTML = '🔊 Speaking… (click to stop)';
    };
    utterance.onend = () => {
      if (btn) btn.innerHTML = '🔊 Speak';
      state.ttsUtterance = null;
    };
    utterance.onerror = () => {
      if (btn) btn.innerHTML = '🔊 Speak';
      state.ttsUtterance = null;
    };

    state.ttsUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  function copyText(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Copied');
      if (btn) {
        const old = btn.innerHTML;
        btn.innerHTML = '✓ Copied';
        setTimeout(() => { btn.innerHTML = old; }, 1400);
      }
    });
  }

  function scrollToBottom() {
    if (elements.chatFeed) elements.chatFeed.scrollTop = elements.chatFeed.scrollHeight;
  }

  function showToast(msg) {
    if (!elements.toastContainer) return;
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    elements.toastContainer.appendChild(t);
    setTimeout(() => t.remove(), 2800);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EVENT LISTENERS
  // ══════════════════════════════════════════════════════════════════════════

  function setupEventListeners() {
    if (elements.toggleSidebarBtn && elements.sidebar) {
      elements.toggleSidebarBtn.onclick = () => {
        elements.sidebar.classList.add('closed');
        if (elements.openSidebarBtn) elements.openSidebarBtn.style.display = 'block';
      };
    }
    if (elements.openSidebarBtn && elements.sidebar) {
      elements.openSidebarBtn.onclick = () => {
        elements.sidebar.classList.remove('closed');
        elements.openSidebarBtn.style.display = 'none';
      };
    }

    if (elements.newChatBtn) elements.newChatBtn.onclick = createNewSession;
    if (elements.clearChatBtn) {
      elements.clearChatBtn.onclick = () => {
        const s = getActiveSession();
        s.messages = [s.messages[0]];
        // NOTE: attached files are NOT cleared when chat history is cleared —
        // user must explicitly remove them via ✕ buttons.
        saveSessions();
        renderChat();
        showToast('Chat history cleared (files kept)');
      };
    }

    if (elements.sendBtn) elements.sendBtn.onclick = () => sendMessage();
    if (elements.chatInput) {
      elements.chatInput.oninput = () => {
        elements.chatInput.style.height = 'auto';
        elements.chatInput.style.height =
          Math.min(elements.chatInput.scrollHeight, 160) + 'px';
      };
      elements.chatInput.onkeydown = e => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      };
    }

    // ── Mini Logo Action Menu & Popover ──
    function toggleMiniLogoPopover(open) {
      if (!elements.miniLogoPopover) return;
      const shouldOpen =
        typeof open === 'boolean'
          ? open
          : !elements.miniLogoPopover.classList.contains('open');

      if (shouldOpen) {
        elements.miniLogoPopover.classList.add('open');
        if (elements.miniLogoBtn) elements.miniLogoBtn.setAttribute('aria-expanded', 'true');
      } else {
        elements.miniLogoPopover.classList.remove('open');
        if (elements.miniLogoBtn) elements.miniLogoBtn.setAttribute('aria-expanded', 'false');
      }
    }

    if (elements.miniLogoBtn) {
      elements.miniLogoBtn.onclick = e => {
        e.stopPropagation();
        toggleMiniLogoPopover();
      };
    }

    // Закрытие меню при клике вне его области
    document.addEventListener('click', e => {
      if (elements.miniLogoPopover && elements.miniLogoPopover.classList.contains('open')) {
        if (!elements.miniLogoPopover.contains(e.target) && (!elements.miniLogoBtn || !elements.miniLogoBtn.contains(e.target))) {
          toggleMiniLogoPopover(false);
        }
      }
    });

    // Закрытие по клавише Escape
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && elements.miniLogoPopover && elements.miniLogoPopover.classList.contains('open')) {
        toggleMiniLogoPopover(false);
      }
    });

    // Пункт меню: Прикрепить документ
    if (elements.menuAttachDocBtn && elements.fileHiddenInput) {
      elements.menuAttachDocBtn.onclick = () => {
        toggleMiniLogoPopover(false);
        elements.fileHiddenInput.accept = '.pdf,.txt,.md,.json,.csv,.doc,.docx';
        elements.fileHiddenInput.click();
      };
    }

    // Пункт меню: Распознать фото / скан (OCR)
    if (elements.menuAttachImgBtn && elements.fileHiddenInput) {
      elements.menuAttachImgBtn.onclick = () => {
        toggleMiniLogoPopover(false);
        elements.fileHiddenInput.accept = 'image/*,.pdf';
        elements.fileHiddenInput.click();
      };
    }

    // Пункт меню: Голосовой ввод
    if (elements.menuMicBtn) {
      elements.menuMicBtn.onclick = () => {
        toggleMiniLogoPopover(false);
        toggleRecording();
      };
    }

    // Кнопка остановки записи на полоске
    if (elements.stopRecBtn) {
      elements.stopRecBtn.onclick = () => stopListening();
    }

    // Обработка выбора файла
    if (elements.fileHiddenInput) {
      elements.fileHiddenInput.onchange = e => handleFileUpload(e.target.files[0]);
    }

    if (elements.attachFileBtn && elements.fileHiddenInput) {
      elements.attachFileBtn.onclick = () => elements.fileHiddenInput.click();
    }

    if (elements.micBtn) elements.micBtn.onclick = toggleRecording;

    if (elements.openSettingsBtn)
      elements.openSettingsBtn.onclick = () => elements.settingsModal.classList.add('open');
    if (elements.closeSettingsBtn)
      elements.closeSettingsBtn.onclick = () => elements.settingsModal.classList.remove('open');
    if (elements.saveSettingsBtn) elements.saveSettingsBtn.onclick = saveSettings;

    if (elements.cfgBackend) {
      elements.cfgBackend.onchange = () => {
        if (elements.customLlmRow) {
          elements.customLlmRow.style.display = elements.cfgBackend.value === 'custom' ? 'block' : 'none';
        }
      };
    }

    if (elements.checkConnBtn) {
      elements.checkConnBtn.onclick = testBackendConnection;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // NORA COMPANION & FULL-SCREEN VOICE ASSISTANT ENGINE
  // ══════════════════════════════════════════════════════════════════════════

  const voiceState = {
    isOpen: false,
    isListening: false,
    isSpeaking: false,
    isThinking: false,
    isJumping: false,
    ttsEnabled: true,
    recognition: null,
    currentUtterance: null
  };

  // Physics-based gaze & 3D parallax tracking variables
  let currentEyeX = 0, currentEyeY = 0;
  let targetEyeX = 0, targetEyeY = 0;
  let currentFaceX = 0, currentFaceY = 0;
  let targetFaceX = 0, targetFaceY = 0;
  let currentTilt = 0, targetTilt = 0;
  let currentScale = 1.0, targetScale = 1.0;
  let saccadeOffsetX = 0, saccadeOffsetY = 0;

  // Hero Mascot (Gemini welcome screen) tracking variables
  // 3D Physics-based gaze & levitation tracking variables
  let currentHeroRotX = 0, targetHeroRotX = 0;
  let currentHeroRotY = 0, targetHeroRotY = 0;
  let currentHeroRotZ = 0, targetHeroRotZ = 0;
  let currentHeroScale = 1.0, targetHeroScale = 1.0;
  let currentHeroFloatY = 0, targetHeroFloatY = 0;

  let currentDockRotX = 0, targetDockRotX = 0;
  let currentDockRotY = 0, targetDockRotY = 0;
  let currentDockScale = 1.0, targetDockScale = 1.0;

  let currentFsRotX = 0, targetFsRotX = 0;
  let currentFsRotY = 0, targetFsRotY = 0;

  function initNoraCompanion() {
    initVoiceRecognition();
    setupEyeTracking();
    setupVoiceOverlayEvents();
  }

  function setupEyeTracking() {
    window.addEventListener('mousemove', e => {
      calculateGazeTargets(e.clientX, e.clientY);
    });

    window.addEventListener('touchmove', e => {
      if (e.touches && e.touches[0]) {
        calculateGazeTargets(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    // 60fps continuous smooth 3D physics easing loop
    requestAnimationFrame(gazePhysicsLoop);
  }

  function calculateGazeTargets(mouseX, mouseY) {
    const ww = window.innerWidth || 1200;
    const wh = window.innerHeight || 800;

    // 1. Hero Mascot (Gemini welcome screen)
    const heroBtn = document.getElementById('geminiHeroMascotBtn');
    if (heroBtn) {
      const rect = heroBtn.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = mouseX - centerX;
      const dy = mouseY - centerY;
      const dist = Math.hypot(dx, dy);

      // True 3D perspective rotation towards cursor
      targetHeroRotY = Math.max(-26, Math.min(26, (dx / (ww * 0.42)) * 26));
      targetHeroRotX = Math.max(-20, Math.min(20, -(dy / (wh * 0.42)) * 20));
      targetHeroRotZ = Math.max(-5, Math.min(5, (dx / ww) * 6));

      // Proximity perk-up when mouse is near
      const prox = 420;
      if (dist < prox) {
        const factor = 1 - dist / prox;
        targetHeroScale = 1.0 + factor * 0.12;
        targetHeroFloatY = -factor * 10;
      } else {
        targetHeroScale = 1.0;
        targetHeroFloatY = 0;
      }
    }

    // 2. Docked companion button
    if (elements.noraCompanionBtn) {
      const rect = elements.noraCompanionBtn.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = mouseX - centerX;
      const dy = mouseY - centerY;
      const dist = Math.hypot(dx, dy);

      targetDockRotY = Math.max(-24, Math.min(24, (dx / (ww * 0.38)) * 24));
      targetDockRotX = Math.max(-18, Math.min(18, -(dy / (wh * 0.38)) * 18));

      const prox = 320;
      if (dist < prox) {
        const factor = 1 - dist / prox;
        targetDockScale = 1.0 + factor * 0.15;
      } else {
        targetDockScale = 1.0;
      }
    }

    // 3. Fullscreen voice avatar
    if (voiceState.isOpen) {
      const dx = mouseX - (ww / 2);
      const dy = mouseY - (wh * 0.4);
      targetFsRotY = Math.max(-18, Math.min(18, (dx / (ww * 0.4)) * 18));
      targetFsRotX = Math.max(-14, Math.min(14, -(dy / (wh * 0.4)) * 14));
    }
  }

  function gazePhysicsLoop() {
    const lerp = 0.12;
    const now = performance.now();
    const floatBob = Math.sin(now * 0.0024) * 6.5;
    const floatTilt = Math.sin(now * 0.0016) * 1.8;

    // 1. Hero Mascot 3D tracking
    const heroBtn = document.getElementById('geminiHeroMascotBtn');
    const heroStage = document.getElementById('geminiHero3dStage');
    const heroPuddle = document.getElementById('geminiHeroPuddle');

    if (heroBtn && heroStage) {
      currentHeroRotX += (targetHeroRotX - currentHeroRotX) * lerp;
      currentHeroRotY += (targetHeroRotY - currentHeroRotY) * lerp;
      currentHeroRotZ += (targetHeroRotZ - currentHeroRotZ) * lerp;
      currentHeroScale += (targetHeroScale - currentHeroScale) * lerp;
      currentHeroFloatY += (targetHeroFloatY - currentHeroFloatY) * lerp;

      if (!heroBtn.classList.contains('jumping')) {
        heroStage.style.transform = `perspective(750px) translateY(${currentHeroFloatY + floatBob}px) rotateX(${currentHeroRotX}deg) rotateY(${currentHeroRotY}deg) rotateZ(${currentHeroRotZ + floatTilt}deg) scale3d(${currentHeroScale}, ${currentHeroScale}, 1)`;
      }

      if (heroPuddle) {
        const pScale = (1.0 - (floatBob / 45)) * currentHeroScale;
        heroPuddle.style.transform = `translateX(-50%) scale(${pScale})`;
        heroPuddle.style.opacity = `${0.65 + (floatBob / 35)}`;
      }
    }

    // 2. Docked companion button
    const dockAvatar = elements.noraBtnAvatar;
    if (dockAvatar && !voiceState.isJumping) {
      currentDockRotX += (targetDockRotX - currentDockRotX) * lerp;
      currentDockRotY += (targetDockRotY - currentDockRotY) * lerp;
      currentDockScale += (targetDockScale - currentDockScale) * lerp;

      dockAvatar.style.transform = `perspective(600px) translateY(${floatBob * 0.6}px) rotateX(${currentDockRotX}deg) rotateY(${currentDockRotY}deg) scale3d(${currentDockScale}, ${currentDockScale}, 1)`;
    }

    // 3. Fullscreen voice assistant avatar
    if (voiceState.isOpen) {
      const fsStage = document.getElementById('noraFs3dStage');
      if (fsStage) {
        currentFsRotX += (targetFsRotX - currentFsRotX) * lerp;
        currentFsRotY += (targetFsRotY - currentFsRotY) * lerp;

        const voicePulse = voiceState.isSpeaking ? Math.sin(now * 0.009) * 5 : (voiceState.isListening ? Math.sin(now * 0.005) * 3 : 0);
        fsStage.style.transform = `perspective(850px) translateY(${floatBob * 1.2 + voicePulse}px) rotateX(${currentFsRotX}deg) rotateY(${currentFsRotY}deg) scale3d(${1.0 + (voicePulse ? 0.03 : 0)}, ${1.0 + (voicePulse ? 0.03 : 0)}, 1)`;
      }
    }

    requestAnimationFrame(gazePhysicsLoop);
  }



  function initVoiceRecognition() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('[Nora Voice] SpeechRecognition not supported in this browser.');
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = navigator.language && navigator.language.startsWith('ru') ? 'ru-RU' : (navigator.language || 'ru-RU');

    rec.onstart = () => {
      voiceState.isListening = true;
      updateVoiceUiState('listening');
    };

    rec.onresult = e => {
      let interim = '';
      let final = '';

      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }

      const spokenText = (final || interim).trim();
      if (spokenText && elements.noraVoiceUserBubble && elements.noraVoiceUserText) {
        elements.noraVoiceUserBubble.style.display = 'flex';
        elements.noraVoiceUserText.textContent = spokenText;
      }

      if (final && final.trim()) {
        rec.stop();
        handleVoiceUserMessage(final.trim());
      }
    };

    rec.onerror = e => {
      console.warn('[Nora Voice] Recognition error:', e.error);
      voiceState.isListening = false;
      if (e.error === 'not-allowed') {
        updateVoiceStatusText('Доступ к микрофону заблокирован в браузере');
      } else if (e.error !== 'aborted' && e.error !== 'no-speech') {
        updateVoiceStatusText(`Ошибка микрофона: ${e.error}`);
      }
      updateVoiceUiState('idle');
    };

    rec.onend = () => {
      voiceState.isListening = false;
      if (!voiceState.isThinking && !voiceState.isSpeaking && voiceState.isOpen) {
        updateVoiceUiState('idle');
      }
    };

    voiceState.recognition = rec;
  }

  function updateVoiceUiState(mode) {
    if (!elements.noraVoiceOverlay) return;

    elements.noraVoiceOverlay.classList.remove('listening', 'thinking', 'speaking');
    if (elements.noraFullscreenAvatar) {
      elements.noraFullscreenAvatar.classList.remove('speaking');
    }

    if (mode === 'listening') {
      elements.noraVoiceOverlay.classList.add('listening');
      updateVoiceStatusText('Слушаю вас... Говорите');
    } else if (mode === 'thinking') {
      elements.noraVoiceOverlay.classList.add('thinking');
      updateVoiceStatusText('Думаю над ответом...');
    } else if (mode === 'speaking') {
      elements.noraVoiceOverlay.classList.add('speaking');
      if (elements.noraFullscreenAvatar) elements.noraFullscreenAvatar.classList.add('speaking');
      updateVoiceStatusText('Nora отвечает...');
    } else {
      updateVoiceStatusText('Готова к диалогу — нажмите на микрофон');
    }
  }

  function updateVoiceStatusText(txt) {
    if (elements.noraVoiceStatusText) {
      elements.noraVoiceStatusText.textContent = txt;
    }
  }

  function openVoiceMode() {
    if (!elements.noraVoiceOverlay) return;

    voiceState.isOpen = true;
    elements.noraVoiceOverlay.style.display = 'flex';

    requestAnimationFrame(() => {
      elements.noraVoiceOverlay.classList.add('active');
    });

    if (elements.noraVoiceBotText && (!elements.noraVoiceUserText || !elements.noraVoiceUserText.textContent || elements.noraVoiceUserText.textContent === '...')) {
      elements.noraVoiceBotText.textContent = 'Привет! Я слушаю вас. Задайте любой вопрос или скажите что-нибудь.';
    }

    startVoiceListening();
  }

  function closeVoiceMode() {
    if (!elements.noraVoiceOverlay) return;

    voiceState.isOpen = false;
    stopVoiceListening();

    if (window.speechSynthesis && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }
    voiceState.isSpeaking = false;
    voiceState.isThinking = false;

    elements.noraVoiceOverlay.classList.remove('active', 'listening', 'thinking', 'speaking');
    if (elements.noraFullscreenAvatar) {
      elements.noraFullscreenAvatar.classList.remove('speaking');
    }

    setTimeout(() => {
      if (!voiceState.isOpen) {
        elements.noraVoiceOverlay.style.display = 'none';
      }
    }, 360);

    if (elements.chatInput) elements.chatInput.focus();
  }

  function startVoiceListening() {
    if (!voiceState.recognition) {
      showToast('Голосовой ввод не поддерживается браузером (рекомендуется Chrome, Edge или Safari)');
      updateVoiceStatusText('Браузер не поддерживает Web Speech API');
      return;
    }

    if (window.speechSynthesis && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      voiceState.isSpeaking = false;
    }

    try {
      voiceState.recognition.start();
    } catch (e) {
      // If already started, ignore
    }
  }

  function stopVoiceListening() {
    if (voiceState.recognition && voiceState.isListening) {
      try {
        voiceState.recognition.stop();
      } catch (e) {}
    }
    voiceState.isListening = false;
    updateVoiceUiState('idle');
  }

  function toggleVoiceMic() {
    if (voiceState.isListening) {
      stopVoiceListening();
    } else {
      startVoiceListening();
    }
  }

  async function handleVoiceUserMessage(userText) {
    if (!userText || voiceState.isThinking) return;

    voiceState.isThinking = true;
    updateVoiceUiState('thinking');

    if (elements.noraVoiceUserBubble && elements.noraVoiceUserText) {
      elements.noraVoiceUserBubble.style.display = 'flex';
      elements.noraVoiceUserText.textContent = userText;
    }

    if (elements.noraVoiceBotText) {
      elements.noraVoiceBotText.innerHTML = '<span class="typing-cursor"></span>';
    }

    const session = getActiveSession();
    session.messages.push({ role: 'user', content: userText });
    if (session.messages.filter(m => m.role === 'user').length === 1) {
      session.title = userText.slice(0, 26) + (userText.length > 26 ? '…' : '');
    }
    saveSessions();
    renderChat();

    let messagesForApi = [...session.messages];
    if (session.attachedFiles && session.attachedFiles.length > 0) {
      const fileContext = session.attachedFiles
        .map(f => `[File "${f.name}"]:\n${f.content}`)
        .join('\n\n---\n\n');
      messagesForApi.splice(1, 0, {
        role: 'system',
        content: `[Attached Files Knowledge Base]:\n\n${fileContext}`
      });
    }

    let accumulated = '';

    try {
      const requestBody = {
        model: state.activeModel,
        messages: messagesForApi,
        stream: true
      };

      if (state.backendType === 'custom' && state.customLlmUrl) {
        requestBody.baseUrl = state.customLlmUrl;
      } else if (state.backendType === 'ollama') {
        requestBody.baseUrl = 'http://127.0.0.1:11434/v1';
      } else if (state.backendType === 'lmstudio') {
        requestBody.baseUrl = 'http://127.0.0.1:1234/v1';
      }

      const res = await fetch(`${state.apiBase}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              const delta =
                data.choices?.[0]?.delta?.content ??
                data.choices?.[0]?.delta?.reasoning_content ??
                '';
              accumulated += delta;
              if (elements.noraVoiceBotText) {
                elements.noraVoiceBotText.textContent = accumulated;
              }
            } catch {}
          }
        }
      }

      session.messages.push({ role: 'assistant', content: accumulated });
      saveSessions();
      renderChat();

    } catch (err) {
      accumulated = accumulated || 'Локальная модель сейчас не запущена или находится в режиме ожидания. Запустите вашу модель на ноутбуке, чтобы продолжить беседу.';
      if (elements.noraVoiceBotText) {
        elements.noraVoiceBotText.textContent = accumulated;
      }
      session.messages.push({ role: 'assistant', content: accumulated });
      saveSessions();
      renderChat();
    } finally {
      voiceState.isThinking = false;

      // Speak Nora's reply via TTS if enabled
      if (voiceState.ttsEnabled && accumulated) {
        speakNoraVoice(accumulated);
      } else {
        updateVoiceUiState('idle');
        setTimeout(() => {
          if (voiceState.isOpen && !voiceState.isSpeaking && !voiceState.isThinking) {
            startVoiceListening();
          }
        }, 1200);
      }
    }
  }

  function speakNoraVoice(text) {
    if (!('speechSynthesis' in window)) {
      updateVoiceUiState('idle');
      return;
    }

    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }

    const clean = text
      .replace(/```[\s\S]*?```/g, ' код опущен ')
      .replace(/`[^`]+`/g, '')
      .replace(/[#*_\[\]\(\)\<\>]/g, '')
      .replace(/\n+/g, ' ')
      .trim();

    if (!clean) {
      updateVoiceUiState('idle');
      return;
    }

    const utterance = new SpeechSynthesisUtterance(clean);
    const voices = window.speechSynthesis.getVoices();
    const ruVoice = voices.find(v => v.lang && v.lang.startsWith('ru')) || voices.find(v => v.lang && v.lang.startsWith('en')) || voices[0];
    if (ruVoice) {
      utterance.voice = ruVoice;
      utterance.lang = ruVoice.lang;
    } else {
      utterance.lang = 'ru-RU';
    }
    utterance.rate = 1.05;
    utterance.pitch = 1.05;

    utterance.onstart = () => {
      voiceState.isSpeaking = true;
      updateVoiceUiState('speaking');
    };

    utterance.onend = () => {
      voiceState.isSpeaking = false;
      updateVoiceUiState('idle');
      setTimeout(() => {
        if (voiceState.isOpen && !voiceState.isSpeaking && !voiceState.isThinking) {
          startVoiceListening();
        }
      }, 700);
    };

    utterance.onerror = () => {
      voiceState.isSpeaking = false;
      updateVoiceUiState('idle');
    };

    voiceState.currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  }

  function toggleVoiceTts() {
    voiceState.ttsEnabled = !voiceState.ttsEnabled;
    if (elements.noraVoiceTtsLabel) {
      elements.noraVoiceTtsLabel.textContent = voiceState.ttsEnabled ? 'Озвучка: Вкл' : 'Озвучка: Выкл';
    }
    if (elements.noraVoiceTtsIcon) {
      elements.noraVoiceTtsIcon.textContent = voiceState.ttsEnabled ? '🔊' : '🔇';
    }
    if (!voiceState.ttsEnabled && window.speechSynthesis && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      voiceState.isSpeaking = false;
      updateVoiceUiState('idle');
    }
    showToast(voiceState.ttsEnabled ? 'Озвучка Nora включена' : 'Озвучка Nora выключена');
  }

  function handleCompanionClick() {
    if (voiceState.isJumping || voiceState.isOpen) return;
    voiceState.isJumping = true;

    const btn = elements.noraCompanionBtn;
    const avatar = elements.noraBtnAvatar;
    const shockwave = elements.noraClickShockwave;
    const sparkles = elements.noraSparkles;
    const cloud = elements.noraSpeechCloud;

    // 1. Анимация прыжка и счастливое выражение лица (^ _ ^)
    if (btn) btn.classList.add('jumping');
    if (avatar) avatar.classList.add('happy-eyes');

    // 2. Вспышка ударной волны и звездных искр
    if (shockwave) {
      shockwave.classList.remove('active');
      void shockwave.offsetWidth;
      shockwave.classList.add('active');
    }
    if (sparkles) {
      sparkles.classList.remove('active');
      void sparkles.offsetWidth;
      sparkles.classList.add('active');
    }

    // 3. Радостное облачко речи
    if (cloud) {
      cloud.innerHTML = '<span>Полетели! 🚀</span>';
      cloud.classList.add('show-cloud');
    }

    // 4. Бесшовный переход в полноэкранный режим в верхней точке прыжка
    setTimeout(() => {
      openVoiceMode();
      setTimeout(() => {
        if (btn) btn.classList.remove('jumping');
        if (avatar) avatar.classList.remove('happy-eyes');
        if (sparkles) sparkles.classList.remove('active');
        if (cloud) {
          cloud.classList.remove('show-cloud');
          cloud.innerHTML = '<span>Привет! Поговорим? 🎙️</span>';
        }
        voiceState.isJumping = false;
      }, 450);
    }, 320);
  }

  function setupVoiceOverlayEvents() {
    if (elements.noraCompanionBtn) {
      elements.noraCompanionBtn.onclick = () => handleCompanionClick();
    }

    if (elements.noraVoiceCloseBtn) {
      elements.noraVoiceCloseBtn.onclick = () => closeVoiceMode();
    }

    if (elements.noraVoiceBackChatBtn) {
      elements.noraVoiceBackChatBtn.onclick = () => closeVoiceMode();
    }

    if (elements.noraVoiceMicBtn) {
      elements.noraVoiceMicBtn.onclick = () => toggleVoiceMic();
    }

    if (elements.noraVoiceTtsBtn) {
      elements.noraVoiceTtsBtn.onclick = () => toggleVoiceTts();
    }

    // Keyboard shortcuts: Escape closes voice mode
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && voiceState.isOpen) {
        closeVoiceMode();
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC API  (window.qvac)
  // ══════════════════════════════════════════════════════════════════════════

  window.qvac = {
    openVoice: () => openVoiceMode(),
    closeVoice: () => closeVoiceMode(),
    sendQuick: txt => sendMessage(txt),
    copyCode: (id, btn) => {
      const code = document.getElementById(id);
      if (code) copyText(code.textContent, btn);
    },
    removeAttach: idx => {
      const session = getActiveSession();
      if (!session || !session.attachedFiles) return;
      session.attachedFiles.splice(idx, 1);
      saveSessions();
      renderAttachments();
      showToast('File removed from session');
    }
  };

  document.addEventListener('DOMContentLoaded', init);
})();
