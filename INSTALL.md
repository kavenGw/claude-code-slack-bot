# Installation Guide

This guide covers platform-specific installation instructions for the Claude Code Slack Bot.

## Platform Requirements

Claude Code SDK requires a Unix-like environment:
- ✅ macOS
- ✅ Linux
- ✅ Windows with WSL (Windows Subsystem for Linux)
- ❌ Native Windows (PowerShell/CMD)

## Quick Start

### macOS / Linux

```bash
# Clone the repository
git clone https://github.com/yourusername/claude-code-slack-bot.git
cd claude-code-slack-bot

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your credentials

# Run the bot
npm run dev
```

### Windows (WSL Required)

**⚠️ You MUST use WSL. Native Windows is not supported.**

#### Step 1: Install WSL

Open PowerShell as Administrator:

```powershell
# Install WSL with Ubuntu
wsl --install

# Restart your computer when prompted
```

#### Step 2: Set Up WSL Environment

Open WSL terminal (type `wsl` in PowerShell or use Windows Terminal):

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Node.js using nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc

# Install Node.js 18+
nvm install 18
nvm use 18
nvm alias default 18

# Verify installation
node --version  # Should be v18.x.x or higher
npm --version
```

#### Step 3: Clone and Install

**IMPORTANT: Run these commands in WSL terminal, not Windows PowerShell/CMD**

```bash
# Navigate to your projects directory
cd ~
mkdir -p projects
cd projects

# Clone the repository
git clone https://github.com/yourusername/claude-code-slack-bot.git
cd claude-code-slack-bot

# Install dependencies (MUST be run from WSL)
npm install

# Configure environment
cp .env.example .env
nano .env  # Or use: code .env

# Run the bot
npm run dev
```

## Common Issues

### Issue: "Error: Claude Code is not supported on Windows"

**Cause:** Running `npm install` from Windows PowerShell, CMD, or Windows Terminal (Windows mode)

**Solution:**
1. Open WSL terminal (not PowerShell)
2. Navigate to project directory
3. Run `npm install` from WSL

### Issue: "command not found: npm" in WSL

**Cause:** Node.js not installed in WSL

**Solution:** Follow Step 2 above to install Node.js using nvm

### Issue: Permission denied errors

**Solution:**
```bash
# Fix file ownership
sudo chown -R $USER:$USER ~/projects/claude-code-slack-bot

# Make scripts executable
chmod +x scripts/*.js
```

### Issue: WSL not installed

**Requirements:**
- Windows 10 version 2004+ or Windows 11
- Virtualization enabled in BIOS

**Solution:**
1. Enable Windows features:
   - Open Control Panel → Programs → Turn Windows features on or off
   - Enable "Windows Subsystem for Linux"
   - Enable "Virtual Machine Platform"
2. Restart computer
3. Run `wsl --install` in PowerShell as Administrator

## Verification

After installation, verify everything is working:

```bash
# Check Node.js version
node --version  # Should be 18.x.x or higher

# Check if Claude Code SDK is installed
npm list @anthropic-ai/claude-code

# Check platform compatibility
node scripts/check-platform.js

# Test the bot (after configuring .env)
npm run dev
```

## Environment Configuration

Create a `.env` file with the following variables:

```env
# Required: Slack Configuration
SLACK_BOT_TOKEN=xoxb-your-token
SLACK_APP_TOKEN=xapp-your-token
SLACK_SIGNING_SECRET=your-secret

# Required: Claude API (if not using Bedrock/Vertex)
ANTHROPIC_API_KEY=sk-ant-your-key

# Optional: Alternative API Providers
# CLAUDE_CODE_USE_BEDROCK=1
# CLAUDE_CODE_USE_VERTEX=1

# Optional: Working Directory
# BASE_DIRECTORY=/path/to/your/code

# Optional: Debug Mode
# DEBUG=true
```

## Next Steps

1. Configure your Slack app (see README.md)
2. Set up environment variables
3. Run `npm run dev` to start the bot
4. Test by sending a direct message to the bot in Slack

## Getting Help

- **Windows setup issues:** See [WINDOWS.md](WINDOWS.md)
- **General usage:** See [README.md](README.md)
- **Configuration:** See [CLAUDE.md](CLAUDE.md)
- **Issues:** https://github.com/yourusername/claude-code-slack-bot/issues

## VSCode with WSL

For the best development experience on Windows:

1. Install the "WSL" extension in VSCode
2. Open WSL terminal and navigate to your project
3. Run: `code .`
4. VSCode will reopen connected to WSL
5. All terminals will automatically run in WSL

This gives you:
- Full Linux environment
- Native Windows IDE
- Seamless file editing
- Integrated terminal
