# Windows Setup Guide

The Claude Code SDK (and by extension, this Slack bot) **requires a Unix-like environment** and is not compatible with native Windows. However, you can run this project on Windows using **Windows Subsystem for Linux (WSL)**.

## Why WSL is Required

The `@anthropic-ai/claude-code` package depends on Unix-specific features and system calls that are not available in native Windows environments. WSL provides a Linux kernel interface that allows the package to run correctly.

## Setting Up WSL

### Step 1: Install WSL

1. **Open PowerShell as Administrator** and run:
   ```powershell
   wsl --install
   ```

2. **Restart your computer** when prompted.

3. **Choose a Linux distribution** (Ubuntu is recommended):
   ```powershell
   wsl --install -d Ubuntu
   ```

4. **Create a user account** when prompted (username and password).

### Step 2: Install Node.js in WSL

Once WSL is installed and you're in your Linux terminal:

1. **Update package lists:**
   ```bash
   sudo apt update
   sudo apt upgrade -y
   ```

2. **Install Node.js 18+ using nvm (recommended):**
   ```bash
   # Install nvm
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

   # Restart your shell or run:
   source ~/.bashrc

   # Install Node.js
   nvm install 18
   nvm use 18
   nvm alias default 18
   ```

3. **Verify installation:**
   ```bash
   node --version  # Should show v18.x.x or higher
   npm --version   # Should show npm version
   ```

### Step 3: Clone and Setup the Project

1. **Navigate to your project location** (you can access Windows drives via `/mnt/`):
   ```bash
   # Option 1: Work directly in WSL filesystem (recommended for better performance)
   cd ~
   mkdir projects
   cd projects

   # Option 2: Work in Windows filesystem (accessible from Windows File Explorer)
   cd /mnt/d/Git
   ```

2. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/claude-code-slack-bot.git
   cd claude-code-slack-bot
   ```

3. **Install dependencies:**
   ```bash
   npm install
   ```

   **Important:** The installation **must** be run from within the WSL terminal. Running `npm install` from PowerShell, CMD, or Windows Terminal (Windows mode) will fail.

### Step 4: Configure Environment Variables

1. **Copy the example environment file:**
   ```bash
   cp .env.example .env
   ```

2. **Edit the `.env` file** using a text editor:
   ```bash
   nano .env
   # or use vim, or edit from Windows using VSCode
   ```

3. **Set your credentials** as described in the main README.

### Step 5: Run the Bot

```bash
# Development mode
npm run dev

# Production mode
npm run build
npm run prod
```

## Working with WSL

### Accessing WSL Files from Windows

- **WSL filesystem**: Access via `\\wsl$\Ubuntu\home\yourusername\` in Windows File Explorer
- **Windows filesystem**: Access from WSL via `/mnt/c/`, `/mnt/d/`, etc.

### Using VSCode with WSL

1. **Install the "WSL" extension** in VSCode
2. **Open your project in WSL:**
   ```bash
   code .
   ```
3. VSCode will automatically connect to WSL and run all terminals in the Linux environment

### Performance Tips

- **Store your project files in the WSL filesystem** (e.g., `~/projects/`) for better performance
- **Avoid working across filesystems** (Windows ↔ WSL) for intensive operations
- **Use Git from WSL** for better compatibility

## Troubleshooting

### "Error: Claude Code is not supported on Windows"

This error means you're running `npm install` from a Windows terminal (PowerShell/CMD). Solution:

1. Open **WSL terminal** (type `wsl` in PowerShell or use Windows Terminal with Ubuntu profile)
2. Navigate to your project directory
3. Run `npm install` from the WSL terminal

### "command not found: npm" in WSL

You need to install Node.js in WSL. Follow Step 2 above.

### WSL is not installed

If `wsl --install` doesn't work:

1. Check that you're running **Windows 10 version 2004+** or **Windows 11**
2. Enable WSL in Windows Features:
   - Go to Control Panel → Programs → Turn Windows features on or off
   - Enable "Windows Subsystem for Linux"
   - Enable "Virtual Machine Platform"
   - Restart your computer

### Permission issues

If you get permission errors:

```bash
sudo chown -R $USER:$USER .
```

### Port already in use

If the bot can't start due to port conflicts:

1. Check what's using the port:
   ```bash
   lsof -i :3000  # Replace 3000 with your port
   ```
2. Kill the process or change the port in your configuration

### Git line ending issues

Configure Git to handle line endings correctly:

```bash
git config --global core.autocrlf input
```

## Alternative: Docker (Advanced)

If you prefer not to use WSL, you can run the bot in Docker:

```bash
# From Windows PowerShell/CMD
docker build -t claude-slack-bot .
docker run --env-file .env claude-slack-bot
```

Note: You'll need to create a `Dockerfile` for this approach.

## Getting Help

If you encounter issues not covered here:

1. Check the [WSL documentation](https://docs.microsoft.com/en-us/windows/wsl/)
2. Check the [Claude Code documentation](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview)
3. Open an issue on the GitHub repository

## Summary

To run this bot on Windows:

1. ✅ Install WSL (Windows Subsystem for Linux)
2. ✅ Install Node.js 18+ in WSL
3. ✅ Clone and `npm install` from WSL terminal
4. ✅ Configure `.env` file
5. ✅ Run `npm run dev` from WSL

❌ **Cannot** run directly on Windows (PowerShell/CMD)
❌ **Cannot** use native Windows Node.js installation
✅ **Must** use WSL or Docker
