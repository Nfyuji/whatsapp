#!/bin/sh
cd "$(dirname "$0")"
[ -f config.json ] || cp config.example.json config.json
mkdir -p data
pip install -r requirements.txt -q
exec python server.py
