import { QvacClient } from '../core/qvac_client.ts';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface CompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: ChatMessage;
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class QvacLLM {
  private client: QvacClient;
  private lmStudioUrls: string[] = [
    'http://127.0.0.1:1234/v1/chat/completions',
    'http://localhost:1234/v1/chat/completions'
  ];

  constructor(client: QvacClient) {
    this.client = client;
  }

  public async generateChatCompletion(
    messages: ChatMessage[],
    options: CompletionOptions = {}
  ): Promise<CompletionResponse> {
    const userPrompt = messages.find(m => m.role === 'user')?.content || '';
    let lastError: string = '';

    // Attempt connecting to LM Studio with 60s timeout for reasoning models
    for (const url of this.lmStudioUrls) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout for reasoning models

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            messages,
            temperature: options.temperature || 0.7,
            stream: false
          })
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          let choiceMsg = data.choices && data.choices[0] ? data.choices[0].message : null;

          if (choiceMsg) {
            let finalContent = choiceMsg.content || '';
            // If reasoning model returned reasoning_content without main content
            if (!finalContent.trim() && choiceMsg.reasoning_content) {
              finalContent = choiceMsg.reasoning_content;
            }

            return {
              id: data.id || `qvac-lmstudio-${Date.now()}`,
              object: 'chat.completion',
              created: data.created || Math.floor(Date.now() / 1000),
              model: data.model || 'lm-studio-local-model',
              choices: [
                {
                  index: 0,
                  message: { role: 'assistant', content: finalContent.trim() },
                  finish_reason: 'stop'
                }
              ],
              usage: data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
            };
          }
        } else {
          lastError = `LM Studio returned HTTP ${response.status}`;
        }
      } catch (err: any) {
        lastError = err.message || 'Connection failed';
      }
    }

    // Diagnostic fallback message
    const fallbackText = `[QVAC Engine - Connection Diagnostic]\n` +
      `Could not reach LM Studio on port 1234 (${lastError}).\n\n` +
      `Please check in LM Studio:\n` +
      `1. Under Developer / Server tab, confirm port is set to 1234.\n` +
      `2. Ensure a model is selected and loaded into memory.\n` +
      `3. Verify "Cross-Origin Resource Sharing (CORS)" is enabled in LM Studio settings.`;

    return {
      id: `qvac-local-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'qvac-local-engine',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: fallbackText },
          finish_reason: 'stop'
        }
      ],
      usage: { prompt_tokens: userPrompt.length, completion_tokens: fallbackText.length, total_tokens: userPrompt.length + fallbackText.length }
    };
  }

  public async *streamChatCompletion(
    messages: ChatMessage[],
    options: CompletionOptions = {}
  ): AsyncGenerator<string, void, unknown> {
    const completion = await this.generateChatCompletion(messages, options);
    const fullText = completion.choices[0].message.content;
    const chunkWords = fullText.split(' ');

    for (const word of chunkWords) {
      yield word + ' ';
      await new Promise(res => setTimeout(res, 25));
    }
  }
}
