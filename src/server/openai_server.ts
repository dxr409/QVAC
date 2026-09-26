import http from 'node:http';
import fs, { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { QvacClient } from '../core/qvac_client.ts';
import { QvacLLM } from '../features/llm.ts';
import { QvacSpeech } from '../features/speech.ts';
import { QvacTranslationOcr } from '../features/translation_ocr.ts';
import { QvacRag } from '../features/rag.ts';

export function createOpenAIServer(configPath?: string) {
  const client = new QvacClient(configPath);
  const llm = new QvacLLM(client);
  const speech = new QvacSpeech(client);
  const transOcr = new QvacTranslationOcr(client);
  const rag = new QvacRag(client, llm);
  const config = client.getConfig();

  const server = http.createServer(async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', config.server.corsOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Normalize URL path
    let url = (req.url || '/').split('?')[0];
    if (url.length > 1 && url.endsWith('/')) {
      url = url.slice(0, -1);
    }
    const pathWithoutV1 = url.startsWith('/v1') ? url.slice(3) : url;

    // Parse Body for POST requests
    let body: any = {};
    let rawBuffer: Buffer = Buffer.alloc(0);
    if (req.method === 'POST') {
      try {
        const buffers: Buffer[] = [];
        for await (const chunk of req) {
          buffers.push(chunk);
        }
        rawBuffer = Buffer.concat(buffers);
        const bodyStr = rawBuffer.toString('utf8');
        if (bodyStr.trim().length > 0) {
          try {
            body = JSON.parse(bodyStr);
          } catch (e) {
            body = { rawData: bodyStr };
          }
        }
      } catch (e) {
        // Fallback
      }
    }

    // Serve Static Frontend Assets from public/
    if (req.method === 'GET' || req.method === 'HEAD') {
      const safePath = url === '/' ? '/index.html' : url;
      const publicDir = path.resolve(process.cwd(), 'public');
      const resolvedFilePath = path.join(publicDir, safePath.replace(/^\/+/, ''));

      // Check if file is inside public directory to prevent directory traversal
      if (resolvedFilePath.startsWith(publicDir) && fs.existsSync(resolvedFilePath) && fs.statSync(resolvedFilePath).isFile()) {
        const ext = path.extname(resolvedFilePath).toLowerCase();
        const mimeTypes: Record<string, string> = {
          '.html': 'text/html; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.js': 'application/javascript; charset=utf-8',
          '.json': 'application/json; charset=utf-8',
          '.svg': 'image/svg+xml',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.ico': 'image/x-icon',
          '.woff2': 'font/woff2',
          '.wav': 'audio/wav'
        };

        const contentType = mimeTypes[ext] || 'application/octet-stream';
        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        });
        res.end(fs.readFileSync(resolvedFilePath));
        return;
      }
    }

    // Health check JSON
    if (url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'online',
        server: 'Tether QVAC Native Multimodal Engine',
        hardware: client.getHardwareDevice(),
        sdkVersion: config.qvac.version,
        endpoints: [
          'GET /v1/models',
          'POST /v1/chat/completions',
          'POST /v1/embeddings',
          'POST /v1/audio/transcriptions',
          'POST /v1/audio/speech',
          'POST /v1/ocr',
          'POST /v1/rag/index',
          'POST /v1/rag/query',
          'POST /v1/translate'
        ]
      }));
      return;
    }

    // GET /v1/engine/status
    if ((url === '/v1/engine/status' || pathWithoutV1 === '/engine/status') && req.method === 'GET') {
      const backends = await llm.getBackendsStatus();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'online',
        hardware: client.getHardwareDevice(),
        defaultModel: config.models.llm.name,
        backends
      }));
      return;
    }

    // GET /v1/models (or /models)
    if ((url === '/v1/models' || pathWithoutV1 === '/models') && req.method === 'GET') {
      const loaded = await client.listModels();
      const modelsList = [
        { id: config.models.llm.name, object: 'model', created: 1700000000, owned_by: 'qvac-local' },
        { id: config.models.embeddings.name, object: 'model', created: 1700000000, owned_by: 'qvac-local' },
        ...loaded.map(m => ({ id: m.name, object: 'model', created: 1700000000, owned_by: 'qvac-local' }))
      ];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ object: 'list', data: modelsList }));
      return;
    }

    // POST /v1/chat/completions (Multi-turn Chat Completion)
    if ((url === '/v1/chat/completions' || pathWithoutV1 === '/chat/completions') && req.method === 'POST') {
      try {
        const { messages, stream, model, temperature, baseUrl } = body;
        if (!messages || !Array.isArray(messages)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'Invalid messages array in request body' } }));
          return;
        }

        if (stream) {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
          });

          try {
            const streamGen = llm.streamChatCompletion(messages, { model, temperature, baseUrl });
            for await (const chunk of streamGen) {
              const sseData = {
                id: `chatcmpl-${Date.now()}`,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: model || config.models.llm.name,
                choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }]
              };
              res.write(`data: ${JSON.stringify(sseData)}\n\n`);
            }
            res.write('data: [DONE]\n\n');
          } catch (streamErr: any) {
            const errData = {
              id: `chatcmpl-err-${Date.now()}`,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: model || config.models.llm.name,
              choices: [{ index: 0, delta: { content: `\n[Ошибка: ${streamErr.message}]` }, finish_reason: 'stop' }]
            };
            res.write(`data: ${JSON.stringify(errData)}\n\n`);
            res.write('data: [DONE]\n\n');
          }
          res.end();
        } else {
          const completion = await llm.generateChatCompletion(messages, { model, temperature, baseUrl });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(completion));
        }
      } catch (err: any) {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: err.message || 'Internal Server Error' } }));
        }
      }
      return;
    }

    // POST /v1/ocr (Tether QVAC Server-Side OCR)
    if ((url === '/v1/ocr' || pathWithoutV1 === '/ocr') && req.method === 'POST') {
      try {
        const fileData = body.fileData || body.imageName || rawBuffer;
        const result = await transOcr.performOcr(fileData);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: err.message } }));
      }
      return;
    }

    // POST /v1/audio/transcriptions (Tether QVAC Server-Side STT)
    if ((url === '/v1/audio/transcriptions' || pathWithoutV1 === '/audio/transcriptions') && req.method === 'POST') {
      try {
        const audioInput = body.audioData || 'uploaded_audio.wav';
        const result = await speech.speechToText(audioInput);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ text: result.text }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: err.message } }));
      }
      return;
    }

    // POST /v1/audio/speech (Tether QVAC Server-Side TTS)
    if ((url === '/v1/audio/speech' || pathWithoutV1 === '/audio/speech') && req.method === 'POST') {
      try {
        const { input, voice } = body;
        const result = await speech.textToSpeech(input || 'Default speech', voice);
        res.writeHead(200, { 'Content-Type': result.mimeType });
        res.end(result.audioBuffer);
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: err.message } }));
      }
      return;
    }

    // POST /v1/rag/index (Tether QVAC Document RAG Indexing)
    if ((url === '/v1/rag/index' || pathWithoutV1 === '/rag/index') && req.method === 'POST') {
      try {
        const { content, documentName } = body;
        const chunkCount = await rag.indexDocument(content || '', documentName || 'document.txt');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success', chunksIndexed: chunkCount, documentName }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: err.message } }));
      }
      return;
    }

    // POST /v1/rag/query (Tether QVAC RAG Query)
    if ((url === '/v1/rag/query' || pathWithoutV1 === '/rag/query') && req.method === 'POST') {
      try {
        const { query } = body;
        const result = await rag.query(query || '');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: err.message } }));
      }
      return;
    }

    // POST /v1/translate (Tether QVAC Neural Translation)
    if ((url === '/v1/translate' || pathWithoutV1 === '/translate') && req.method === 'POST') {
      try {
        const { text, targetLanguage, sourceLanguage } = body;
        const result = await transOcr.translateText(text || '', targetLanguage || 'ru', sourceLanguage || 'auto');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: err.message } }));
      }
      return;
    }

    // 404 Fallback
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: `Route not found: ${req.method} ${url}` } }));
  });

  return { server, config, client };
}

// Start standalone server if executed directly.
// Use realpathSync on both sides to handle macOS symlinks (/tmp → /private/tmp)
// that cause a mismatch between import.meta.url and process.argv[1].
(function startIfMain() {
  try {
    const thisFile = realpathSync(fileURLToPath(import.meta.url));
    const mainFile = realpathSync(process.argv[1]);
    if (thisFile !== mainFile) return;
  } catch {
    // If anything fails, just start — we're probably running directly
  }

  const { server, config, client } = createOpenAIServer();
  server.listen(config.server.port, config.server.host, () => {
    console.log(`\n🚀 Tether QVAC Multimodal Server running at: http://${config.server.host}:${config.server.port}${config.server.apiPrefix}`);
    console.log(`⚡ Hardware Acceleration Mode: ${client.getHardwareDevice()}`);
  });
})();
