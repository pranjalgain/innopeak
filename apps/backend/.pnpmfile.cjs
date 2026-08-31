// pnpm hooks configuration
// This file allows you to customize pnpm's behavior during installation

function readPackage(pkg, context) {
  // Log package installation for debugging
  if (context.log) {
    context.log(`Installing package: ${pkg.name}@${pkg.version}`);
  }

  // Ensure peer dependencies are properly handled
  if (pkg.peerDependencies) {
    // You can modify peer dependencies here if needed
    // For example, to make them optional or change versions
  }

  // Handle specific packages that might need special treatment
  switch (pkg.name) {
    case '@nestjs/common':
    case '@nestjs/core':
      // Ensure NestJS packages are properly linked
      break;

    case 'prisma':
      // Ensure Prisma is properly configured
      break;

    default:
      break;
  }

  return pkg;
}

module.exports = {
  hooks: {
    readPackage,
  },
};
