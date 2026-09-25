# Agent Instructions

Project: sickos-league
Wiki: ~/wiki/projects/sickos-league/index.md

## Before every task
1. Read ~/wiki/index.md
2. Read ~/wiki/projects/sickos-league/index.md and linked files as needed
3. Read the relevant context file (local / homelab / vps-quasar)
4. Read linked files from ~/wiki/system/ and ~/wiki/patterns/ as needed

## During every task
- Follow every rule with `status: active`
- Skip files with `status: deprecated`
- Flag files with `status: draft` for review before acting on them
- Do not silently ignore a rule
- Flag conflicts before writing code

## After every task
- Update ~/wiki/projects/sickos-league/ (decisions.md, deploy.md, known-issues.md, apis.md)
- Update any ~/wiki/system/ file touched by the change
- If you created a pattern not in the wiki, write a new atomic note marked `status: draft`
- Update ~/wiki/index.md if you created a new file
- If unsure where a note belongs, append to ~/wiki/system/scratch.md
