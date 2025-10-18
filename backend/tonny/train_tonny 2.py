#!/usr/bin/env python3
"""
Tonny Fine-Tuning Script using MLX
Train a compliance-focused LLM for Tonsurance Telegram bot

Requirements:
- pip install mlx mlx-lm huggingface_hub
- macOS with Apple Silicon (M1/M2/M3)

Usage:
1. Download base model: python train_tonny.py --download
2. Fine-tune: python train_tonny.py --train
3. Convert to GGUF: python train_tonny.py --convert
4. Create Ollama model: python train_tonny.py --ollama
"""

import argparse
import os
import subprocess
import json
from pathlib import Path


# Configuration
BASE_MODEL = "mistralai/Mistral-7B-Instruct-v0.3"
MODELS_DIR = Path("./models")
ADAPTERS_DIR = Path("./adapters")
TRAINING_DATA = Path("./training_data/tonny_training.jsonl")
OUTPUT_MODEL = "tonny-7b"

# Training hyperparameters
TRAINING_CONFIG = {
    "iters": 1000,
    "learning_rate": 1e-5,
    "lora_layers": 16,
    "lora_rank": 8,
    "batch_size": 4,
    "warmup_steps": 100,
}

# GGUF quantization settings
GGUF_QUANT = "q4_k_m"  # Good balance of quality and size


def download_base_model():
    """Download and convert base model to MLX format"""
    print(f"📥 Downloading base model: {BASE_MODEL}")

    mlx_model_path = MODELS_DIR / "mistral-7b"
    mlx_model_path.mkdir(parents=True, exist_ok=True)

    cmd = [
        "python", "-m", "mlx_lm.convert",
        "--hf-path", BASE_MODEL,
        "--mlx-path", str(mlx_model_path),
    ]

    print(f"Running: {' '.join(cmd)}")
    subprocess.run(cmd, check=True)
    print(f"✅ Model downloaded to {mlx_model_path}")


def validate_training_data():
    """Validate JSONL training data format"""
    print(f"🔍 Validating training data: {TRAINING_DATA}")

    if not TRAINING_DATA.exists():
        raise FileNotFoundError(f"Training data not found: {TRAINING_DATA}")

    with open(TRAINING_DATA) as f:
        lines = f.readlines()

    print(f"Found {len(lines)} training examples")

    # Validate JSON format
    for i, line in enumerate(lines, 1):
        try:
            data = json.loads(line)
            if "messages" not in data:
                raise ValueError(f"Line {i}: Missing 'messages' field")

            messages = data["messages"]
            if not isinstance(messages, list) or len(messages) < 2:
                raise ValueError(f"Line {i}: 'messages' must be a list with at least 2 items")

        except json.JSONDecodeError as e:
            raise ValueError(f"Line {i}: Invalid JSON - {e}")

    print("✅ Training data validated")
    return len(lines)


def fine_tune_model():
    """Fine-tune model with LoRA using MLX"""
    print(f"🎓 Fine-tuning Tonny on {TRAINING_DATA}")

    # Validate training data first
    num_examples = validate_training_data()

    mlx_model_path = MODELS_DIR / "mistral-7b"
    adapter_path = ADAPTERS_DIR / "tonny"
    adapter_path.parent.mkdir(parents=True, exist_ok=True)

    if not mlx_model_path.exists():
        raise FileNotFoundError(
            f"Base model not found at {mlx_model_path}. "
            "Run with --download first."
        )

    cmd = [
        "python", "-m", "mlx_lm.lora",
        "--model", str(mlx_model_path),
        "--train",
        "--data", str(TRAINING_DATA),
        "--iters", str(TRAINING_CONFIG["iters"]),
        "--learning-rate", str(TRAINING_CONFIG["learning_rate"]),
        "--lora-layers", str(TRAINING_CONFIG["lora_layers"]),
        "--adapter-file", str(adapter_path),
        "--batch-size", str(TRAINING_CONFIG["batch_size"]),
        "--warmup-steps", str(TRAINING_CONFIG["warmup_steps"]),
    ]

    print(f"Running: {' '.join(cmd)}")
    print(f"Training on {num_examples} examples...")
    subprocess.run(cmd, check=True)
    print(f"✅ LoRA adapter saved to {adapter_path}")


def merge_lora_adapter():
    """Merge LoRA adapter with base model"""
    print("🔀 Merging LoRA adapter with base model")

    mlx_model_path = MODELS_DIR / "mistral-7b"
    adapter_path = ADAPTERS_DIR / "tonny"
    merged_path = MODELS_DIR / f"{OUTPUT_MODEL}-merged"
    merged_path.mkdir(parents=True, exist_ok=True)

    cmd = [
        "python", "-m", "mlx_lm.fuse",
        "--model", str(mlx_model_path),
        "--adapter-file", str(adapter_path),
        "--save-path", str(merged_path),
    ]

    print(f"Running: {' '.join(cmd)}")
    subprocess.run(cmd, check=True)
    print(f"✅ Merged model saved to {merged_path}")
    return merged_path


