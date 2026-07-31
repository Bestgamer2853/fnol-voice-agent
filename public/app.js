// ─── DOM references ───

const chatLog = document.querySelector('#chatLog');
const chatForm = document.querySelector('#chatForm');
const messageInput = document.querySelector('#messageInput');
const sendButton = document.querySelector('#sendButton');
const connectionStatus = document.querySelector('#connectionStatus');
const examples = document.querySelectorAll('[data-example]');
const micButton = document.querySelector('#micButton');
const speakerToggle = document.querySelector('#speakerToggle');
const voiceStatus = document.querySelector('#voiceStatus');
const voiceStatusText = document.querySelector('#voiceStatusText');

let sessionId;

// ─── Status helpers ───

function setStatus(label, mode = 'ready') {
  connectionStatus.textContent = label;
  connectionStatus.dataset.mode = mode;
}

function appendMessage(role, message) {
  const item = document.createElement('li');
  item.className = `message ${role}`;

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = message;

  item.append(bubble);
  chatLog.append(item);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function setLoading(isLoading) {
  sendButton.disabled = isLoading;
  messageInput.disabled = isLoading;
  setStatus(isLoading ? 'Thinking' : 'Ready', isLoading ? 'loading' : 'ready');
}

function showConfirmationNotification(confirmation) {
  const existing = document.querySelector('.confirmation-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'confirmation-toast';
  toast.innerHTML = `
    <div class="confirmation-header">
      <span class="confirmation-icon">✉</span>
      <span class="confirmation-label">Simulated ${confirmation.type?.toUpperCase() ?? 'SMS'} Confirmation</span>
    </div>
    <div class="confirmation-to">To: ${confirmation.to ?? 'Policyholder'}</div>
    <div class="confirmation-body">${confirmation.message ?? ''}</div>
  `;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('visible');
  });

  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 400);
  }, 12000);
}

// ─── Voice Controller ───

class VoiceController {
  constructor() {
    this.sttSupported = false;
    this.ttsSupported = false;
    this.recognition = null;
    this.isListening = false;
    this.ttsEnabled = false;
    this.currentUtterance = null;

    this._initSTT();
    this._initTTS();
  }

  _initSTT() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      micButton.dataset.unsupported = 'true';
      return;
    }

    this.sttSupported = true;
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-IN';
    this.recognition.maxAlternatives = 1;

    this.recognition.addEventListener('result', (event) => {
      const segments = [];

      for (let i = 0; i < event.results.length; i++) {
        segments.push(event.results[i][0].transcript);
      }

      const transcript = segments.join('').trim();
      const isFinal = event.results[event.results.length - 1].isFinal;

      if (transcript.length > 0) {
        messageInput.value = transcript;

        if (isFinal) {
          voiceStatusText.textContent = 'Processing...';
        } else {
          voiceStatusText.textContent = `Hearing: "${transcript}"`;
        }
      }

      if (isFinal && transcript.length > 0) {
        this.stopListening();
        void sendMessage(transcript);
      }
    });

    this.recognition.addEventListener('end', () => {
      // If still flagged as listening, it ended unexpectedly (silence timeout).
      // We don't auto-restart — user can click mic again.
      if (this.isListening) {
        this.stopListening();
      }
    });

    this.recognition.addEventListener('error', (event) => {
      if (event.error === 'no-speech') {
        voiceStatusText.textContent = 'No speech detected. Click mic to try again.';
        setTimeout(() => this.stopListening(), 1500);
        return;
      }

      if (event.error === 'aborted' || event.error === 'not-allowed') {
        this.stopListening();
        return;
      }

      console.warn('SpeechRecognition error:', event.error);
      this.stopListening();
    });
  }

  _initTTS() {
    if (!window.speechSynthesis) {
      speakerToggle.dataset.unsupported = 'true';
      return;
    }

    this.ttsSupported = true;
  }

  startListening() {
    if (!this.sttSupported || this.isListening) {
      return;
    }

    // Cancel any ongoing TTS so it doesn't interfere with the mic
    this.cancelTTS();

    this.isListening = true;
    micButton.dataset.active = 'true';
    voiceStatus.hidden = false;
    voiceStatusText.textContent = 'Listening...';
    messageInput.value = '';

    try {
      this.recognition.start();
    } catch {
      // Already started
    }
  }

  stopListening() {
    if (!this.sttSupported) {
      return;
    }

    this.isListening = false;
    micButton.dataset.active = 'false';
    voiceStatus.hidden = true;

    try {
      this.recognition.stop();
    } catch {
      // Already stopped
    }
  }

  toggleListening() {
    if (this.isListening) {
      this.stopListening();
    } else {
      this.startListening();
    }
  }

  toggleTTS() {
    if (!this.ttsSupported) {
      return;
    }

    this.ttsEnabled = !this.ttsEnabled;
    speakerToggle.dataset.active = this.ttsEnabled ? 'true' : 'false';

    if (!this.ttsEnabled) {
      this.cancelTTS();
    }
  }

  speak(text) {
    if (!this.ttsSupported || !this.ttsEnabled) {
      return;
    }

    this.cancelTTS();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-IN';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    // Try to pick a good English voice
    const voices = speechSynthesis.getVoices();
    const englishVoice = voices.find(
      (v) => v.lang.startsWith('en') && v.default,
    ) || voices.find((v) => v.lang.startsWith('en'));

    if (englishVoice) {
      utterance.voice = englishVoice;
    }

    this.currentUtterance = utterance;
    speechSynthesis.speak(utterance);
  }

  cancelTTS() {
    if (this.ttsSupported && speechSynthesis.speaking) {
      speechSynthesis.cancel();
    }

    this.currentUtterance = null;
  }
}

