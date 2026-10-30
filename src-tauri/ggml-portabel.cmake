# Wird vor jedem project() von whisper.cpp/ggml eingelesen (Windows- und macOS-Build):
# nicht für die CPU des Build-Servers optimieren, sondern für alle üblichen PCs (AVX2) bzw. Macs (Apple M1 und neuer).
set(GGML_NATIVE OFF CACHE BOOL "" FORCE)
