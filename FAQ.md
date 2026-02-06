# Frequently Asked Questions (FAQ)

## Platform & Installation

### Q: Can I run this on Windows?

**A:** Not natively. You must use WSL (Windows Subsystem for Linux). The Claude Code SDK requires a Unix-like environment and will not work with native Windows (PowerShell, CMD, or Windows Terminal in Windows mode).

See the [Windows Setup Guide](WINDOWS.md) for complete instructions.

### Q: I get "Error: Claude Code is not supported on Windows" when running npm install

**A:** This error means you're trying to install from a Windows terminal instead of WSL.

**Solution:**
1. Install WSL: Open PowerShell as Administrator and run `wsl --install`
2. Restart your computer
3. Open WSL terminal (type `wsl` in PowerShell)
4. Navigate to your project directory
5. Run `npm install` from the WSL terminal

### Q: How do I know if I'm in WSL or Windows?

**A:** Run this command:
```bash
uname -a
```

- **WSL**: Shows "Linux" and contains "Microsoft" or "WSL"
- **Windows**: Command not found (PowerShell/CMD don't have `uname`)

You can also check your prompt:
- **WSL**: Usually shows `username@hostname:~$`
- **Windows**: Shows `C:\` or `PS C:\`

### Q: Can I use Docker instead of WSL?

**A:** Yes, but WSL is recommended. If you prefer Docker:

1. Create a `Dockerfile`:
```dockerfile
FROM node:18
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["npm", "run", "dev"]
```

2. Run with:
```bash
docker build -t claude-slack-bot .
docker run --env-file .env claude-slack-bot
```

### Q: What about macOS or Linux?

**A:** Both work perfectly without any additional setup. Just:
```bash
npm install
npm run dev
```

## WSL Specific

### Q: Should I store my project files in WSL or Windows?

**A:** For best performance, store them in the WSL filesystem:

✅ **Recommended** (WSL filesystem):
```bash
cd ~
mkdir projects
cd projects
git clone ...
```

❌ **Not recommended** (Windows filesystem via /mnt):
```bash
cd /mnt/c/Users/yourname/Documents
git clone ...
```

The WSL filesystem is much faster for Node.js operations.

### Q: Can I edit files in VSCode while they're in WSL?

**A:** Yes! This is the recommended setup:

1. Install the "WSL" extension in VSCode
2. In WSL terminal: `cd your-project && code .`
3. VSCode will reopen connected to WSL
4. Edit files normally, terminals will run in WSL automatically

### Q: How do I access my WSL files from Windows File Explorer?

**A:** Navigate to `\\wsl$\Ubuntu\home\yourusername\` in File Explorer.

Or from WSL, run:
```bash
explorer.exe .
```

### Q: Node.js is installed on Windows but not in WSL

**A:** Windows and WSL have separate environments. You need to install Node.js in WSL:

```bash
# In WSL terminal
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18
```

## Configuration

### Q: Where do I get my Slack tokens?

**A:**
1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Create or select your app
3. **Bot Token**: OAuth & Permissions → Bot User OAuth Token (starts with `xoxb-`)
4. **App Token**: Basic Information → App-Level Tokens → Generate with `connections:write` scope (starts with `xapp-`)
5. **Signing Secret**: Basic Information → Signing Secret

### Q: Do I need an Anthropic API key?

**A:** It depends:

- **With Claude Pro/API subscription**: Yes, set `ANTHROPIC_API_KEY`
- **With AWS Bedrock**: No, set `CLAUDE_CODE_USE_BEDROCK=1` and configure AWS credentials
- **With Google Vertex**: No, set `CLAUDE_CODE_USE_VERTEX=1` and configure GCP credentials

### Q: What is BASE_DIRECTORY used for?

**A:** It's optional. If set (e.g., `BASE_DIRECTORY=/Users/you/Code/`), you can use short project names:

- `cwd my-project` → resolves to `/Users/you/Code/my-project`
- `cwd /absolute/path` → still works as absolute path

Without it, you must always use absolute paths.

## Usage

### Q: How do I set the working directory?

**A:** Send a message to the bot:
```
cwd /path/to/your/project
```

Or if you configured BASE_DIRECTORY:
```
cwd project-name
```

### Q: Can different channels use different projects?

**A:** Yes! Each channel has its own default working directory. When you add the bot to a channel, it asks for the directory. You can also override it in specific threads.

### Q: How do I check my current working directory?

**A:** Send:
```
cwd
```
or
```
get directory
```

### Q: Can I upload images for Claude to analyze?

**A:** Yes! Just drag and drop an image into Slack and add a message describing what you want Claude to do with it.

Supported formats: JPG, PNG, GIF, WebP, SVG

### Q: What about uploading code files?

**A:** Yes, text files (code, markdown, JSON, etc.) are automatically embedded into the prompt for Claude to analyze.

## MCP (Model Context Protocol)

### Q: What are MCP servers?

**A:** MCP servers extend Claude's capabilities with external tools like:
- Filesystem access
- GitHub API integration
- Database connections
- Web search

### Q: How do I set up MCP servers?

**A:**
1. Copy the example: `cp mcp-servers.example.json mcp-servers.json`
2. Edit `mcp-servers.json` with your server configurations
3. Restart the bot

### Q: How do I reload MCP configuration without restarting?

**A:** Send this message to the bot:
```
mcp reload
```

### Q: How do I see which MCP servers are configured?

**A:** Send:
```
mcp
```
or
```
servers
```

## Troubleshooting

### Q: Bot responds slowly or times out

**A:** Check your Claude API rate limits and ensure:
- Your API key is valid
- You haven't exceeded your quota
- Your network connection is stable

### Q: Permission errors in WSL

**A:** Fix file ownership:
```bash
sudo chown -R $USER:$USER ~/projects/claude-code-slack-bot
```

### Q: Git line ending issues in WSL

**A:** Configure Git:
```bash
git config --global core.autocrlf input
```

### Q: Port already in use

**A:** Find and kill the process:
```bash
# Find process on port 3000 (example)
lsof -i :3000

# Kill it
kill -9 <PID>
```

### Q: Module not found errors

**A:** Try:
```bash
# Clear npm cache
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
```

### Q: TypeScript errors

**A:** Rebuild:
```bash
npm run build
```

## Performance

### Q: The bot is using a lot of memory

**A:** This is normal for Node.js applications with active Claude Code sessions. Sessions are automatically cleaned up after 30 minutes of inactivity.

### Q: How do I enable debug logging?

**A:** Set in your `.env`:
```env
DEBUG=true
```

## Development

### Q: How do I contribute?

**A:**
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

### Q: Can I customize the bot's responses?

**A:** Yes! The main logic is in:
- `src/slack-handler.ts` - Message handling
- `src/claude-handler.ts` - Claude integration
- `src/working-directory-manager.ts` - Directory management

### Q: How do I add custom MCP servers?

**A:** Create your MCP server following the [MCP specification](https://modelcontextprotocol.io), then add it to `mcp-servers.json`.

## Getting Help

### Q: Where can I get more help?

**A:**
- **Installation**: [INSTALL.md](INSTALL.md)
- **Windows**: [WINDOWS.md](WINDOWS.md)
- **Usage**: [README.md](README.md)
- **Project Details**: [CLAUDE.md](CLAUDE.md)
- **Issues**: [GitHub Issues](https://github.com/yourusername/claude-code-slack-bot/issues)
- **Claude Code Docs**: [docs.anthropic.com](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview)

### Q: The answer to my question isn't here

**A:** Please open an issue on GitHub with your question. We'll add it to this FAQ!
