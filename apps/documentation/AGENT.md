# 🤖 Documentation App - AI Agent Context

## App Overview

This is the **Docusaurus documentation application** within the monorepo. It serves as the centralized knowledge hub for all project documentation.

## AI Assistant Guidelines

### 📋 Primary Responsibilities

- **Documentation Management**: Create, update, and organize markdown files in `docs/`
- **Structure Maintenance**: Ensure proper app-based folder organization
- **Format Compliance**: Strictly follow ISO markdown guidelines to prevent build failures
- **Content Quality**: Maintain accurate, up-to-date documentation for both humans and AI

### 🗂️ Documentation Organization Rules

#### **Strict Structure Requirements**

1. **App-Based Organization**: Each application gets its own folder under `docs/`

   ```plaintext
   docs/
   ├── backend/           # Backend application docs
   ├── web/               # Web application docs  
   ├── mobile/            # Mobile application docs
   ├── shared/            # Shared libraries docs
   ├── services/          # Cross-app: deployed services, configuration and settings
   ├── infrastructure/    # Cross-app: infrastructure, sizing, secrets, monitoring, releases
   └── meta/              # Project-wide documentation
   ```

   `services/` and `infrastructure/` span the API, worker, web app and docs site, so they sit beside the per-app folders rather than inside one. Keep one source per fact: the environment variable reference lives in `services/configuration-reference.md` and the capacity numbers in `infrastructure/capacity-and-scaling.md`; link to them instead of copying their tables.

2. **Required Files per App Folder**:
   - `overview.md` - App introduction and purpose
   - `setup.md` - Installation and configuration
   - `development.md` - Development guidelines
   - `api-reference.md` - API documentation (if applicable)
   - `troubleshooting.md` - Common issues and solutions

3. **File Naming Convention**: Always use kebab-case (`user-guide.md`, `api-reference.md`)

### 📝 ISO Markdown Standards (CRITICAL)

#### **Must Follow to Prevent Build Failures**

- ✅ **Heading Hierarchy**: Use proper sequence (H1 → H2 → H3, never skip levels)
- ✅ **Blank Lines**: Always add blank lines before and after lists
- ✅ **Code Blocks**: Always specify language (`javascript`, `bash`, `json`)
- ✅ **File Endings**: Single trailing newline at end of every file
- ✅ **No Trailing Spaces**: Remove all trailing whitespace

#### **Common Build-Breaking Errors**

- ❌ `MD040`: Fenced code blocks without language specification
- ❌ `MD001`: Heading levels that increment by more than one
- ❌ `MD032`: Lists without surrounding blank lines
- ❌ `MD047`: Missing trailing newline at end of file
- ❌ `MD009`: Trailing spaces at end of lines

### 🔧 Development Commands

```bash
# From monorepo root:
pnpm docs:dev      # Start development server (localhost:3005)
pnpm docs:build    # Build for production
pnpm docs:clear    # Clear Docusaurus cache
pnpm docs:serve    # Serve production build
```

### 🎯 Content Guidelines

#### **Documentation Quality Standards**

1. **Accuracy**: All information must reflect current code state
2. **Completeness**: Each app folder should have all required files
3. **Clarity**: Write for both technical and non-technical audiences
4. **Examples**: Include code examples and practical use cases
5. **Navigation**: Ensure proper internal linking between documents

#### **AI-Specific Instructions**

- **Always validate markdown**: Check for linting errors before completion
- **Test locally**: Run `pnpm docs:dev` to verify changes work
- **Follow structure**: Never deviate from the app-based organization
- **Update sidebars**: Modify `src/sidebars.js` when adding new sections
- **Cross-reference**: Link related documentation across apps when relevant

### 🚫 Critical Restrictions

- **Never edit** files in `src/` directory (auto-generated Docusaurus UI)
- **Never create** documentation files outside of `docs/` folder
- **Never skip** markdown validation - builds will fail
- **Never use** absolute paths for internal links - use relative paths

### 🔄 Workflow for Documentation Changes

1. **Identify Target**: Determine which app folder the documentation belongs to
2. **Create Structure**: Ensure proper folder and file organization
3. **Write Content**: Follow ISO markdown guidelines strictly
4. **Validate Format**: Check for common markdown errors
5. **Test Locally**: Run development server to verify rendering
6. **Update Navigation**: Modify sidebars if adding new sections

### 📊 Success Metrics

- ✅ All markdown files pass linting without errors
- ✅ Documentation builds successfully with `pnpm docs:build`
- ✅ Content is properly organized by app
- ✅ Navigation is intuitive and complete
- ✅ Examples are current and functional

## Integration with Main Project

This documentation app is tightly integrated with the monorepo:

- **Workspace**: Managed via pnpm workspaces from root
- **Dependencies**: Shared with other apps where possible
- **Build Process**: Part of overall project CI/CD
- **Context**: References and supports all other applications

Remember: **Documentation is code** - treat it with the same quality standards as application code!
