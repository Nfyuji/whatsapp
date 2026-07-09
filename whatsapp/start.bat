@echo off
cd /d "%~dp0"
if not exist config.json copy config.example.json config.json
if not exist data mkdir data
pip install -r requirements.txt -q
echo Starting WhatsApp Reports on http://localhost:8090
python server.py
