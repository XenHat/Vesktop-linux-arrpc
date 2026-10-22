#!/bin/env bash
# Simple script to build a local appimage for self-developers
rm -rf dist
pnpm install
pnpm approve-builds
pnpm buildLibVesktop
pnpm build
pnpm package --linux appimage
