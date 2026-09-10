# Shared Libraries

## Overview

This section contains documentation for shared libraries and utilities used across applications in the monorepo.

## Library Organization

Shared code should be organized in the `libs/` directory and documented here.

Documented today:

- [`api-clients.md`](./api-clients.md) - `@innopeak/client-sdk`, the generated OpenAPI client
  (`libs/client_sdk`) that `apps/web` uses to call the backend

Planned, as shared code is added:

- `utilities.md` - Utility functions and helpers
- `components.md` - Shared UI components
- `types.md` - TypeScript type definitions
- `constants.md` - Shared constants and configurations

## Documentation Standards

All shared library documentation must follow:

- **ISO Markdown Format**: Proper heading hierarchy, blank lines around lists
- **Clear Structure**: Consistent organization across all shared libraries
- **Code Examples**: Include practical examples with language specification
- **API Documentation**: Complete function and component documentation

## Usage Guidelines

When documenting shared libraries:

1. **Purpose**: Clearly explain what the library does
2. **Installation**: How to import and use in applications
3. **Examples**: Practical usage examples
4. **API Reference**: Complete parameter and return value documentation
5. **Dependencies**: List any external dependencies

## Next Steps

1. Add your shared libraries to the `libs/` directory
2. Create documentation following the structure above
3. Update this overview with specific library information
4. Ensure all applications can access and use shared code