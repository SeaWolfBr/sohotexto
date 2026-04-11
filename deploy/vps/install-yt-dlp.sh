#!/usr/bin/env bash
set -euo pipefail

echo "[1/4] Atualizando indice de pacotes..."
sudo apt update

echo "[2/4] Instalando python3-pip..."
sudo apt install -y python3-pip

echo "[3/4] Instalando/atualizando yt-dlp..."
sudo python3 -m pip install -U yt-dlp --break-system-packages

echo "[4/4] Validando instalacao..."
python3 -m yt_dlp --version

echo
echo "yt-dlp instalado com sucesso."
echo "Agora revise o .env da aplicacao e reinicie o service:"
echo "  sudo systemctl restart justext"
echo "  sudo journalctl -u justext -f"
