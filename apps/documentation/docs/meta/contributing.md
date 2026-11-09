# Contributing Guidelines

## Welcome Contributors

Thank you for your interest in contributing to this project! This guide will help you understand our development workflow and contribution standards.

## Getting Started

### Prerequisites

- **Node.js**: >= 24.22.1 (check `.nvmrc` file)
- **pnpm**: Automatically managed via `packageManager` field
- **Git**: For version control and collaboration

### Initial Setup

1. **Clone the Repository**:

   ```bash
   git clone <repository-url>
   cd <project-name>
   ```

2. **Install Dependencies**:

   ```bash
   pnpm install
   ```

3. **Start Documentation**:

   ```bash
   pnpm docs:dev
   ```

## Development Workflow

### Creating Features

1. **Create Branch**: Create a feature branch from `main`
2. **Develop**: Make your changes following project standards
3. **Document**: Update documentation for any changes
4. **Test**: Ensure all tests pass and builds succeed
5. **Review**: Submit pull request for code review

### Code Standards

#### TypeScript

- Use strict TypeScript configuration
- Provide proper type definitions
- Follow existing code patterns
- Document complex functions and classes

#### Formatting

- **Prettier**: Code is automatically formatted
- **ESLint**: Follow linting rules strictly
- **EditorConfig**: Use consistent editor settings

### Documentation Standards

All changes must include proper documentation:

#### Documentation Requirements

- **New Features**: Document in appropriate app folder under `docs/`
- **API Changes**: Update API reference documentation
- **Breaking Changes**: Highlight in changelog and migration guide
- **Examples**: Include practical usage examples

#### Documentation Format

Follow the [Style Guide](./style-guide.md) for all documentation:

- Use ISO markdown standards
- Follow app-based organization
- Include proper code examples
- Test documentation builds

### Testing Guidelines

#### Test Coverage

- **Unit Tests**: Test individual functions and components
- **Integration Tests**: Test application workflows
- **E2E Tests**: Use Playwright for end-to-end testing
- **Documentation Tests**: Verify examples work correctly

#### Running Tests

```bash
# Run all tests
pnpm test

# Run specific test suites
pnpm test:unit
pnpm test:integration
pnpm test:e2e

# Run documentation build test
pnpm docs:build
```

## Submission Process

### Pull Request Guidelines

#### Before Submitting

1. **Code Quality**: Ensure code passes all linting and formatting
2. **Tests**: All tests must pass
3. **Documentation**: Update relevant documentation
4. **Build**: Verify all applications build successfully

#### PR Description Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] E2E tests pass
- [ ] Documentation builds

## Documentation
- [ ] Updated relevant documentation
- [ ] Added examples if applicable
- [ ] Updated API reference if needed

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Code is properly commented
- [ ] No merge conflicts exist
```

### Review Process

#### Review Criteria

- **Code Quality**: Clean, readable, maintainable code
- **Functionality**: Changes work as expected
- **Testing**: Adequate test coverage
- **Documentation**: Complete and accurate documentation
- **Standards**: Follows project conventions

#### Review Timeline

- **Initial Review**: Within 2 business days
- **Follow-up**: Within 1 business day for revisions
- **Approval**: Requires at least one maintainer approval

## Project Structure

### Adding New Applications

When adding new applications to the monorepo:

1. **Directory**: Create under `apps/` directory
2. **Documentation**: Create app folder under `docs/`
3. **Workspace**: Add to `pnpm-workspace.yaml`
4. **README**: Include comprehensive README.md
5. **AGENT.md**: Add AI assistant context file

### Adding Shared Libraries

When adding shared libraries:

1. **Directory**: Create under `libs/` directory
2. **Documentation**: Document in `docs/shared/`
3. **Exports**: Provide clear public API
4. **Types**: Include TypeScript definitions
5. **Examples**: Provide usage examples

## Community Guidelines

### Communication

- **Respectful**: Treat all contributors with respect
- **Constructive**: Provide helpful, constructive feedback
- **Inclusive**: Welcome contributors of all backgrounds
- **Professional**: Maintain professional tone in all interactions

### Issue Reporting

When reporting issues:

1. **Search First**: Check existing issues before creating new ones
2. **Clear Title**: Use descriptive, specific titles
3. **Reproduction**: Provide steps to reproduce the issue
4. **Environment**: Include relevant system information
5. **Examples**: Provide code examples when applicable

### Feature Requests

When requesting features:

1. **Use Case**: Explain the problem being solved
2. **Alternatives**: Describe alternatives considered
3. **Implementation**: Suggest implementation approach
4. **Breaking Changes**: Note any potential breaking changes

## Recognition

Contributors are recognized through:

- **Changelog**: Major contributions noted in release notes
- **Documentation**: Contributor acknowledgments
- **Community**: Recognition in community discussions

---

*Thank you for contributing to make this project better for everyone!*