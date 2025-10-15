# Tonny Deployment Guide

## Summary

Tonny is now fully trained and ready for production deployment to Hetzner.

### What's Completed ✅

1. **Model Training**
   - Base: Mistral-7B-Instruct-v0.2-4bit
   - Fine-tuned: 500 iterations with LoRA
   - Loss: 3.098 → 0.070 (98% reduction)
   - Size: 4GB (4-bit quantized)

2. **Compliance Testing**
   - ✅ Uses "parametric risk coverage" not "insurance"
   - ✅ Redirects pricing to /quote command
   - ✅ Converts user "insurance" questions appropriately

3. **Server Implementation**
   - Flask API with Ollama-compatible endpoints
   - Running on port 8888
   - Health check at /health
   - API at /api/generate and /api/chat

4. **Deployment Artifacts**
   - systemd service file (deploy/tonny.service)
   - Automated deployment script (deploy/deploy.sh)
   - Requirements.txt for dependencies
   - .env.example for configuration

## Quick Deployment to Hetzner

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env with your credentials

# 2. Deploy to server (replace with your server)
./deploy/deploy.sh your-hetzner-ip root

# 3. Verify deployment
ssh root@your-hetzner-ip
systemctl status tonny
curl http://localhost:8888/health
```

## Local Testing

```bash
# Start server locally
python3 tonny_server.py \
  --model-path training_data/models/tonny-7b-merged \
  --port 8888

# Test in another terminal
curl http://localhost:8888/health

curl -X POST http://localhost:8888/api/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What is Tonsurance?", "max_tokens": 300}'
```

## Integration with OCaml Bot

The OCaml bot in `tonny_bot.ml` is already configured to connect to Tonny:

```ocaml
ollama_config = {
  api_url = "http://localhost:8888";  (* or your Hetzner server *)
  model_name = "tonny";
  max_tokens = 300;
  timeout_seconds = 30.0;
}
```

Update the `TONNY_API_URL` environment variable to point to your deployed server.

## File Locations

**On Hetzner after deployment:**
- Service: `/etc/systemd/system/tonny.service`
- Application: `/opt/tonny/`
- Model: `/opt/tonny/training_data/models/tonny-7b-merged/`
- Logs: `journalctl -u tonny -f`

**Locally:**
- Server: `tonny_server.py`
- Model: `training_data/models/tonny-7b-merged/`
- Adapters: `adapters/tonny/`
- Training data: `training_data/*.jsonl`

## Next Steps

1. **Deploy to Hetzner**: Run `./deploy/deploy.sh your-server root`
2. **Set Environment Variables**: Configure `.env` with Telegram token and TON addresses
3. **Build OCaml Bot**: Run `dune build` in the tonny directory
4. **Start OCaml Bot**: Run `dune exec tonny_bot`
5. **Test End-to-End**: Send `/tonny What is Tonsurance?` in Telegram

## Monitoring

```bash
# View logs
journalctl -u tonny -f

# Check resource usage
htop  # Look for python3 tonny_server.py

# Test health
watch -n 5 'curl -s http://localhost:8888/health | python3 -m json.tool'
```

## Troubleshooting

**Issue**: "Port 8888 already in use"
```bash
lsof -i :8888
kill -9 <PID>
systemctl restart tonny
```

**Issue**: "Model not found"
```bash
ls -lh /opt/tonny/training_data/models/tonny-7b-merged/
# Should show model.safetensors ~4GB
```

**Issue**: "Memory errors"
```bash
# Tonny requires ~5GB RAM minimum
free -h
# Consider upgrading server if <6GB available
```

## Production Considerations

1. **HTTPS**: Put nginx reverse proxy in front (not included)
2. **Rate Limiting**: Add rate limiting to prevent abuse
3. **Monitoring**: Set up Prometheus/Grafana metrics
4. **Backups**: Backup training data and adapters
5. **Updates**: Keep MLX and dependencies updated

## Support

For issues:
- Check logs: `journalctl -u tonny -n 100`
- Test health: `curl http://localhost:8888/health`
- Verify model: `ls -lh training_data/models/tonny-7b-merged/`

---

**Status**: ✅ Ready for Production Deployment
**Last Updated**: October 14, 2025
