#!/usr/bin/env python3
"""
Tonny MLX Model Server
Serves the fine-tuned Tonny model via HTTP API compatible with Ollama format
"""

import json
import argparse
from flask import Flask, request, jsonify
from mlx_lm import load, generate

app = Flask(__name__)

# Global model and tokenizer
model = None
tokenizer = None
model_path = None

COMPLIANCE_SYSTEM_PROMPT = """You are Tonny, the AI assistant for Tonsurance - a parametric risk coverage protocol on TON blockchain.

CRITICAL COMPLIANCE RULES:
1. NEVER use "insurance" terminology - always use "parametric risk coverage"
2. NEVER quote fixed APR - always check live dynamic pricing via the pricing API
3. Use clear, friendly language with appropriate emojis
4. Focus on automation, smart contracts, and blockchain transparency

COVERAGE TYPES:
- Stablecoin Depeg Events (USDT, USDC depeg below $0.95)
- Smart Contract Exploits (automatic payouts on verified hacks)
- Oracle Failures (Chainlink, Pyth network downtime)
- Bridge Security (9 major cross-chain bridges monitored)

KEY FEATURES:
- Parametric triggers (no claims process, automatic payouts in 5-10 min)
- Coverage NFTs (ERC-721 on TON blockchain)
- Dynamic pricing (real-time risk-based rates)
- Decentralized (no KYC, fully on-chain)
- 150-250% collateralization in multi-tranche vaults

When users ask about pricing, ALWAYS respond: "Let me check live rates for you! Use /quote [amount] [days] [type] to get current pricing."

Be helpful, technically accurate, and compliance-focused! 🤖"""


def load_model(path):
    """Load the MLX model and tokenizer"""
    global model, tokenizer, model_path
    print(f"Loading model from {path}...")
    model, tokenizer = load(path)
    model_path = path
    print("Model loaded successfully!")


def format_prompt(user_message, system_prompt=COMPLIANCE_SYSTEM_PROMPT):
    """Format prompt in Mistral instruction format"""
    # Mistral format: <s>[INST] System\nUser [/INST]
    return f"<s>[INST] {system_prompt}\n\n{user_message} [/INST]"


@app.route('/api/generate', methods=['POST'])
def generate_response():
    """Ollama-compatible /api/generate endpoint"""
    try:
        data = request.json
        prompt = data.get('prompt', '')

        # Extract user message (OCaml sends full prompt)
        if '[INST]' in prompt:
            # Already formatted, use as-is
            formatted_prompt = prompt
        else:
            # Format with system prompt
            formatted_prompt = format_prompt(prompt)

        # Generate response
        response_text = generate(
            model,
            tokenizer,
            prompt=formatted_prompt,
            max_tokens=data.get('max_tokens', 512),
            verbose=False
        )

        # Extract only the assistant's response (remove prompt echo)
        if '[/INST]' in response_text:
            response_text = response_text.split('[/INST]')[-1].strip()

        # Remove any trailing </s> token
        response_text = response_text.replace('</s>', '').strip()

        return jsonify({
            'model': 'tonny',
            'created_at': '',
            'response': response_text,
            'done': True
        })

    except Exception as e:
        print(f"Error generating response: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/chat', methods=['POST'])
def chat():
    """Ollama-compatible /api/chat endpoint"""
    try:
        data = request.json
        messages = data.get('messages', [])

        # Build conversation from messages
        conversation = ""
        system_prompt = COMPLIANCE_SYSTEM_PROMPT

        for msg in messages:
            role = msg.get('role')
            content = msg.get('content', '')

            if role == 'system':
                system_prompt = content
            elif role == 'user':
                conversation = content  # Use last user message

        # Format prompt
        formatted_prompt = format_prompt(conversation, system_prompt)

        # Generate response
        response_text = generate(
            model,
            tokenizer,
            prompt=formatted_prompt,
            max_tokens=data.get('max_tokens', 512),
            verbose=False
        )

        # Extract only the assistant's response
        if '[/INST]' in response_text:
            response_text = response_text.split('[/INST]')[-1].strip()
        response_text = response_text.replace('</s>', '').strip()

        return jsonify({
            'model': 'tonny',
            'created_at': '',
            'message': {
                'role': 'assistant',
                'content': response_text
            },
            'done': True
        })

    except Exception as e:
        print(f"Error in chat: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/tags', methods=['GET'])
def list_models():
    """Ollama-compatible /api/tags endpoint"""
    return jsonify({
        'models': [{
            'name': 'tonny:latest',
            'model': 'tonny',
            'modified_at': '',
            'size': 4000000000,  # ~4GB
            'digest': '',
            'details': {
                'format': 'mlx',
                'family': 'mistral',
                'families': ['mistral'],
                'parameter_size': '7B',
                'quantization_level': '4bit'
            }
        }]
    })


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'model_loaded': model is not None,
        'model_path': model_path
    })


def main():
    parser = argparse.ArgumentParser(description='Tonny MLX Model Server')
    parser.add_argument(
        '--model-path',
        type=str,
        default='training_data/models/tonny-7b-merged',
        help='Path to the MLX model directory'
    )
    parser.add_argument(
        '--port',
        type=int,
        default=11434,
        help='Port to run server on (default: 11434 for Ollama compatibility)'
    )
    parser.add_argument(
        '--host',
        type=str,
        default='127.0.0.1',
        help='Host to bind to'
    )

    args = parser.parse_args()

    # Load model on startup
    load_model(args.model_path)

    # Run server
    print(f"Starting Tonny server on {args.host}:{args.port}")
    print(f"Compatible with Ollama API format")
    print(f"Endpoints: /api/generate, /api/chat, /api/tags, /health")

    app.run(host=args.host, port=args.port, debug=False)


if __name__ == '__main__':
    main()
