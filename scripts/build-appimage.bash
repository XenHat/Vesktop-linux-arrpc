#!/bin/env bash
# Simple script to build a local appimage for self-developers
pnpm install
pnpm approve-builds
pnpm buildLibVesktop
pnpm build
pnpm package --linux appimage
