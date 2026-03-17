# /upgrade — Self-Updater Skill

> Version: 1.0.0 | Phase: 5

## Purpose
Keep Solti up to date. Check for new versions, pull changes, validate integrity, and optionally restart services. Designed to run safely without breaking the user's configuration or custom context files.

## Modes

### MODE 1: CHECK
Check if a new version is available without making any changes.

**Flow:**
1. Read current version from `VERSION` file
2. Query remote repository for latest release tag
3. Compare semver versions
4. Show changelog summary if update available
5. Report status (up-to-date / update available / major update warning)

**Usage:**
```
/upgrade CHECK
→ Solti v1.0.0 — up to date ✅
→ Solti v1.0.0 → v1.1.0 available (3 new skills, 12 bug fixes)
```

### MODE 2: UPDATE
Download and apply the latest update.

**Flow:**
1. Run CHECK mode first (show what will change)
2. Confirm with user before proceeding
3. Create backup of current installation
4. Pull changes from remote (git pull or download release)
5. Preserve user files (context/, memory/, args/, .env*)
6. Run post-update validation (scripts still executable, hooks intact)
7. Update VERSION file
8. Show migration notes if any

**Usage:**
```
/upgrade UPDATE
→ Updating Solti v1.0.0 → v1.1.0...
→ Backed up to .tmp/backup-1.0.0/
→ Downloaded and applied 47 changed files
→ Protected files: context/ (4), memory/ (2), args/ (1)
→ ✅ Update complete. Run /audit to verify system health.
```

### MODE 3: ROLLBACK
Revert to the previous version if an update caused issues.

**Flow:**
1. Check if a backup exists in `.tmp/backup-*/`
2. Show what will be reverted
3. Confirm with user
4. Restore from backup
5. Validate integrity
6. Report result

**Usage:**
```
/upgrade ROLLBACK
→ Reverting to backup from v1.0.0 (2026-03-15)...
→ Restored 47 files
→ ✅ Rollback complete. Current version: v1.0.0
```

### MODE 4: STATUS
Show current installation health and version info.

**Flow:**
1. Read VERSION file
2. Check all skills are present and have SKILL.md
3. Verify hooks are executable
4. Verify bin/ scripts are executable
5. Check Hub connection status
6. Report system overview

**Usage:**
```
/upgrade STATUS
→ Solti v1.0.0 | 16 skills | 4 hooks | Hub: connected
→ Last updated: 2026-03-15
→ All components healthy ✅
```

## Protected Files (Never Overwritten)

These user files are **always preserved** during updates:

```
context/my-business.md
context/my-voice.md
context/my-icp.md
context/my-offer.md
args/preferences.yaml
memory/MEMORY.md
memory/logs/*
.env*
.mcp.json
data/*
```

## Technical Notes

- Uses git if available (preferred), falls back to GitHub releases API
- Backup stored in `.tmp/backup-{version}/` with timestamp
- Semver comparison: patch (auto-suggest) / minor (recommend) / major (warn + require confirmation)
- Post-update hook runs `validate_output.py` on all scripts to verify integrity
- The `bin/solti-update-check` runs a lightweight CHECK automatically on session start (24h cache)

## Dependencies
- Git (preferred) or curl/wget for release downloads
- GitHub API access (public, no token needed)

## Safety Rules
- NEVER overwrite user context, memory, or preferences
- ALWAYS create a backup before updating
- ALWAYS confirm with user before applying changes
- Major version updates (e.g., 1.x → 2.x) require explicit user acknowledgment
- If post-update validation fails, automatically trigger ROLLBACK
- Never update while a campaign or job is actively running
