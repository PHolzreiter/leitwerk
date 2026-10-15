# Wird vor jedem project() von whisper.cpp/ggml eingelesen (nur Windows-Build):
# nicht für die CPU des Build-Servers optimieren, sondern für alle üblichen PCs (AVX2).
set(GGML_NATIVE OFF CACHE BOOL "" FORCE)
