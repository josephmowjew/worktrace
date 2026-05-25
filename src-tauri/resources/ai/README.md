WorkTrace report intelligence is offline-first.

Planned local runtime assets:

- `llama-server.exe` from a Windows llama.cpp build
- a report model in GGUF format, preferably a Qwen-family instruct model quantized for local use

The first implementation can also use a user-configured local GGUF model path. Online providers are optional and require user-supplied API keys stored in OS credential storage.
