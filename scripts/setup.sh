#!/usr/bin/env bash
set -e

cd "$(dirname "$0")/.."

# Populate the viv submodule (possibly/viv, browser/runtime branch)
if [ ! -f viv/package.json ]; then
  echo "Initializing viv submodule..."
  git submodule update --init
fi

# Build the browser runtime bundle into shared/viv-runtime.js
if [ ! -f shared/viv-runtime.js ]; then
  echo "Building browser runtime..."
  make runtime
fi

# Install the Viv compiler
if ! command -v vivc &>/dev/null; then
  echo "Installing Viv compiler..."
  pip3 install viv-compiler
fi

echo "Setup complete. vivc: $(vivc --version)"
