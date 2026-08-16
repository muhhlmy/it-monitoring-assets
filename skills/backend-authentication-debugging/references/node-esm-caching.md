# Node.js ESM Module Caching Behavior & Solutions

## The Problem

Node.js ESM has aggressive module caching that persists across process restarts in some environments. Changes to source files may not be reflected unless:

1. **Same shell session** - If you kill node and restart it in the same bash/shell, the module cache can persist
2. **Cache directory usage** - Node may use disk-based cache (`node_modules/.cache`)  
3. **Watchers interfering** - Development watchers might keep old modules loaded

## Symptoms

- Console.log statements from updated code never appear
- File content changes don't affect runtime behavior
- Restarting node process shows no difference
- Test scripts work but HTTP requests fail

## Solutions

### Solution 1: Full Shell Restart (Most Reliable) ⭐ RECOMMENDED

The only way to guarantee fresh module loading is to exit the entire bash/shell session:

```bash
# Exit current shell
exit

# Start completely new terminal/bash session
cd /c/Users/Helmy/Documents/Magang/Projects/it-monitoring-assets/backend
node src/server.js
```

### Solution 2: Clear Node Cache Directory

```bash
rm -rf node_modules/.cache/*
```

### Solution 3: Use NODE_ENV to Force Fresh Load

```bash
NODE_ENV=development node src/server.js
```

### Solution 4: Windows-Specific - Use PowerShell or CMD

MSYS2/git-bash on Windows has known issues with module path translation. Try running Node.js natively:

```powershell
# PowerShell
cd C:\Users\Helmy\Documents\Magang\Projects\it-monitoring-assets\backend
node src\server.js

# Or CMD
cd /d C:\Users\Helmy\Documents\Magang\Projects\it-monitoring-assets\backend
node src\server.js
```

## Why This Matters for Backend Debugging

When debugging auth/login issues:
1. **File updates look correct** but server uses cached version
2. **Console.log debugging becomes impossible** because old code runs silently
3. **Error traces are misleading** showing line numbers from old code

Always verify you're actually running updated code by:
- Adding a unique string to log message
- Checking file timestamp matches modification time
- Using full shell restart as standard practice

## Environment Notes

- **Windows + MSYS2**: Most problematic due to path translation `/c/...` → `C:\c\...`
- **Linux/macOS**: Generally cleaner ESM handling
- **Docker containers**: Container rebuild needed for true freshness

## Related Issues

See also: `windows-path-notes.md` for fs path translation problems when logging errors.