const voice = new VoiceController();

// ─── Mic button handler ───

micButton.addEventListener('click', () => {
  voice.toggleListening();
});

// ─── Speaker toggle handler ───

speakerToggle.addEventListener('click', () => {
  voice.toggleTTS();
});

// ─── Preload voices (some browsers need this) ───

if (window.speechSynthesis) {
  speechSynthesis.getVoices();
  speechSynthesis.addEventListener('voiceschanged', () => {
    speechSynthesis.getVoices();
  });
}

// ─── Conversation API ───

const urlParams = new URLSearchParams(window.location.search);
const apiKey = urlParams.get('key') || '';

async function startConversation() {
  setLoading(true);

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  try {
    const response = await fetch('/chat/start', {
      method: 'POST',
      headers,
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? 'Unable to start the demo session.');
    }

    sessionId = payload.sessionId;
    appendMessage('assistant', payload.assistantResponse);
    voice.speak(payload.assistantResponse);
  } catch (error) {
    appendMessage(
      'assistant',
      error instanceof Error
        ? error.message
        : 'The browser demo could not start.',
    );
    setStatus('Offline', 'error');
  } finally {
    setLoading(false);
    messageInput.focus();
  }
}

async function sendMessage(message) {
  appendMessage('user', message);
  setLoading(true);

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  try {
    const response = await fetch('/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sessionId,
        userMessage: message,
      }),
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? 'The message could not be sent.');
    }

    sessionId = payload.sessionId;
    appendMessage('assistant', payload.assistantResponse);
    voice.speak(payload.assistantResponse);

    if (payload.actionType === 'complete' && payload.confirmation) {
      showConfirmationNotification(payload.confirmation);
    }
  } catch (error) {
    appendMessage(
      'assistant',
      error instanceof Error
        ? error.message
        : 'Something went wrong while handling that message.',
    );
    setStatus('Error', 'error');
  } finally {
    setLoading(false);
    messageInput.value = '';
    messageInput.focus();
  }
}

// ─── Form submission ───

chatForm.addEventListener('submit', (event) => {
  event.preventDefault();

  const message = messageInput.value.trim();
  if (!message) {
    return;
  }

  messageInput.value = '';
  void sendMessage(message);
});

messageInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});

// ─── Demo chips ───

examples.forEach((button) => {
  button.addEventListener('click', () => {
    messageInput.value = button.dataset.example ?? '';
    messageInput.focus();
  });
});

// ─── Initialize ───

void startConversation();
