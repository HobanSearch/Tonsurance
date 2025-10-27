#!/usr/bin/env python3
"""
Tonny Inference Server
Serves the fine-tuned Tonny-7B model via Ollama-compatible API
Works with transformers (no MLX required, Docker-compatible)
"""

import argparse
import logging
import os
from typing import Optional, List, Dict, Any
from contextlib import asynccontextmanager

import torch
from transformers import AutoTokenizer, AutoModelForCausalLM, TextIteratorStreamer
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
import uvicorn
from threading import Thread

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Global model and tokenizer
model = None
tokenizer = None
device = None

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    model: str = "tonny"
    messages: List[ChatMessage]
    stream: bool = False
    temperature: float = 0.7
    max_tokens: int = 512
    top_p: float = 0.9

class CompletionRequest(BaseModel):
    model: str = "tonny"
    prompt: str
    stream: bool = False
    temperature: float = 0.7
    max_tokens: int = 512

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load model on startup, cleanup on shutdown"""
    global model, tokenizer, device

    logger.info("Loading Tonny model...")
    model_path = os.getenv("MODEL_PATH", "models/tonny-7b-merged")

    # Determine device
    if torch.cuda.is_available():
        device = "cuda"
        logger.info("Using CUDA GPU")
    elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        device = "mps"
        logger.info("Using Apple Silicon MPS")
    else:
        device = "cpu"
        logger.info("Using CPU (slower inference)")

    try:
        # Load tokenizer
        tokenizer = AutoTokenizer.from_pretrained(model_path)

        # Load model with appropriate settings
        model = AutoModelForCausalLM.from_pretrained(
            model_path,
            torch_dtype=torch.float16 if device != "cpu" else torch.float32,
            device_map="auto" if device != "cpu" else None,
            low_cpu_mem_usage=True
        )

        if device == "cpu":
            model = model.to(device)

        model.eval()
        logger.info(f"Model loaded successfully on {device}")

    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        raise

    yield

    # Cleanup
    logger.info("Shutting down, cleaning up model...")
    del model
    del tokenizer
    torch.cuda.empty_cache() if torch.cuda.is_available() else None

app = FastAPI(
    title="Tonny Inference Server",
    description="Ollama-compatible API for Tonny-7B model",
    version="1.0.0",
    lifespan=lifespan
)

def format_chat_prompt(messages: List[ChatMessage]) -> str:
    """Format chat messages into a prompt"""
    formatted = ""
    for msg in messages:
        if msg.role == "system":
            formatted += f"System: {msg.content}\n\n"
        elif msg.role == "user":
            formatted += f"User: {msg.content}\n\n"
        elif msg.role == "assistant":
            formatted += f"Assistant: {msg.content}\n\n"

    # Add final assistant prompt
    formatted += "Assistant:"
    return formatted

def generate_response(
    prompt: str,
    temperature: float = 0.7,
    max_tokens: int = 512,
    top_p: float = 0.9,
    stream: bool = False
):
    """Generate text from the model"""
    global model, tokenizer, device

    if model is None or tokenizer is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    # Tokenize input
    inputs = tokenizer(prompt, return_tensors="pt").to(device)

    # Generation config
    gen_config = {
        "max_new_tokens": max_tokens,
        "temperature": temperature,
        "top_p": top_p,
        "do_sample": temperature > 0,
        "pad_token_id": tokenizer.eos_token_id,
    }

    if stream:
        # Streaming generation
        streamer = TextIteratorStreamer(tokenizer, skip_prompt=True, skip_special_tokens=True)
        gen_config["streamer"] = streamer

        # Generate in thread
        thread = Thread(target=model.generate, kwargs={**inputs, **gen_config})
        thread.start()

        # Stream tokens
        for text in streamer:
            if text:
                yield text

        thread.join()
    else:
        # Non-streaming generation
        with torch.no_grad():
            outputs = model.generate(**inputs, **gen_config)

        response = tokenizer.decode(outputs[0][inputs['input_ids'].shape[1]:], skip_special_tokens=True)
        return response

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "model_loaded": model is not None,
        "device": str(device) if device else "unknown"
    }

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Tonny Inference Server",
        "version": "1.0.0",
        "model": "tonny-7b",
        "endpoints": ["/health", "/api/chat", "/api/generate", "/api/tags"]
    }

@app.get("/api/tags")
async def list_models():
    """List available models (Ollama-compatible)"""
    return {
        "models": [
            {
                "name": "tonny",
                "model": "tonny",
                "modified_at": "2025-01-01T00:00:00Z",
                "size": 7_000_000_000,
                "details": {
                    "parent_model": "mistral-7b",
                    "format": "transformers",
                    "family": "mistral",
                    "parameter_size": "7B",
                    "quantization_level": "fp16"
                }
            }
        ]
    }

@app.post("/api/chat")
async def chat(request: ChatRequest):
    """Chat completion endpoint (Ollama-compatible)"""
    try:
        # Format prompt from messages
        prompt = format_chat_prompt(request.messages)

        if request.stream:
            # Stream response
            async def generate_stream():
                for chunk in generate_response(
                    prompt,
                    temperature=request.temperature,
                    max_tokens=request.max_tokens,
                    top_p=request.top_p,
                    stream=True
                ):
                    yield f"data: {chunk}\n\n"
                yield "data: [DONE]\n\n"

            return StreamingResponse(generate_stream(), media_type="text/event-stream")
        else:
            # Non-streaming response
            response = generate_response(
                prompt,
                temperature=request.temperature,
                max_tokens=request.max_tokens,
                top_p=request.top_p,
                stream=False
            )

            return {
                "model": "tonny",
                "created_at": "2025-01-01T00:00:00Z",
                "message": {
                    "role": "assistant",
                    "content": response
                },
                "done": True
            }

    except Exception as e:
        logger.error(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/generate")
async def generate(request: CompletionRequest):
    """Text generation endpoint (Ollama-compatible)"""
    try:
        if request.stream:
            # Stream response
            async def generate_stream():
                for chunk in generate_response(
                    request.prompt,
                    temperature=request.temperature,
                    max_tokens=request.max_tokens,
                    stream=True
                ):
                    yield f"data: {chunk}\n\n"
                yield "data: [DONE]\n\n"

            return StreamingResponse(generate_stream(), media_type="text/event-stream")
        else:
            # Non-streaming response
            response = generate_response(
                request.prompt,
                temperature=request.temperature,
                max_tokens=request.max_tokens,
                stream=False
            )

            return {
                "model": "tonny",
                "created_at": "2025-01-01T00:00:00Z",
                "response": response,
                "done": True
            }

    except Exception as e:
        logger.error(f"Generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

def main():
    parser = argparse.ArgumentParser(description="Tonny Inference Server")
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind to")
    parser.add_argument("--port", type=int, default=11434, help="Port to bind to")
    parser.add_argument("--model-path", default="models/tonny-7b-merged", help="Path to model")

    args = parser.parse_args()

    # Set model path environment variable
    os.environ["MODEL_PATH"] = args.model_path

    # Run server
    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        log_level="info",
        access_log=True
    )

if __name__ == "__main__":
    main()
