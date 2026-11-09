# 📚 Documentation Hub

Welcome to the centralized documentation for our monorepo project!  
Built with [Docusaurus](https://docusaurus.io/) for modern, searchable, and maintainable documentation. 🚀

## 🚀 Quick Start

### 🛠️ Prerequisites

- **Node.js**: >= 24.22.1 (specified in root `.nvmrc`)
- **pnpm**: Used automatically via `packageManager` field
- **Workspace**: Run commands from the root directory

### 📦 Installation & Development

From the **root directory** of the monorepo:

```bash
# Install all dependencies (including this documentation app)
pnpm install

# Start documentation development server
pnpm docs:dev
# Opens at: http://localhost:3005

# Other available commands:
pnpm docs:build    # Build for production
pnpm docs:clear    # Clear Docusaurus cache
pnpm docs:serve    # Serve production build
```

### 🏗️ Production Build

```bash
# From root directory
pnpm docs:build
```

The output will be in the `build/` directory, ready for deployment.

---

## � Documentation Structure

This documentation follows **ISO format guidelines** and **app-based organization**:

```plaintext
docs/
├── welcome.md                    # Project overview and introduction
├── pipeline-changes.md           # CI/CD configuration guide
├── app-name/                     # One folder per application
│   ├── overview.md               # App overview and architecture
│   ├── setup.md                  # Installation and setup guide
│   ├── api-reference.md          # API documentation (if applicable)
│   ├── development.md            # Development guidelines
│   └── troubleshooting.md        # Common issues and solutions
├── shared/                       # Shared libraries documentation
│   ├── utilities.md              # Utility functions and helpers
│   └── components.md             # Shared components
└── meta/                         # Project meta documentation
    ├── contributing.md           # Contribution guidelines
    ├── style-guide.md            # Documentation style guide
    └── architecture.md           # Overall system architecture
```

### 📋 ISO Format Guidelines

All documentation must follow these **strict markdown guidelines** to prevent build issues:

#### ✅ **Required Standards**

- **File Naming**: Use kebab-case (e.g., `api-reference.md`, `user-guide.md`)
- **Headers**: Use proper heading hierarchy (H1 → H2 → H3, no skipping levels)
- **Lists**: Always add blank lines before and after lists
- **Code Blocks**: Always specify language (`javascript`, `bash`, `json`)
- **Links**: Use proper markdown link syntax `[text](url)`
- **Line Endings**: Single trailing newline at end of file

#### 🚫 **Common Build Errors to Avoid**

- Missing language specification in fenced code blocks
- Inconsistent heading levels (jumping from H1 to H3)
- Lists without surrounding blank lines
- Missing trailing newlines
- Trailing spaces at end of lines

### 🗂️ App Structure

| 📁 Path / File            | 📝 Description                                 |
|---------------------------|-----------------------------------------------|
| `docs/`                   | 📝 All documentation markdown files (ISO format) |
| `src/`                    | ⚛️ Docusaurus UI components (auto-generated) |
| `docusaurus.config.js`    | ⚙️ Docusaurus configuration                   |
| `assets/`                 | 🌄 Static assets (images, files)              |
| `AGENT.md`                | 🤖 AI assistant context for this app         |
| `README.md`               | 📖 This file - app overview                   |
| `package.json`            | 📦 App-specific dependencies                  |

## 🤖 AI Development

This documentation app includes:

- **AGENT.md**: Specific context and rules for AI assistants
- **Structured Content**: Clear organization for both human and AI navigation
- **Build Validation**: Strict markdown guidelines to prevent build failures
- **Live Development**: Hot-reload for immediate feedback during editing

## � Contributing to Documentation

1. **Choose the Right Location**: Place docs in appropriate app folder under `docs/`
2. **Follow ISO Format**: Adhere to markdown guidelines above
3. **Test Locally**: Run `pnpm docs:dev` to verify formatting
4. **Keep Updated**: Documentation should reflect current code state

---

✨ **Happy documenting!** Remember: Good documentation serves both humans and AI assistants! ✨
