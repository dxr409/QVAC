/**
 * Tether QVAC — Minimalist AI Client
 */

(function () {
  'use strict';

  const defaultApi = (window.location.protocol === 'http:' || window.location.protocol === 'https:')
    ? window.location.origin
    : 'http://127.0.0.1:8085';

  const state = {
    apiBase: defaultApi,
    activeModel: 'llama-3.2-3b-instruct',
    backendType: 'auto',
    customLlmUrl: '',
    activeProviderName: 'QVAC Native',
    systemPrompt: 'You are an intelligent, helpful AI assistant running locally via Tether QVAC engine. Answer clearly, accurately, and concisely.',
    sessions: [],
    activeSessionId: null,
    attachedFiles: [],
    isGenerating: false,
    isRecording: false,
    mediaRecorder: null,
    audioChunks: [],
    abortController: null
  };

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

  function init() {
    loadSettings();
    initSessions();
    setupEventListeners();
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
    state.apiBase = elements.cfgApiBase.value.trim().replace(/\/+$/, '') || defaultApi;
    state.backendType = elements.cfgBackend ? elements.cfgBackend.value : 'auto';
    state.customLlmUrl = elements.cfgCustomLlm ? elements.cfgCustomLlm.value.trim() : '';
    state.systemPrompt = elements.systemPromptInput.value.trim();

    localStorage.setItem('qvac_api_base', state.apiBase);
    localStorage.setItem('qvac_backend', state.backendType);
    localStorage.setItem('qvac_custom_llm', state.customLlmUrl);
    localStorage.setItem('qvac_system_prompt', state.systemPrompt);

    const session = getActiveSession();
    if (session && session.messages[0]) {
      session.messages[0].content = state.systemPrompt;
    }
    saveSessions();

    elements.settingsModal.classList.remove('open');
    showToast('Настройки сохранены');
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
          if (elements.nodeStatusText) elements.nodeStatusText.textContent = `Подключен: ${external.name}`;
        } else {
          state.activeProviderName = 'QVAC Native';
          if (elements.activeModelName) elements.activeModelName.textContent = 'QVAC Native (Metal/CPU)';
          if (elements.nodeStatusText) elements.nodeStatusText.textContent = 'Локальный узел активен';
        }
      } else {
        const fallbackRes = await fetch(`${state.apiBase}/health`, { signal: AbortSignal.timeout(2000) });
        if (fallbackRes.ok && elements.nodeStatusText) {
          elements.nodeStatusText.textContent = 'Локальный узел активен';
        }
      }
    } catch (e) {
      if (elements.nodeStatusText) elements.nodeStatusText.textContent = 'Офлайн (проверьте сервер)';
    }
  }

  async function testBackendConnection() {
    if (!elements.connStatusText) return;
    elements.connStatusText.textContent = 'Проверка...';
    elements.connStatusText.style.color = 'var(--text-muted)';

    try {
      const res = await fetch(`${state.apiBase}/v1/engine/status`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = await res.json();
        const online = data.backends ? data.backends.filter(b => b.isOnline) : [];
        const ext = online.find(b => b.type !== 'native');
        if (ext) {
          elements.connStatusText.textContent = `🟢 Найдено: ${ext.name}`;
          elements.connStatusText.style.color = '#34d399';
        } else {
          elements.connStatusText.textContent = `⚡ QVAC Native Engine (${data.hardware || 'CPU'})`;
          elements.connStatusText.style.color = 'var(--accent)';
        }
      } else {
        elements.connStatusText.textContent = '⚠️ Сервер ответил с ошибкой';
        elements.connStatusText.style.color = '#f59e0b';
      }
    } catch (err) {
      elements.connStatusText.textContent = '❌ Не удалось подключиться к серверу';
      elements.connStatusText.style.color = '#ef4444';
    }
  }

  // Sessions
  function initSessions() {
    try {
      const stored = localStorage.getItem('qvac_sessions');
      if (stored) state.sessions = JSON.parse(stored);
    } catch (e) {
      state.sessions = [];
    }

    if (state.sessions.length === 0) {
      createNewSession();
    } else {
      state.activeSessionId = state.sessions[0].id;
      renderSessionsList();
      renderChat();
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
      title: 'Новый чат',
      messages: [{ role: 'system', content: state.systemPrompt }]
    };
    state.sessions.unshift(newSession);
    state.activeSessionId = newSession.id;
    saveSessions();
    renderChat();
  }

  function switchSession(id) {
    state.activeSessionId = id;
    renderSessionsList();
    renderChat();
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
      del.onclick = (e) => deleteSession(s.id, e);

      item.appendChild(title);
      item.appendChild(del);
      elements.sessionsList.appendChild(item);
    });
  }

  // Chat Rendering
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
      <p>Локальный искусственный интеллект прямо на вашем компьютере. Без интернета и облаков.</p>
      <div class="quick-prompts-row">
        <button class="quick-prompt-chip" onclick="window.qvac.sendQuick('Расскажи о преимуществах локального ИИ Tether QVAC')">
          💡 Что такое Tether QVAC?
        </button>
        <button class="quick-prompt-chip" onclick="window.qvac.sendQuick('Как загрузить документ в базу знаний RAG?')">
          📚 Как загрузить документ?
        </button>
        <button class="quick-prompt-chip" onclick="window.qvac.sendQuick('Покажи пример кода на Python для работы с локальной LLM')">
          🐍 Пример кода на Python
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
      copyBtn.innerHTML = '📋 Скопировать';
      copyBtn.onclick = () => copyText(content, copyBtn);

      const speakBtn = document.createElement('button');
      speakBtn.className = 'msg-action-btn';
      speakBtn.innerHTML = '🔊 Озвучить';
      speakBtn.onclick = () => speakAudio(content, speakBtn);

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
            <span>${lang || 'код'}</span>
            <button class="copy-btn" onclick="window.qvac.copyCode('${id}', this)">Копировать</button>
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

  // Send Question with Streaming
  async function sendMessage(overrideText) {
    const text = overrideText || elements.chatInput.value.trim();
    if (!text || state.isGenerating) return;

    const session = getActiveSession();

    let fullPrompt = text;
    if (state.attachedFiles.length > 0) {
      const docContext = state.attachedFiles.map(f => `[Файл "${f.name}"]:\n${f.content}`).join('\n\n');
      fullPrompt = `${fullPrompt}\n\n${docContext}`;
      state.attachedFiles = [];
      renderAttachments();
    }

    session.messages.push({ role: 'user', content: fullPrompt });
    if (session.messages.filter(m => m.role === 'user').length === 1) {
      session.title = text.slice(0, 26) + (text.length > 26 ? '...' : '');
    }
    saveSessions();

    if (!overrideText) {
      elements.chatInput.value = '';
      elements.chatInput.style.height = 'auto';
    }

    renderChat();

    // Create streaming placeholder
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

    try {
      state.abortController = new AbortController();

      const requestBody = {
        model: state.activeModel,
        messages: session.messages,
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
              const delta = data.choices?.[0]?.delta?.content || '';
              accumulated += delta;
              bubbleEl.innerHTML = renderMarkdown(accumulated) + '<span class="typing-cursor"></span>';
              scrollToBottom();
            } catch (e) {}
          }
        }
      }

      session.messages.push({ role: 'assistant', content: accumulated });
      saveSessions();
      renderChat();
    } catch (err) {
      const fallback = accumulated || `⚠️ Ошибка соединения с локальным сервером (${err.message}). Убедитесь, что сервер запущен на порту 8085.`;
      session.messages.push({ role: 'assistant', content: fallback });
      saveSessions();
      renderChat();
    } finally {
      state.isGenerating = false;
      elements.sendBtn.disabled = false;
      scrollToBottom();
    }
  }

  // File Attachments (OCR for Images, RAG for Docs)
  async function handleFileUpload(file) {
    if (!file) return;

    if (file.type.startsWith('image/')) {
      showToast(`Сканирую текст с "${file.name}"...`);
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const res = await fetch(`${state.apiBase}/v1/ocr`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileData: e.target.result, fileName: file.name })
          });
          const data = await res.json();
          const extracted = data.extractedText || 'Текст не распознан';
          state.attachedFiles.push({ name: `OCR: ${file.name}`, content: extracted });
          renderAttachments();
          showToast(`Текст из "${file.name}" добавлен`);
        } catch (err) {
          showToast('Не удалось распознать изображение');
        }
      };
      reader.readAsDataURL(file);
    } else {
      showToast(`Индексирую "${file.name}" в RAG...`);
      const reader = new FileReader();
      reader.onload = async (e) => {
        const text = e.target.result;
        try {
          await fetch(`${state.apiBase}/v1/rag/index`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: text, documentName: file.name })
          });
          state.attachedFiles.push({ name: file.name, content: text });
          renderAttachments();
          showToast(`Документ "${file.name}" добавлен в память`);
        } catch (err) {
          showToast('Не удалось загрузить документ');
        }
      };
      reader.readAsText(file);
    }
  }

  function renderAttachments() {
    if (!elements.attachmentStrip) return;
    elements.attachmentStrip.innerHTML = '';
    state.attachedFiles.forEach((f, idx) => {
      const tag = document.createElement('div');
      tag.className = 'attach-tag';
      tag.innerHTML = `<span>📎 ${f.name}</span> <button onclick="window.qvac.removeAttach(${idx})">✕</button>`;
      elements.attachmentStrip.appendChild(tag);
    });
  }

  // Voice STT
  async function toggleRecording() {
    if (!state.isRecording) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToast('Запись аудио не поддерживается');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        state.mediaRecorder = new MediaRecorder(stream);
        state.audioChunks = [];

        state.mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) state.audioChunks.push(e.data);
        };

        state.mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(state.audioChunks, { type: 'audio/wav' });
          showToast('Распознаю речь через Whisper...');
          try {
            const res = await fetch(`${state.apiBase}/v1/audio/transcriptions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audioData: 'voice_recording.wav' })
            });
            const data = await res.json();
            if (data.text) {
              elements.chatInput.value = data.text;
              sendMessage();
            }
          } catch (e) {
            showToast('Ошибка распознавания речи');
          }
        };

        state.mediaRecorder.start();
        state.isRecording = true;
        elements.micBtn.classList.add('recording');
        if (elements.recordingBar) elements.recordingBar.style.display = 'flex';
      } catch (err) {
        showToast('Доступ к микрофону отклонен');
      }
    } else {
      if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
        state.mediaRecorder.stop();
        state.mediaRecorder.stream.getTracks().forEach(t => t.stop());
      }
      state.isRecording = false;
      elements.micBtn.classList.remove('recording');
      if (elements.recordingBar) elements.recordingBar.style.display = 'none';
    }
  }

  async function speakAudio(text, btn) {
    const clean = text.replace(/[#*`_\[\]]/g, '').trim();
    if (!clean) return;

    btn.textContent = '⏳ Озвучка...';
    try {
      const res = await fetch(`${state.apiBase}/v1/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: clean })
      });

      if (res.ok) {
        const blob = await res.blob();
        const audio = new Audio(URL.createObjectURL(blob));
        audio.play();
        btn.textContent = '🔊 Играет...';
        audio.onended = () => { btn.textContent = '🔊 Озвучить'; };
      } else {
        fallbackSpeech(clean, btn);
      }
    } catch (e) {
      fallbackSpeech(clean, btn);
    }
  }

  function fallbackSpeech(text, btn) {
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(text);
      u.onend = () => { btn.textContent = '🔊 Озвучить'; };
      window.speechSynthesis.speak(u);
      btn.textContent = '🔊 Говорит...';
    } else {
      btn.textContent = '🔊 Озвучить';
      showToast('Синтез речи недоступен');
    }
  }

  // Helpers
  function copyText(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Скопировано');
      if (btn) {
        const old = btn.textContent;
        btn.textContent = '✓ Скопировано';
        setTimeout(() => { btn.textContent = old; }, 1400);
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
    setTimeout(() => t.remove(), 2500);
  }

  // Events
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
        saveSessions();
        renderChat();
        showToast('История очищена');
      };
    }

    if (elements.sendBtn) elements.sendBtn.onclick = () => sendMessage();
    if (elements.chatInput) {
      elements.chatInput.oninput = () => {
        elements.chatInput.style.height = 'auto';
        elements.chatInput.style.height = Math.min(elements.chatInput.scrollHeight, 140) + 'px';
      };
      elements.chatInput.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      };
    }

    if (elements.attachFileBtn && elements.fileHiddenInput) {
      elements.attachFileBtn.onclick = () => elements.fileHiddenInput.click();
      elements.fileHiddenInput.onchange = (e) => handleFileUpload(e.target.files[0]);
    }

    if (elements.micBtn) elements.micBtn.onclick = toggleRecording;

    if (elements.openSettingsBtn) elements.openSettingsBtn.onclick = () => elements.settingsModal.classList.add('open');
    if (elements.closeSettingsBtn) elements.closeSettingsBtn.onclick = () => elements.settingsModal.classList.remove('open');
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

  window.qvac = {
    sendQuick: (txt) => sendMessage(txt),
    copyCode: (id, btn) => {
      const code = document.getElementById(id);
      if (code) copyText(code.textContent, btn);
    },
    removeAttach: (idx) => {
      state.attachedFiles.splice(idx, 1);
      renderAttachments();
    }
  };

  document.addEventListener('DOMContentLoaded', init);
})();
