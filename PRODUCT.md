# TokenTray
<!-- impeccable:product-schema 1 -->

## Platform
Windows desktop (Tauri WebView2).

## Stack
Delegated by the user for research and selection: Rust, Tauri 2, plain HTML/CSS/JavaScript. Reuse the MIT CodeNotch Windows provider implementation where practical.

## Users and purpose
The user wants to inspect AI agent usage allowances from a Windows taskbar notification-area icon. Clicking opens a compact popup inspired by CodeNotch.

## Capabilities and constraints
User confirmed all eight README providers: Claude Code, Codex, Cursor, Antigravity, GLM, Grok, OpenCode Go, GitHub Copilot. Public MIT-licensed GitHub repository. Credential data stays local to native adapters. Account quotas and derived activity counts must be distinguished. Missing data must remain visibly unavailable.

## Brand commitments
User selected TokenTray after initially choosing AgentGauge. Use CodeNotch's compact usage presentation with the user's requested Windows Acrylic material.

## Open decisions
Code signing, an installer, automatic updates, multi-account support, and activity hooks are future scope. Public distribution is unsigned portable executables published as GitHub releases.

