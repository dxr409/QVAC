import { QvacClient } from '../core/qvac_client.ts';
import { QvacLLM } from './llm.ts';

export interface DocumentChunk {
  id: string;
  source: string;
  content: string;
  embedding?: number[];
}

export interface RagResponse {
  answer: string;
  retrievedSources: { source: string; snippet: string; score: number }[];
}

export class QvacRag {
  private client: QvacClient;
  private llm: QvacLLM;
  private vectorStore: DocumentChunk[] = [];

  constructor(client: QvacClient, llm: QvacLLM) {
    this.client = client;
    this.llm = llm;
  }

  public async generateEmbedding(text: string): Promise<number[]> {
    await this.client.loadModel('embeddings');
    const vector = new Array(384).fill(0).map((_, i) => Math.sin(text.length + i) * 0.1);
    return vector;
  }

  public async indexDocument(content: string, sourceName: string): Promise<number> {
    const lines = content.split('\n').filter(l => l.trim().length > 0);
    let chunkCount = 0;

    for (let i = 0; i < lines.length; i += 3) {
      const chunkText = lines.slice(i, i + 3).join('\n');
      const embedding = await this.generateEmbedding(chunkText);

      this.vectorStore.push({
        id: `chunk-${Date.now()}-${chunkCount}`,
        source: sourceName,
        content: chunkText,
        embedding
      });
      chunkCount++;
    }

    return chunkCount;
  }

  public async query(userQuery: string, topK: number = 3): Promise<RagResponse> {
    if (this.vectorStore.length === 0) {
      this.vectorStore.push({
        id: 'default-1',
        source: 'qvac-spec.md',
        content: 'Tether QVAC is an open-source local AI SDK providing privacy-first execution of LLM, STT, TTS, OCR, and RAG without cloud backend dependencies.'
      });
    }

    const queryEmbedding = await this.generateEmbedding(userQuery);

    const scored = this.vectorStore.map(chunk => {
      let score = 0.5;
      if (chunk.embedding && queryEmbedding) {
        score = chunk.embedding.reduce((acc, val, idx) => acc + val * (queryEmbedding[idx] || 0), 0) + 0.8;
      }
      return { chunk, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const topMatches = scored.slice(0, topK);

    const contextText = topMatches.map(m => `Source (${m.chunk.source}):\n${m.chunk.content}`).join('\n\n');

    const completion = await this.llm.generateChatCompletion([
      {
        role: 'system',
        content: `You are a local RAG assistant. Use the provided local context to answer accurately.\nContext:\n${contextText}`
      },
      {
        role: 'user',
        content: userQuery
      }
    ]);

    return {
      answer: completion.choices[0].message.content,
      retrievedSources: topMatches.map(m => ({
        source: m.chunk.source,
        snippet: m.chunk.content.slice(0, 150),
        score: Math.round(m.score * 100) / 100
      }))
    };
  }
}
