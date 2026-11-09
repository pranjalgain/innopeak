# 🚀 App Boilerplate

Welcome to the **App Boilerplate**! 👋 This modern template provides a powerful foundation for b## 🗂️ **Project Structure**

Here's how this monorepo is organized:

```plaintext
app-boilerplate/
├── 📁 apps/                    # Your applications live here
│   └── 📄 documentation/       # Docusaurus documentation site
│       ├── docs/               # Markdown documentation files
│       └── package.json        # App-specific dependencies
│
├── 📁 libs/                    # Shared libraries and utilities
│   └── (coming soon)           # Add your shared code here
│
├── 📄 package.json             # Root workspace configuration
├── 📄 pnpm-workspace.yaml      # pnpm workspace definition
├── 📄 pnpm-lock.yaml           # Locked dependency versions
├── 📄 claude.md                # AI assistant context file
├── 📄 .nvmrc                   # Node.js version specification
│
├── 🔧 Config Files
├── 📄 tsconfig.base.json       # Shared TypeScript configuration
├── 📄 eslint.config.js         # Code linting rules
├── 📄 .prettierrc              # Code formatting rules
├── 📄 .prettierignore          # Prettier ignore patterns
├── 📄 playwright.config.js     # E2E testing configuration
├── 📄 .editorconfig            # Editor consistency settings
├── 📄 .pnpmrc                  # pnpm configuration
└── 📄 .gitignore               # Git ignore patterns
```

## 📋 Key Files Explained

- **`claude.md`**: Comprehensive context for AI assistants working on this project
- **`pnpm-workspace.yaml`**: Defines which directories contain packages  
- **`package.json`**: Root configuration with workspace scripts and shared dependencies
- **`.nvmrc`**: Ensures everyone uses Node.js 20+ for consistencypplications using a **pnpm monorepo** structure. Whether you're a developer, AI assistant, or team lead, this boilerplate is designed to accelerate your development workflow with best practices built-in.

## 🤖 AI & Human Friendly

This project is optimized for both human developers and AI assistants:

- 📋 **AI Context Files**: `claude.md` and app-specific `AGENT.md` files provide comprehensive context for AI assistants
- 📚 **Rich Documentation**: Docusaurus-powered docs with detailed guides and examples
- 🔧 **Automated Workflows**: Pre-configured tools reduce manual setup and maintenance
- 🎯 **Clear Structure**: Intuitive folder organization that both humans and AI can navigate easily

## 🎯 **What's Inside**

This modern boilerplate includes:

- ✅ **pnpm Workspaces**: Fast, efficient package management with frozen dependencies
- ✅ **Multi-App Support**: Ready for Backend (NestJS), Frontend (Next.js), Mobile (Expo), and more
- ✅ **Shared Libraries**: Centralized `libs/` folder for reusable code and utilities
- ✅ **Documentation Hub**: Integrated **Docusaurus** site for project documentation
- ✅ **Quality Tools**: Pre-configured **Playwright**, **ESLint**, **Prettier**, and **TypeScript**
- ✅ **AI-Ready**: Context files and clear structure for seamless AI collaboration

## � **Quick Start**

### Prerequisites

- **Node.js**: >= 24.22.1 (check with `node --version`)
- **pnpm**: This project uses pnpm workspaces (installed automatically via `packageManager` field)

### Step 1: 📥 Clone and Setup

```bash
# Clone your repository
git clone <your-repo-url>
cd <your-project-name>

# Install dependencies (pnpm will be used automatically)
pnpm install
```

### Step 2: 🎯 Start Development

```bash
# Start the documentation site (recommended first step)
pnpm docs:dev
# Visit: http://localhost:3005

# Other available commands:
pnpm docs:build    # Build documentation for production
pnpm docs:clear    # Clear Docusaurus cache
pnpm docs:serve    # Serve built documentation
```

### Step 3: 📱 Add Your Applications

Ready to add your first app? Check out our guides:

- 📖 **Documentation**: Visit the running docs at `http://localhost:3005`
- 🔍 **App-Specific Setup**: Each app in `apps/` has its own README with detailed instructions
- 🤖 **AI Assistance**: Reference `claude.md` for AI context and development guidelines

## 📚 **Documentation Hub**

Your project includes a powerful **Docusaurus** documentation site at `apps/documentation/` that serves as:

- 🏠 **Central Knowledge Base**: All project documentation in one place
- 🔄 **Live Development**: Hot-reload during development for instant feedback  
- 🌐 **Production Ready**: Builds to static files for deployment anywhere

### 📝 Managing Documentation

```bash
# Start the docs development server
pnpm docs:dev
# Access at: http://localhost:3005

# Add new pages by creating .md files in:
apps/documentation/docs/
```

### 📄 Documentation Structure

- `/docs/welcome.md` - Project welcome and overview
- `/docs/new/` - Guides for adding backends, frontends, libs, and tests
- `/docs/PipeLineChanges.md` - CI/CD pipeline configuration guide

> **💡 Pro Tip**: Always document your changes! Both human developers and AI assistants rely on up-to-date documentation.

## 🛠️ **Development Tools**

This boilerplate comes with a carefully curated set of development tools:

### 📦 Package Management

- **pnpm Workspaces**: Fast, efficient package management with shared dependencies
- **Frozen Versions**: All dependencies are pinned to specific versions for reproducible builds
- **Automatic Setup**: `packageManager` field ensures everyone uses the same pnpm version

### 🎨 Code Quality & Formatting

- **Prettier**: Consistent code formatting across all apps and libraries (`.prettierrc`)
- **ESLint**: Modern linting with TypeScript support (`eslint.config.js`)
- **EditorConfig**: Consistent editor settings (`.editorconfig`)

### 🧪 Testing & Quality Assurance

- **Playwright**: Pre-configured for E2E testing (`playwright.config.js`)
- **TypeScript**: Shared base configuration (`tsconfig.base.json`)
- **VS Code**: Workspace settings for optimal development experience

### 🔧 AI Development Support

- **Context Files**: `claude.md` provides comprehensive project context for AI assistants
- **Structured Documentation**: Clear, searchable documentation for both humans and AI
- **Standard Patterns**: Consistent project structure that AI can understand and work with

## 🚀 **Next Steps**

Ready to start building? Here's what to do next:

1. **📖 Read the Docs**: Start the documentation site with `pnpm docs:dev`
2. **🔍 Explore Examples**: Check out the existing documentation structure
3. **➕ Add Your First App**: Follow the guides in `/docs/new/` to add backends, frontends, or libs
4. **🤖 AI Collaboration**: Reference `claude.md` when working with AI assistants
5. **🔄 CI/CD Setup**: See [PipeLineChanges](./apps/documentation/docs/PipeLineChanges.md) for deployment configuration

## 💡 **Tips for Success**

- **🔄 Keep Documentation Updated**: Both humans and AI rely on accurate docs
- **📱 Follow App Patterns**: Each app should have its own README and AGENT.md files
- **🎯 Use pnpm Commands**: Leverage workspace filtering for efficient development
- **🤝 Collaborate with AI**: The project structure is optimized for AI assistance

## 🆘 **Need Help?**

- 📚 **Documentation**: Visit your local docs at `http://localhost:3005`
- 🤖 **AI Context**: Reference `claude.md` for comprehensive project context
- 📝 **App-Specific Help**: Check individual `apps/{app-name}/README.md` files
- 🔧 **Configuration**: All config files are documented and ready to customize

---

✨ **Happy Building!** This boilerplate is designed to grow with your project, whether you're working solo, with a team, or collaborating with AI assistants. 🎉