def convert_to_gguf(merged_path):
    """Convert merged model to GGUF format for Ollama"""
    print(f"📦 Converting to GGUF format ({GGUF_QUANT})")

    gguf_output = Path(f"./{OUTPUT_MODEL}-{GGUF_QUANT}.gguf")

    # Check if llama.cpp convert script is available
    try:
        import gguf
        print("✅ gguf package found")
    except ImportError:
        print("Installing gguf package...")
        subprocess.run(["pip", "install", "gguf"], check=True)

    # Use llama.cpp conversion script
    # You may need to clone llama.cpp repo first:
    # git clone https://github.com/ggerganov/llama.cpp
    llama_cpp_dir = Path.home() / "llama.cpp"

    if not llama_cpp_dir.exists():
        print("⚠️  llama.cpp not found. Cloning repository...")
        subprocess.run([
            "git", "clone",
            "https://github.com/ggerganov/llama.cpp",
            str(llama_cpp_dir)
        ], check=True)

    convert_script = llama_cpp_dir / "convert-hf-to-gguf.py"

    cmd = [
        "python", str(convert_script),
        str(merged_path),
        "--outfile", str(gguf_output),
        "--outtype", GGUF_QUANT,
    ]

    print(f"Running: {' '.join(cmd)}")
    subprocess.run(cmd, check=True)
    print(f"✅ GGUF model saved to {gguf_output}")
    return gguf_output


def create_ollama_model(gguf_path):
    """Create Ollama model from GGUF file"""
    print("🤖 Creating Ollama model")

    # Create Modelfile
    modelfile_content = f"""FROM ./{gguf_path.name}

SYSTEM You are Tonny 🤖, the friendly AI assistant for Tonsurance - a parametric risk coverage protocol on TON blockchain.

COMPLIANCE RULES (CRITICAL):
- NEVER use 'insurance', 'insure', 'insured', or 'insurer'
- ALWAYS say 'parametric risk coverage' or 'risk protection'
- Say 'coverage contracts' not 'policies'
- Say 'coverage providers' not 'insurers'
- Pricing is DYNAMIC - always fetch live rates, NEVER quote fixed APR

Your knowledge:
- Tonsurance provides automated parametric coverage for depeg, smart contract, oracle, and bridge risks
- Coverage is 100% collateralized in 6-tier risk vaults
- Claims are automatic (no paperwork) via oracle consensus
- Payouts execute in 5-10 minutes
- Built on TON blockchain with TON Connect wallet integration

Be helpful, friendly, and technically accurate! 🚀

PARAMETER temperature 0.7
PARAMETER top_p 0.9
PARAMETER top_k 40
PARAMETER repeat_penalty 1.1
"""

    modelfile_path = Path("./Modelfile")
    with open(modelfile_path, "w") as f:
        f.write(modelfile_content)

    print(f"Created Modelfile at {modelfile_path}")

    # Create Ollama model
    cmd = ["ollama", "create", "tonny", "-f", str(modelfile_path)]
    print(f"Running: {' '.join(cmd)}")
    subprocess.run(cmd, check=True)

    print("✅ Ollama model 'tonny' created!")
    print("\nTest it with:")
    print('  ollama run tonny "What is Tonsurance?"')


def test_model():
    """Test the trained model"""
    print("🧪 Testing Tonny model...")

    test_prompts = [
        "What is Tonsurance?",
        "Is the APR always 0.8%?",
        "How do claims work?",
    ]

    for prompt in test_prompts:
        print(f"\n👤 User: {prompt}")
        result = subprocess.run(
            ["ollama", "run", "tonny", prompt],
            capture_output=True,
            text=True,
        )
        print(f"🤖 Tonny: {result.stdout}")


def main():
    parser = argparse.ArgumentParser(
        description="Train Tonny fine-tuned model with MLX"
    )
    parser.add_argument(
        "--download",
        action="store_true",
        help="Download and convert base model to MLX format"
    )
    parser.add_argument(
        "--train",
        action="store_true",
        help="Fine-tune model with LoRA"
    )
    parser.add_argument(
        "--convert",
        action="store_true",
        help="Convert to GGUF format"
    )
    parser.add_argument(
        "--ollama",
        action="store_true",
        help="Create Ollama model"
    )
    parser.add_argument(
        "--test",
        action="store_true",
        help="Test the trained model"
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Run full pipeline: download → train → convert → ollama"
    )

    args = parser.parse_args()

    try:
        if args.all:
            download_base_model()
            fine_tune_model()
            merged_path = merge_lora_adapter()
            gguf_path = convert_to_gguf(merged_path)
            create_ollama_model(gguf_path)
            test_model()
        else:
            if args.download:
                download_base_model()

            if args.train:
                fine_tune_model()
                merge_lora_adapter()

            if args.convert:
                merged_path = MODELS_DIR / f"{OUTPUT_MODEL}-merged"
                gguf_path = convert_to_gguf(merged_path)

            if args.ollama:
                gguf_files = list(Path(".").glob(f"{OUTPUT_MODEL}-*.gguf"))
                if not gguf_files:
                    raise FileNotFoundError("No GGUF file found. Run --convert first.")
                create_ollama_model(gguf_files[0])

            if args.test:
                test_model()

        print("\n✅ All done!")

    except Exception as e:
        print(f"\n❌ Error: {e}")
        return 1

    return 0


if __name__ == "__main__":
    exit(main())
