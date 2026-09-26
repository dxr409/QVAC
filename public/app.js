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
    activeModel: 'llama-3.2-3b-instruct',
    backendType: 'auto',
    customLlmUrl: '',
    activeProviderName: 'QVAC Native',
    systemPrompt:
      'You are an intelligent, helpful AI assistant running locally via Tether QVAC engine. Answer clearly, accurately, and concisely.',
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
    attachmentStrip: document.getElementById('attachmentStrip'),

    settingsModal: document.getElementById('settingsModal'),
    openSettingsBtn: document.getElementById('openSettingsBtn'),
    closeSettingsBtn: document.getElementById('closeSettingsBtn'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn'),
    cfgApiBase: document.getElementById('cfgApiBase'),
    cfgBackend: document.getElementById('cfgBackend'),
    customLlmRow: document.getElementById('customLlmRow'),
    cfgCustomLlm: document.getElementById('cfgCustomLlm'),
    checkConnBtn: document.getElementById('checkConnBtn'),
    connStatusText: document.getElementById('connStatusText'),
    systemPromptInput: document.getElementById('systemPromptInput'),
    toastContainer: document.getElementById('toastContainer')
  };

  // ══════════════════════════════════════════════════════════════════════════
  // INIT
  // ══════════════════════════════════════════════════════════════════════════

  function init() {
    loadSettings();
    initSessions();
    setupEventListeners();
    initSpeechRecognition();
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

    if (elements.cfgApiBase) elements.cfgApiBase.value = state.apiBase;
    if (elements.cfgBackend) elements.cfgBackend.value = state.backendType;
    if (elements.cfgCustomLlm) elements.cfgCustomLlm.value = state.customLlmUrl;
    if (elements.customLlmRow) {
      elements.customLlmRow.style.display = state.backendType === 'custom' ? 'block' : 'none';
    }
    if (elements.systemPromptInput) elements.systemPromptInput.value = state.systemPrompt;
  }

  function saveSettings() {
    state.apiBase = elements.cfgApiBase ? elements.cfgApiBase.value.trim().replace(/\/+$/, '') || defaultApi : defaultApi;
    state.backendType = elements.cfgBackend ? elements.cfgBackend.value : 'auto';
    state.customLlmUrl = elements.cfgCustomLlm ? elements.cfgCustomLlm.value.trim() : '';
    state.systemPrompt = elements.systemPromptInput ? elements.systemPromptInput.value.trim() : state.systemPrompt;

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
  }

  async function checkHealth() {
    try {
      const res = await fetch(`${state.apiBase}/v1/engine/status`, { signal: AbortSignal.timeout(3500) });
      if (res.ok) {
        const data = await res.json();
        const onlineBackends = data.backends ? data.backends.filter(b => b.isOnline) : [];
        const external = onlineBackends.find(b => b.type !== 'native');

        if (external) {
          state.activeProviderName = external.name;
          if (elements.activeModelName) elements.activeModelName.textContent = `${external.name}`;
          if (elements.nodeStatusText) elements.nodeStatusText.textContent = `Connected: ${external.name}`;
        } else {
          state.activeProviderName = 'QVAC Native';
          if (elements.activeModelName) elements.activeModelName.textContent = 'QVAC Native (Metal/CPU)';
          if (elements.nodeStatusText) elements.nodeStatusText.textContent = 'Local node active';
        }
      } else {
        const fallbackRes = await fetch(`${state.apiBase}/health`, { signal: AbortSignal.timeout(2000) });
        if (fallbackRes.ok && elements.nodeStatusText) {
          elements.nodeStatusText.textContent = 'Local node active';
        }
      }
    } catch {
      if (elements.nodeStatusText) {
        elements.nodeStatusText.textContent = 'Offline (check server)';
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

  function renderChat() {
    if (!elements.chatFeed) return;
    elements.chatFeed.innerHTML = '';

    const session = getActiveSession();
    const visible = session.messages.filter(m => m.role !== 'system');

    if (visible.length === 0) {
      elements.chatFeed.appendChild(renderWelcomeScreen());
      return;
    }

    visible.forEach(msg => {
      elements.chatFeed.appendChild(createMessageRow(msg.role, msg.content));
    });

    scrollToBottom();
  }

  function renderWelcomeScreen() {
    const wrap = document.createElement('div');
    wrap.className = 'welcome-minimal';
    wrap.innerHTML = `
      <div class="welcome-logo-badge">⚡</div>
      <h1>Tether QVAC</h1>
      <p>Local AI on your computer. No internet. No clouds.</p>
      <div class="quick-prompts-row">
        <button class="quick-prompt-chip" onclick="window.qvac.sendQuick('What are the advantages of local AI with Tether QVAC?')">
          💡 What is Tether QVAC?
        </button>
        <button class="quick-prompt-chip" onclick="window.qvac.sendQuick('How do I upload a document and ask questions about it?')">
          📚 How to upload a document?
        </button>
        <button class="quick-prompt-chip" onclick="window.qvac.sendQuick('Show me a Python code example for local LLM')">
          🐍 Python code example
        </button>
      </div>
    `;
    return wrap;
  }

  function createMessageRow(role, content) {
    const row = document.createElement('div');
    row.className = `message-row ${role}`;

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerHTML = renderMarkdown(content);
    row.appendChild(bubble);

    if (role === 'assistant') {
      const actions = document.createElement('div');
      actions.className = 'message-actions';

      const copyBtn = document.createElement('button');
      copyBtn.className = 'msg-action-btn';
      copyBtn.innerHTML = '📋 Copy';
      copyBtn.onclick = () => copyText(content, copyBtn);

      const speakBtn = document.createElement('button');
      speakBtn.className = 'msg-action-btn';
      speakBtn.innerHTML = '🔊 Speak';
      speakBtn.onclick = () => speakText(content, speakBtn);

      actions.appendChild(copyBtn);
      actions.appendChild(speakBtn);
      row.appendChild(actions);
    }

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
      const fallback =
        accumulated ||
        `⚠️ Connection error (${err.message}). Make sure the server is running on port 8085.`;
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
      if (elements.recordingBar) {
        elements.recordingBar.style.display = 'flex';
        const label = elements.recordingBar.querySelector('span');
        if (label) label.textContent = '🎙️ Listening…';
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
        const label = elements.recordingBar.querySelector('span');
        if (label) label.textContent = `🎙️ ${interimText || finalText || 'Listening…'}`;
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
          Math.min(elements.chatInput.scrollHeight, 140) + 'px';
      };
      elements.chatInput.onkeydown = e => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      };
    }

    if (elements.attachFileBtn && elements.fileHiddenInput) {
      elements.attachFileBtn.onclick = () => elements.fileHiddenInput.click();
      elements.fileHiddenInput.onchange = e => handleFileUpload(e.target.files[0]);
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
  // PUBLIC API  (window.qvac)
  // ══════════════════════════════════════════════════════════════════════════

  window.qvac = {
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
