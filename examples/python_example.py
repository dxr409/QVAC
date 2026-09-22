"""
QVAC Local AI Suite - Python Integration Example

Demonstrates how Python applications can connect to the QVAC local OpenAI-compatible
server or utilize QVAC Python bindings for local LLM, STT, TTS, OCR, and RAG workflows.
"""

import json
import urllib.request
import urllib.parse

OPENAI_SERVER_URL = "http://127.0.0.1:8085/v1"

def check_server_status():
    print("Checking QVAC local server status...")
    try:
        req = urllib.request.urlopen("http://127.0.0.1:8085/")
        res = json.loads(req.read().decode())
        print("Server Online:", res)
    except Exception as e:
        print(f"Could not connect to QVAC server at http://127.0.0.1:8085: {e}")

def chat_completion(prompt: str):
    print(f"\nSending Chat Completion request: '{prompt}'")
    url = f"{OPENAI_SERVER_URL}/chat/completions"
    payload = {
        "model": "llama-3.2-3b-instruct",
        "messages": [
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.7
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    
    try:
        response = urllib.request.urlopen(req)
        result = json.loads(response.read().decode("utf-8"))
        print("\n--- Response ---")
        print(result["choices"][0]["message"]["content"])
        print("\nTokens Used:", result.get("usage"))
    except Exception as e:
        print("Error executing request:", e)

def get_embeddings(text: str):
    print(f"\nGenerating local embeddings for: '{text}'")
    url = f"{OPENAI_SERVER_URL}/embeddings"
    payload = {"input": text, "model": "all-MiniLM-L6-v2"}
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    
    try:
        response = urllib.request.urlopen(req)
        result = json.loads(response.read().decode("utf-8"))
        vector = result["data"][0]["embedding"]
        print(f"Embedding vector dimension: {len(vector)} (first 5 values: {vector[:5]})")
    except Exception as e:
        print("Error generating embedding:", e)

if __name__ == "__main__":
    print("=== QVAC Python Integration Demo ===")
    check_server_status()
    chat_completion("Привет! Расскажи о преимуществах локального ИИ с QVAC SDK.")
    get_embeddings("QVAC local vector embedding text")
