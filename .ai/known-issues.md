# Known Issues & Workarounds

## 1. External Daemon Availability
- **Issue**: Qdrant or Ollama may not be running when running initial tests or in lean developer environments.
- **Handling**: The system gracefully handles unavailable vector or embedding services:
  - Exact symbol search and MySQL FULLTEXT keyword search continue operating seamlessly.
  - Informative warnings are logged with clear instructions to start Ollama (`ollama serve`) or Qdrant.

## 2. Windows Path Handling
- **Issue**: Backslashes vs forward slashes in Windows file paths.
- **Handling**: All relative and absolute paths are normalized with POSIX-style forward slashes (`path.posix.normalize`) to ensure cross-platform compatibility across Windows and Linux.
