WorkTrace expects local Whisper assets in this folder for voice commands.

Required files for the v1 voice command sidecar:

- `whisper-cli.exe` from a Windows whisper.cpp build
- `ggml-base.bin` Whisper base model

The app does not download these files or use cloud transcription. If either file is missing, the voice command API returns a setup error and spoken announcements continue to work.
